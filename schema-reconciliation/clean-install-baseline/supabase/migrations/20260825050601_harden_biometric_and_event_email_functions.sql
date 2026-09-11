begin;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Require
-- every future Data API function to be granted deliberately instead.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

drop function if exists public.get_facial_descriptor_for_organizer(uuid);

create function public.get_facial_descriptor_for_organizer(
  p_student_id uuid,
  p_event_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_descriptor jsonb;
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may verify a facial enrollment.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.event_sessions as event_session
    join public.events as event on event.id = event_session.event_id
    join public.organizers as organizer on organizer.id = event.organizer_id
    join public.event_participants as participant
      on participant.event_id = event.id
     and participant.student_id = p_student_id
     and participant.participant_status <> 'removed'
    where event_session.id = p_event_session_id
      and event_session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'The student is not eligible for facial verification in this session.' using errcode = '42501';
  end if;

  select facial_profile.face_descriptor
    into v_descriptor
  from public.facial_profiles as facial_profile
  where facial_profile.student_id = p_student_id
    and facial_profile.facial_status = 'activated';

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'facial_descriptor.accessed',
    'student',
    p_student_id,
    jsonb_build_object('event_session_id', p_event_session_id, 'descriptor_found', v_descriptor is not null)
  );

  return v_descriptor;
end;
$$;

revoke all on function public.get_facial_descriptor_for_organizer(uuid, uuid) from public, anon;
grant execute on function public.get_facial_descriptor_for_organizer(uuid, uuid) to authenticated;

alter function private.queue_attendance_request_progress_email() set search_path = '';
alter function private.queue_credential_request_progress_email() set search_path = '';
alter function private.queue_event_student_email(uuid, uuid, text, timestamptz) set search_path = '';
alter function private.queue_event_student_emails_for_event(uuid, text, timestamptz) set search_path = '';
alter function private.queue_event_email_after_participant_insert() set search_path = '';
alter function private.queue_event_email_after_reschedule() set search_path = '';
alter function public.queue_emails_for_event(uuid) set search_path = '';

revoke all on function private.queue_event_student_email(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.queue_event_student_emails_for_event(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.queue_event_email_after_participant_insert() from public, anon, authenticated;
revoke all on function private.queue_event_email_after_reschedule() from public, anon, authenticated;

create or replace function public.log_client_action(
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may log client actions.' using errcode = '42501';
  end if;

  if p_action is null or btrim(p_action) = '' or length(p_action) > 120 then
    raise exception 'A valid action of at most 120 characters is required.' using errcode = '22023';
  end if;

  if p_target_type is null or btrim(p_target_type) = '' or length(p_target_type) > 80 then
    raise exception 'A valid target type of at most 80 characters is required.' using errcode = '22023';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or pg_column_size(p_metadata) > 16384 then
    raise exception 'Audit metadata must be an object no larger than 16 KiB.' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_uid, btrim(p_action), btrim(p_target_type), p_target_id, p_metadata);
end;
$$;

revoke all on function public.log_client_action(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_client_action(text, text, uuid, jsonb) to authenticated;

commit;
