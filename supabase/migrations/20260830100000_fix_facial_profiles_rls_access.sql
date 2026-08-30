begin;

-- ISSUE: RPC functions with set search_path = '' cannot properly evaluate private.is_active_organizer()
-- because the private schema is not in the search path, causing RLS policy failures.
-- FIX: Include private schema in search_path for functions that access facial_profiles.

-- Fix get_facial_descriptor_for_organizer
drop function if exists public.get_facial_descriptor_for_organizer(uuid, uuid);

create function public.get_facial_descriptor_for_organizer(
  p_student_id uuid,
  p_event_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public, private'
as $$
declare
  v_actor uuid := (select auth.uid());
  v_descriptor jsonb;
begin
  if v_actor is null or not private.is_active_organizer() then
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

-- Fix identify_event_participant_by_face
drop function if exists public.identify_event_participant_by_face(uuid, jsonb);

create function public.identify_event_participant_by_face(
  p_event_session_id uuid,
  p_live_descriptor jsonb
)
returns table (student_id uuid, similarity double precision)
language plpgsql
security definer
set search_path = 'public, private'
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.is_active_organizer() then
    raise exception 'Only active organizers may identify an enrolled face.' using errcode = '42501';
  end if;

  if p_live_descriptor is null
    or jsonb_typeof(p_live_descriptor) <> 'array'
    or jsonb_array_length(p_live_descriptor) < 32
    or jsonb_array_length(p_live_descriptor) > 4096
    or exists (
      select 1
      from jsonb_array_elements(p_live_descriptor) as element(value)
      where jsonb_typeof(element.value) <> 'number'
    ) then
    raise exception 'A valid live face descriptor is required.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.event_sessions as event_session
    join public.events as event on event.id = event_session.event_id
    join public.organizers as organizer on organizer.id = event.organizer_id
    where event_session.id = p_event_session_id
      and event_session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'The event session is not available for facial verification.' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select facial_profile.student_id, facial_profile.face_descriptor
    from public.event_sessions as event_session
    join public.events as event on event.id = event_session.event_id
    join public.event_participants as participant
      on participant.event_id = event.id
     and participant.participant_status <> 'removed'
    join public.facial_profiles as facial_profile
      on facial_profile.student_id = participant.student_id
     and facial_profile.facial_status = 'activated'
     and facial_profile.face_descriptor is not null
    where event_session.id = p_event_session_id
      and jsonb_array_length(facial_profile.face_descriptor) = jsonb_array_length(p_live_descriptor)
      and not exists (
        select 1
        from jsonb_array_elements(facial_profile.face_descriptor) as element(value)
        where jsonb_typeof(element.value) <> 'number'
      )
  ), scored_candidates as (
    select
      candidate.student_id,
      sum(reference.value::double precision * live.value::double precision)
        / nullif(
          sqrt(sum(power(reference.value::double precision, 2)))
            * sqrt(sum(power(live.value::double precision, 2))),
          0
        ) as similarity
    from candidates as candidate
    join lateral jsonb_array_elements_text(candidate.face_descriptor) with ordinality as reference(value, position)
      on true
    join lateral jsonb_array_elements_text(p_live_descriptor) with ordinality as live(value, position)
      on live.position = reference.position
    group by candidate.student_id
  )
  select scored_candidate.student_id, scored_candidate.similarity
  from scored_candidates as scored_candidate
  where scored_candidate.similarity >= 0.82
  order by scored_candidate.similarity desc
  limit 1;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'facial_participant.identification_requested',
    'event_session',
    p_event_session_id,
    jsonb_build_object('descriptor_dimensions', jsonb_array_length(p_live_descriptor))
  );
end;
$$;

revoke all on function public.identify_event_participant_by_face(uuid, jsonb) from public, anon;
grant execute on function public.identify_event_participant_by_face(uuid, jsonb) to authenticated;

commit;
