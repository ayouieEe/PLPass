begin;

-- An organizer may undo an accidentally started session only before any
-- attendance has been recorded. This returns the event to its scheduled state.
create or replace function public.discard_empty_event_session(p_session_id uuid)
returns public.event_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id()
  for update of es;

  if not found then
    raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501';
  end if;

  if v_session.session_status <> 'ongoing' then
    raise exception 'Only a live session can be discarded.' using errcode = '22023';
  end if;

  if exists (select 1 from public.attendance_records where event_session_id = p_session_id) then
    raise exception 'A session with attendance records cannot be discarded.' using errcode = '22023';
  end if;

  update public.event_sessions
  set session_status = 'cancelled',
      actual_end = now(),
      ended_reason = 'Discarded before attendance was recorded.',
      updated_at = now()
  where id = p_session_id
  returning * into v_session;

  update public.events
  set event_status = 'scheduled', updated_at = now()
  where id = v_session.event_id
    and event_status = 'ongoing';

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.discarded', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_session.event_id));

  return v_session;
end;
$$;

revoke all on function public.discard_empty_event_session(uuid) from public, anon;
grant execute on function public.discard_empty_event_session(uuid) to authenticated;

commit;
