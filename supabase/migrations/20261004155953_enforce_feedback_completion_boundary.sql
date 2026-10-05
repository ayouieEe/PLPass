begin;

-- A completed Time In/Time Out pair is still provisional while its feedback
-- task is pending. Only feedback completion or deadline expiry may finalize it.
create or replace function private.prevent_pending_feedback_finalization()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.finalized_at is not null
     and new.attendance_status in ('present', 'late')
     and exists (
       select 1
       from public.event_feedback_tasks task
       where task.attendance_record_id = new.id
         and task.task_status = 'pending'
         and task.due_at > now()
     ) then
    new.finalized_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_prevent_pending_feedback_finalization on public.attendance_records;
create trigger attendance_records_prevent_pending_feedback_finalization
before insert or update of finalized_at, attendance_status on public.attendance_records
for each row execute function private.prevent_pending_feedback_finalization();

-- Keep deadline expiry authoritative: an uncompleted task becomes an absent,
-- finalized attendance outcome in the same transaction.
create or replace function public.expire_overdue_feedback_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
begin
  with expired as (
    update public.event_feedback_tasks
    set task_status = 'expired', expired_at = now(), updated_at = now()
    where task_status = 'pending' and due_at <= now()
    returning attendance_record_id
  ), updated as (
    update public.attendance_records ar
    set attendance_status = 'absent',
        finalized_at = coalesce(ar.finalized_at, now()),
        remarks = concat_ws(E'\\n', ar.remarks, 'Attendance changed to absent: required feedback was not submitted within 24 hours.'),
        updated_at = now()
    from expired
    where ar.id = expired.attendance_record_id
    returning ar.id
  )
  select count(*) into expired_count from updated;
  return expired_count;
end;
$$;

revoke all on function public.expire_overdue_feedback_tasks() from public, anon, authenticated;

-- Ending a session must leave complete attendance rows provisional. The
-- session-completion trigger creates the feedback task after this update.
create or replace function public.end_event_attendance_session(p_session_id uuid, p_reason text)
returns public.event_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_absent_count integer := 0;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'An ending reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id()
  for update of es;

  if not found then
    raise exception 'Only an active owned session can be ended.' using errcode = '22023';
  end if;

  if v_session.session_status = 'completed' then
    if v_session.ended_reason is distinct from btrim(p_reason) then
      raise exception 'The session was already ended with a different reason.' using errcode = '40001';
    end if;
    return v_session;
  end if;

  if v_session.session_status <> 'ongoing' then
    raise exception 'Only an active owned session can be ended.' using errcode = '22023';
  end if;

  update public.event_sessions
  set session_status = 'completed', actual_end = v_now,
      ended_reason = btrim(p_reason), updated_at = v_now
  where id = p_session_id
  returning * into v_session;

  -- Do not finalize complete pairs here. The after-session trigger creates
  -- their pending feedback tasks, and the task/deadline RPCs own finalization.
  update public.attendance_records
  set attendance_status = 'absent',
      finalized_at = v_now,
      remarks = concat_ws(E'\\n', remarks, 'Attendance finalized absent: Time In or Time Out was not completed before session close.'),
      updated_at = v_now
  where event_session_id = v_session.id
    and finalized_at is null
    and (time_in is null or time_out is null);

  insert into public.attendance_records(event_session_id, student_id, attendance_status,
    verification_method, recorded_at, recorded_by, remarks, finalized_at)
  select v_session.id, ep.student_id, 'absent', 'manual', v_now, v_actor,
    'Automatically marked absent when session ended: no attendance was recorded.', v_now
  from public.event_participants ep
  where ep.event_id = v_session.event_id
    and ep.participant_status <> 'removed'
    and not exists (
      select 1 from public.attendance_records ar
      where ar.event_session_id = v_session.id and ar.student_id = ep.student_id
    )
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;

  update public.events set event_status = 'completed', updated_at = v_now
  where id = v_session.event_id;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.ended', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'automatically_absent', v_absent_count));
  return v_session;
end;
$$;

revoke all on function public.end_event_attendance_session(uuid, text) from public, anon;
grant execute on function public.end_event_attendance_session(uuid, text) to authenticated;

-- Repair rows created by the previous close function. Expired tasks are
-- finalized absent first; still-actionable tasks are returned to provisional.
select public.expire_overdue_feedback_tasks();
update public.attendance_records ar
set finalized_at = null, updated_at = now()
from public.event_feedback_tasks task
where task.attendance_record_id = ar.id
  and task.task_status = 'pending'
  and task.due_at > now()
  and ar.attendance_status in ('present', 'late')
  and ar.time_in is not null
  and ar.time_out is not null
  and ar.finalized_at is not null;

commit;
