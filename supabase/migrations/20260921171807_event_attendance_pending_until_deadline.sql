begin;

-- Keep incomplete event attendance provisional until the feedback deadline.
-- The attendance_status column intentionally remains limited to the three
-- final outcomes; pending is represented by finalized_at IS NULL in the UI.

create or replace function private.finalize_incomplete_event_attendance_after_session()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  -- Do not create or finalize missing/incomplete rows at session close.
  -- Complete time pairs already receive feedback tasks from the existing
  -- completion trigger; incomplete rows remain provisional.
  return new;
end;
$$;

create or replace function public.end_event_attendance_session(p_session_id uuid, p_reason text)
returns public.event_sessions
language plpgsql
security definer
set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
  v_now timestamptz := now();
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
  set session_status = 'completed',
      actual_end = v_now,
      ended_reason = btrim(p_reason),
      updated_at = v_now
  where id = p_session_id
  returning * into v_session;

  update public.events
  set event_status = 'completed', updated_at = v_now
  where id = v_session.event_id;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'attendance_session.ended',
    'event_session',
    p_session_id,
    jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'pending_until', v_now + interval '24 hours')
  );

  return v_session;
end;
$$;

create or replace function public.expire_overdue_feedback_tasks()
returns integer
language plpgsql
security definer
set search_path = '' as $$
declare
  v_finalized_count integer := 0;
begin
  -- Feedback tasks expire first. Their attendance rows become final Absent.
  with expired as (
    update public.event_feedback_tasks
    set task_status = 'expired', expired_at = now(), updated_at = now()
    where task_status = 'pending' and due_at <= now()
    returning attendance_record_id
  ), updated as (
    update public.attendance_records ar
    set attendance_status = 'absent',
        finalized_at = coalesce(ar.finalized_at, now()),
        remarks = concat_ws(E'\n', ar.remarks, 'Attendance finalized absent: required feedback was not submitted within 24 hours.'),
        updated_at = now()
    from expired
    where ar.id = expired.attendance_record_id
      and ar.finalized_at is null
    returning ar.id
  )
  select count(*) into v_finalized_count from updated;

  -- Students with no row, or with incomplete Time In/Time Out, also become
  -- final Absent once the session-level 24-hour deadline has passed.
  with overdue_sessions as (
    select id, event_id, actual_end
    from public.event_sessions
    where session_status = 'completed'
      and actual_end is not null
      and actual_end + interval '24 hours' <= now()
  ), updated as (
    update public.attendance_records ar
    set attendance_status = 'absent',
        finalized_at = coalesce(ar.finalized_at, now()),
        remarks = concat_ws(E'\n', ar.remarks, 'Attendance finalized absent: required attendance steps were not completed within 24 hours.'),
        updated_at = now()
    from overdue_sessions os
    where ar.event_session_id = os.id
      and ar.finalized_at is null
      and (ar.time_in is null or ar.time_out is null or not exists (
        select 1 from public.event_feedback_tasks task
        where task.attendance_record_id = ar.id and task.task_status = 'completed'
      ))
    returning ar.id
  )
  select v_finalized_count + count(*) into v_finalized_count from updated;

  insert into public.attendance_records(
    event_session_id, student_id, attendance_status, verification_method,
    recorded_at, recorded_by, remarks, finalized_at
  )
  select os.id, ep.student_id, 'absent', 'manual', coalesce(os.actual_end, now()), auth.uid(),
    'Automatically marked absent after the attendance completion deadline.', coalesce(os.actual_end, now())
  from (
    select id, event_id, actual_end
    from public.event_sessions
    where session_status = 'completed'
      and actual_end is not null
      and actual_end + interval '24 hours' <= now()
  ) os
  join public.event_participants ep on ep.event_id = os.event_id and ep.participant_status <> 'removed'
  where not exists (
    select 1 from public.attendance_records ar
    where ar.event_session_id = os.id and ar.student_id = ep.student_id
  )
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;

  get diagnostics v_finalized_count = row_count;
  return v_finalized_count;
end;
$$;

commit;
