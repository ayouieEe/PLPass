begin;

-- Make verification_method nullable since absent/unverified students have no method.
-- Only present/late students should have a verification method recorded.

alter table public.attendance_records
  alter column verification_method drop not null;

-- Update the constraint to allow NULL and the valid methods
alter table public.attendance_records
  drop constraint if exists attendance_records_method_valid;

alter table public.attendance_records
  add constraint attendance_records_method_valid
  check (verification_method is null or verification_method in ('qr', 'facial', 'manual', 'online'));

-- Update existing absent records to have null verification_method
update public.attendance_records
  set verification_method = null
  where attendance_status = 'absent' and verification_method is not null;

-- Update the end_event_attendance_session function to not set verification_method for absent
create or replace function public.end_event_attendance_session(p_session_id uuid, p_reason text)
returns public.event_sessions
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session public.event_sessions; v_now timestamptz := now(); v_absent_count integer;
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'An ending reason of at least 5 characters is required.' using errcode = '22023'; end if;
  select es.* into v_session from public.event_sessions es join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id() for update of es;
  if not found then raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501'; end if;
  if v_session.session_status <> 'ongoing' then raise exception 'Only an active session can be ended.' using errcode = '22023'; end if;
  insert into public.attendance_records(event_session_id, student_id, attendance_status, verification_method, recorded_at, recorded_by, remarks)
  select v_session.id, ep.student_id, 'absent', null, v_now, v_actor, 'Automatically marked absent when session ended: ' || btrim(p_reason)
  from public.event_participants ep
  where ep.event_id = v_session.event_id and ep.participant_status <> 'removed'
    and not exists (select 1 from public.attendance_records ar where ar.event_session_id = v_session.id and ar.student_id = ep.student_id)
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;
  update public.event_sessions set session_status = 'completed', actual_end = v_now, ended_reason = btrim(p_reason), updated_at = v_now
  where id = p_session_id returning * into v_session;
  update public.events set event_status = 'completed', updated_at = v_now where id = v_session.event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.ended', 'event_session', p_session_id, jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'automatically_absent', v_absent_count));
  return v_session;
end;
$$;

revoke all on function public.end_event_attendance_session(uuid, text) from public, anon;
grant execute on function public.end_event_attendance_session(uuid, text) to authenticated;

commit;
