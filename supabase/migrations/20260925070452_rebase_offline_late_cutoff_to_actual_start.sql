begin;

-- Offline packages are prepared with a scheduled cutoff.  When they start,
-- preserve that configured number of minutes but count it from actual_start.
-- This matches the online start RPC and keeps early/late starts fair.
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
  v_late_cutoff_minutes integer := 15;
  v_prepared_start timestamptz;
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
  if not found or coalesce(v_session.session_archive_status, 'active') <> 'active' then
    raise exception 'The prepared event session is no longer active.' using errcode = '22023';
  end if;

  -- A retry after a lost response is safe and must not rewrite a cutoff that
  -- was already anchored to the actual start.
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

  v_prepared_start := coalesce(v_session.attendance_window_start_at, v_session.scheduled_start);
  if v_prepared_start is not null and v_session.late_cutoff_at is not null then
    v_late_cutoff_minutes := greatest(0, least(240,
      round(extract(epoch from (v_session.late_cutoff_at - v_prepared_start)) / 60.0)::integer
    ));
  end if;

  update public.event_sessions
  set session_status = 'ongoing',
      actual_start = p_actual_start,
      attendance_window_start_at = p_actual_start,
      attendance_window_end_at = null,
      late_cutoff_at = p_actual_start + make_interval(mins => v_late_cutoff_minutes),
      updated_at = v_now
  where id = p_session_id;

  update public.events set event_status = 'ongoing', updated_at = v_now where id = v_event.id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.started_offline', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_event.id, 'actual_start', p_actual_start,
      'late_cutoff_minutes', v_late_cutoff_minutes));
end;
$$;

revoke all on function public.reconcile_offline_event_session_start(uuid, timestamptz) from public, anon;
grant execute on function public.reconcile_offline_event_session_start(uuid, timestamptz) to authenticated;

commit;
