begin;

-- Reconcile offline lifecycle changes only after the organizer reconnects.
-- These SECURITY DEFINER RPCs perform the same ownership checks as the online
-- attendance lifecycle and are executable only by authenticated callers.

create or replace function public.reconcile_offline_event_session_start(
  p_session_id uuid,
  p_actual_start timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_now timestamptz := now();
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_session_id is null or p_actual_start is null or p_actual_start > v_now then
    raise exception 'A valid offline session start time is required.' using errcode = '22023';
  end if;

  select e.* into v_event
  from public.events e
  join public.event_sessions es on es.event_id = e.id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id()
  for update of e;
  if not found then
    raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501';
  end if;

  select es.* into v_session
  from public.event_sessions es
  where es.id = p_session_id and es.event_id = v_event.id
  for update;
  if not found then
    raise exception 'The prepared event session is no longer active.' using errcode = '22023';
  end if;
  if coalesce(v_session.session_archive_status, 'active') <> 'active' then
    raise exception 'The prepared event session is no longer active.' using errcode = '22023';
  end if;

  -- A retry after a lost response is safe, but a different start timestamp is
  -- a conflict and must be reviewed instead of silently overwriting history.
  if v_session.session_status = 'ongoing' then
    if v_session.actual_start is distinct from p_actual_start then
      raise exception 'The server and offline session start times conflict.' using errcode = '40001';
    end if;
    return;
  end if;

  if v_session.session_status <> 'scheduled'
    or v_event.event_status not in ('scheduled', 'ongoing')
    or v_event.approval_status <> 'approved'
    or to_char(v_event.starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD')
       <> to_char(p_actual_start at time zone 'Asia/Manila', 'YYYY-MM-DD')
    or to_char(v_session.scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD')
       <> to_char(p_actual_start at time zone 'Asia/Manila', 'YYYY-MM-DD') then
    raise exception 'The event is no longer eligible for the saved offline start.' using errcode = '22023';
  end if;

  update public.event_sessions
  set session_status = 'ongoing',
      actual_start = p_actual_start,
      attendance_window_start_at = p_actual_start,
      attendance_window_end_at = null,
      updated_at = v_now
  where id = p_session_id
  returning * into v_session;

  update public.events set event_status = 'ongoing', updated_at = v_now where id = v_event.id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.started_offline', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_event.id, 'actual_start', p_actual_start));
  return;
end;
$$;

create or replace function public.reconcile_offline_event_session_end(
  p_session_id uuid,
  p_actual_end timestamptz,
  p_reason text,
  p_expected_student_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_roster_count integer;
  v_unique_expected_count integer;
  v_absent_count integer;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_session_id is null or p_actual_end is null or p_actual_end > v_now
    or p_reason is null or length(btrim(p_reason)) < 5
    or p_expected_student_ids is null then
    raise exception 'Valid offline session end details and the prepared participant list are required.' using errcode = '22023';
  end if;

  select e.* into v_event
  from public.events e
  join public.event_sessions es on es.event_id = e.id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id()
  for update of e;
  if not found then
    raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501';
  end if;

  select es.* into v_session
  from public.event_sessions es
  where es.id = p_session_id and es.event_id = v_event.id
  for update;
  if not found then
    raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501';
  end if;

  -- Make replay after a lost success response idempotent.
  if v_session.session_status = 'completed' and v_session.actual_end = p_actual_end then
    return;
  end if;
  if v_session.session_status <> 'ongoing'
    or coalesce(v_session.session_archive_status, 'active') <> 'active'
    or v_event.event_status <> 'ongoing'
    or v_session.actual_start is null
    or p_actual_end <= v_session.actual_start then
    raise exception 'Only the matching active offline session can be ended.' using errcode = '22023';
  end if;

  select count(*)::integer into v_unique_expected_count
  from (select distinct expected.student_id
        from unnest(p_expected_student_ids) as expected(student_id)) expected;
  if v_unique_expected_count <> cardinality(p_expected_student_ids) then
    raise exception 'The prepared participant list contains duplicate identities.' using errcode = '22023';
  end if;

  select count(*)::integer into v_roster_count
  from public.event_participants ep
  where ep.event_id = v_event.id and ep.participant_status <> 'removed';
  if v_roster_count <> cardinality(p_expected_student_ids)
    or exists (
      select 1 from public.event_participants ep
      where ep.event_id = v_event.id and ep.participant_status <> 'removed'
        and not (ep.student_id = any(p_expected_student_ids))
    ) then
    raise exception 'The event participant list changed after offline preparation; review before finalizing absences.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.attendance_records ar
    where ar.event_session_id = p_session_id
      and greatest(coalesce(ar.time_in, '-infinity'::timestamptz), coalesce(ar.time_out, '-infinity'::timestamptz)) > p_actual_end
  ) then
    raise exception 'An attendance record is later than the saved offline session end.' using errcode = '22023';
  end if;

  -- Local pending attendance must already be acknowledged by the sync RPC.
  -- Only then may the server fill absences for the exact prepared roster.
  insert into public.attendance_records(
    event_session_id, student_id, attendance_status, verification_method,
    recorded_at, recorded_by, remarks
  )
  select p_session_id, ep.student_id, 'absent', 'manual', p_actual_end, v_actor,
    'Automatically marked absent when session ended offline: ' || btrim(p_reason)
  from public.event_participants ep
  where ep.event_id = v_event.id
    and ep.participant_status <> 'removed'
    and ep.student_id = any(p_expected_student_ids)
    and not exists (
      select 1 from public.attendance_records ar
      where ar.event_session_id = p_session_id and ar.student_id = ep.student_id
    )
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;

  update public.event_sessions
  set session_status = 'completed', actual_end = p_actual_end,
      attendance_window_end_at = p_actual_end, ended_reason = btrim(p_reason), updated_at = v_now
  where id = p_session_id
  returning * into v_session;
  update public.events set event_status = 'completed', updated_at = v_now where id = v_event.id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.ended_offline', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_event.id, 'reason', btrim(p_reason),
      'actual_end', p_actual_end, 'automatically_absent', v_absent_count));
  return;
end;
$$;

revoke all on function public.reconcile_offline_event_session_start(uuid, timestamptz) from public, anon;
grant execute on function public.reconcile_offline_event_session_start(uuid, timestamptz) to authenticated;
revoke all on function public.reconcile_offline_event_session_end(uuid, timestamptz, text, uuid[]) from public, anon;
grant execute on function public.reconcile_offline_event_session_end(uuid, timestamptz, text, uuid[]) to authenticated;

commit;
