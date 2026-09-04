begin;

-- A session's scheduled values remain event metadata, but they must not
-- prevent an organizer from opening live attendance.  The live session
-- itself (and its actual start/end) is the attendance authority.
create or replace function public.start_event_attendance_session(
  p_event_id uuid,
  p_venue text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_mode text,
  p_late_cutoff_minutes integer default 15
) returns public.event_sessions
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_event public.events; v_session public.event_sessions; v_now timestamptz := now();
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_mode not in ('f2f', 'online') then raise exception 'Invalid attendance mode.' using errcode = '22023'; end if;
  if p_scheduled_end <= p_scheduled_start then raise exception 'The scheduled end must be after the scheduled start.' using errcode = '22023'; end if;
  if p_late_cutoff_minutes not between 0 and 240 then raise exception 'Invalid late cutoff.' using errcode = '22023'; end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501'; end if;
  if v_event.approval_status <> 'approved' or v_event.event_status in ('completed', 'cancelled') then raise exception 'Only an approved active event can start attendance.' using errcode = '22023'; end if;
  if exists (select 1 from public.event_sessions where event_id = p_event_id and session_status = 'ongoing' and coalesce(session_archive_status, 'active') = 'active') then
    raise exception 'This event already has an active attendance session.' using errcode = '23505';
  end if;

  insert into public.event_sessions(event_id, created_by, session_name, venue, mode, session_status, scheduled_start, scheduled_end,
    actual_start, attendance_window_start_at, attendance_window_end_at, late_cutoff_at, session_archive_status)
  values (p_event_id, v_actor, to_char(p_scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') || ' attendance', btrim(p_venue), p_mode,
    'ongoing', p_scheduled_start, p_scheduled_end, v_now, v_now, null, v_now + make_interval(mins => p_late_cutoff_minutes), 'active')
  returning * into v_session;

  update public.events set event_status = 'ongoing', updated_at = v_now where id = p_event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.started', 'event_session', v_session.id, jsonb_build_object('event_id', p_event_id, 'late_cutoff_minutes', p_late_cutoff_minutes));
  return v_session;
end;
$$;

revoke all on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer) from public, anon;
grant execute on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer) to authenticated;

commit;
