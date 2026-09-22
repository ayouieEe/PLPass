begin;

-- Attendance status is based on captured attendance actions. Feedback tasks
-- remain independently actionable and do not create an attendance status.
create or replace function private.enforce_event_attendance_completion()
returns trigger
language plpgsql
security invoker
set search_path = '' as $$
declare
  v_late_cutoff timestamptz;
  v_session_status text;
begin
  if new.attendance_status not in ('present', 'late', 'absent') then
    raise exception 'Attendance status must be Present, Late, or Absent.' using errcode = '23514';
  end if;
  if new.time_out is not null and (new.time_in is null or new.time_out < new.time_in) then
    raise exception 'Time Out must be recorded after Time In.' using errcode = '22023';
  end if;
  if new.event_session_id is null then
    if new.finalized_at is null then new.finalized_at := now(); end if;
    return new;
  end if;

  -- Re-derive only when attendance facts changed. Organizer-approved status
  -- corrections update attendance_status and correction metadata only; those
  -- explicit decisions must remain authoritative over automatic classification.
  if tg_op <> 'INSERT'
     and new.time_in is not distinct from old.time_in
     and new.time_out is not distinct from old.time_out
     and new.event_session_id is not distinct from old.event_session_id then
    return new;
  end if;

  select es.late_cutoff_at, es.session_status
    into v_late_cutoff, v_session_status
  from public.event_sessions es
  where es.id = new.event_session_id;

  if new.time_in is null or (v_session_status = 'completed' and new.time_out is null) then
    new.attendance_status := 'absent';
  elsif v_late_cutoff is not null and new.time_in > v_late_cutoff then
    new.attendance_status := 'late';
  else
    new.attendance_status := 'present';
  end if;
  return new;
end;
$$;

-- Expiring feedback must not erase the captured attendance outcome. Organizer
-- summaries derive the post-deadline Absent result from the expired task.
create or replace function public.expire_overdue_feedback_tasks()
returns integer
language plpgsql
security definer
set search_path = '' as $$
declare
  expired_count integer := 0;
begin
  update public.event_feedback_tasks
  set task_status = 'expired', expired_at = now(), updated_at = now()
  where task_status = 'pending' and due_at <= now();
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

-- Close the session first so the attendance trigger can deterministically
-- classify rows missing Time In or Time Out as Absent.
create or replace function public.end_event_attendance_session(p_session_id uuid, p_reason text)
returns public.event_sessions
language plpgsql
security definer
set search_path = '' as $$
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
  if not found or v_session.session_status <> 'ongoing' then
    raise exception 'Only an active owned session can be ended.' using errcode = '22023';
  end if;

  update public.event_sessions
  set session_status = 'completed', actual_end = v_now,
      ended_reason = btrim(p_reason), updated_at = v_now
  where id = p_session_id
  returning * into v_session;

  update public.attendance_records
  set attendance_status = 'absent',
      finalized_at = v_now,
      remarks = concat_ws(E'\n', remarks, 'Attendance finalized absent: Time In or Time Out was not completed before session close.'),
      updated_at = v_now
  where event_session_id = v_session.id
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

-- Keep the three-state rule explicit for direct database consumers as well as
-- the organizer UI. No attendance record is labeled pending.
alter table public.attendance_records drop constraint if exists attendance_records_status_valid;
alter table public.attendance_records add constraint attendance_records_status_valid
  check (attendance_status in ('present', 'late', 'absent'));

commit;
