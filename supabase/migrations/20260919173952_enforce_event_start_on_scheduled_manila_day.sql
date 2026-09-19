-- Require the event's saved schedule to be today's Manila calendar day before
-- creating an attendance session. Existing active sessions remain idempotent.
begin;

create or replace function public.start_event_attendance_session(
  p_event_id uuid,
  p_venue text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_mode text,
  p_late_cutoff_minutes integer default 15
) returns public.event_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_today_manila text := to_char(v_now at time zone 'Asia/Manila', 'YYYY-MM-DD');
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_scheduled_start is null
    or p_scheduled_end is null
    or p_mode not in ('f2f', 'online')
    or p_scheduled_end <= p_scheduled_start
    or p_late_cutoff_minutes not between 0 and 240 then
    raise exception 'Invalid attendance session details.' using errcode = '22023';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found
    or v_event.organizer_id <> private.current_organizer_id()
    or v_event.event_status in ('completed', 'cancelled') then
    raise exception 'Only an owned active event can start attendance.' using errcode = '42501';
  end if;

  select * into v_session
  from public.event_sessions
  where event_id = p_event_id
    and session_status = 'ongoing'
    and coalesce(session_archive_status, 'active') = 'active'
  limit 1
  for update;
  if found then return v_session; end if;

  if to_char(v_event.starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD') <> v_today_manila
    or to_char(p_scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') <> v_today_manila then
    raise exception 'Events can only be started on their scheduled Manila date. Reschedule the event to today first.' using errcode = '22023';
  end if;

  select * into v_session
  from public.event_sessions
  where event_id = p_event_id
    and session_status = 'scheduled'
    and coalesce(session_archive_status, 'active') = 'active'
    and to_char(scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') = v_today_manila
  order by scheduled_start desc
  limit 1
  for update;

  if found then
    update public.event_sessions
    set venue = btrim(p_venue),
        mode = p_mode,
        session_status = 'ongoing',
        actual_start = v_now,
        attendance_window_start_at = v_now,
        attendance_window_end_at = null,
        late_cutoff_at = v_now + make_interval(mins => p_late_cutoff_minutes),
        updated_at = v_now
    where id = v_session.id
    returning * into v_session;
  else
    insert into public.event_sessions (
      event_id, created_by, session_name, venue, mode, session_status,
      scheduled_start, scheduled_end, actual_start, attendance_window_start_at,
      attendance_window_end_at, late_cutoff_at, session_archive_status
    ) values (
      p_event_id, v_actor,
      to_char(p_scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') || ' attendance',
      btrim(p_venue), p_mode, 'ongoing', p_scheduled_start, p_scheduled_end,
      v_now, v_now, null, v_now + make_interval(mins => p_late_cutoff_minutes), 'active'
    ) returning * into v_session;
  end if;

  update public.events set event_status = 'ongoing', updated_at = v_now where id = p_event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.started', 'event_session', v_session.id,
    jsonb_build_object('event_id', p_event_id, 'late_cutoff_minutes', p_late_cutoff_minutes));
  return v_session;
end;
$$;

revoke all on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer) from public, anon;
grant execute on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer) to authenticated;

commit;
