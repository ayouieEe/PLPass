begin;

create or replace function public.get_live_facial_candidates(p_event_session_id uuid)
returns table (
  student_id uuid,
  student_number text,
  display_name text,
  enrollment_reference text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may run facial identification.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.event_sessions session
    join public.events event on event.id = session.event_id
    join public.organizers organizer on organizer.id = event.organizer_id
    where session.id = p_event_session_id
      and session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'An owned active attendance session is required.' using errcode = '42501';
  end if;

  return query
  select
    student.id,
    student.student_id,
    concat_ws(' ', profile.first_name, nullif(profile.middle_name, ''), profile.last_name),
    facial_profile.enrollment_reference
  from public.event_sessions session
  join public.event_participants participant
    on participant.event_id = session.event_id
   and participant.participant_status <> 'removed'
  join public.students student on student.id = participant.student_id
  join public.profiles profile on profile.id = student.profile_id
  join public.facial_profiles facial_profile
    on facial_profile.student_id = student.id
   and facial_profile.facial_status = 'activated'
  where session.id = p_event_session_id
  order by student.student_id;
end;
$$;

revoke all on function public.get_live_facial_candidates(uuid) from public, anon;
grant execute on function public.get_live_facial_candidates(uuid) to authenticated;

commit;
