begin;

create or replace function public.get_live_facial_candidate_ids(p_event_session_id uuid)
returns table (student_id uuid, student_number text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may run facial identification.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.event_sessions session
    join public.events event on event.id = session.event_id
    join public.organizers organizer on organizer.id = event.organizer_id
    where session.id = p_event_session_id
      and session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'SESSION_NOT_ACTIVE' using errcode = '42501';
  end if;

  return query
  select student.id, student.student_id,
         concat_ws(' ', profile.first_name, nullif(profile.middle_name, ''), profile.last_name)
  from public.event_sessions session
  join public.event_participants participant on participant.event_id = session.event_id and participant.participant_status <> 'removed'
  join public.students student on student.id = participant.student_id
  join public.profiles profile on profile.id = student.profile_id
  join public.facial_profiles facial_profile on facial_profile.student_id = student.id and facial_profile.facial_status = 'activated'
  join public.student_face_embeddings embedding on embedding.student_id = student.id and embedding.model_name = 'ArcFace' and embedding.detector_backend = 'retinaface'
  where session.id = p_event_session_id
  group by student.id, student.student_id, profile.first_name, profile.middle_name, profile.last_name
  having count(embedding.id) = 3
  order by student.student_id;
end;
$$;

revoke all on function public.get_live_facial_candidate_ids(uuid) from public, anon;
grant execute on function public.get_live_facial_candidate_ids(uuid) to authenticated;

commit;
