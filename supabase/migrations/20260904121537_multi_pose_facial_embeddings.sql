begin;

-- These are biometric templates, not photographs.  RLS is intentionally
-- deny-by-default; reads happen only through the organizer-scoped RPC below.
create table if not exists public.student_face_embeddings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  pose text not null check (pose in ('front', 'left', 'right')),
  embedding jsonb not null check (jsonb_typeof(embedding) = 'array' and jsonb_array_length(embedding) between 256 and 1024),
  model_name text not null,
  detector_backend text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, pose)
);

alter table public.student_face_embeddings enable row level security;
revoke all on public.student_face_embeddings from anon, authenticated;

create or replace function public.store_student_face_embedding(
  p_pose text,
  p_embedding jsonb,
  p_model_name text,
  p_detector_backend text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_complete boolean;
begin
  select * into v_student
  from public.students
  where profile_id = (select auth.uid()) and student_status = 'enrolled'
  for update;
  if not found then raise exception 'An active student account is required.' using errcode = '42501'; end if;
  if p_pose not in ('front', 'left', 'right') then raise exception 'INVALID_POSE' using errcode = '22023'; end if;
  if p_embedding is null or jsonb_typeof(p_embedding) <> 'array' or jsonb_array_length(p_embedding) <> 512 then
    raise exception 'A valid ArcFace embedding is required.' using errcode = '22023';
  end if;
  if p_model_name <> 'ArcFace' or p_detector_backend <> 'retinaface' then
    raise exception 'PLPass requires the ArcFace and RetinaFace enrollment configuration.' using errcode = '22023';
  end if;
  if v_student.initial_facial_enrollment_completed_at is not null then
    raise exception 'ALREADY_ENROLLED' using errcode = '42501';
  end if;

  insert into public.student_face_embeddings (student_id, pose, embedding, model_name, detector_backend)
  values (v_student.id, p_pose, p_embedding, p_model_name, p_detector_backend)
  on conflict (student_id, pose) do update
  set embedding = excluded.embedding, model_name = excluded.model_name, detector_backend = excluded.detector_backend, updated_at = now();

  select count(*) = 3 into v_complete from public.student_face_embeddings where student_id = v_student.id;
  if v_complete then
    insert into public.facial_profiles (student_id, enrollment_reference, facial_status, enrolled_at, consent_recorded_at, updated_at)
    values (v_student.id, 'embedding:' || v_student.id::text, 'activated', now(), now(), now())
    on conflict (student_id) do update set facial_status = 'activated', enrolled_at = excluded.enrolled_at, updated_at = now();
    update public.students set initial_facial_enrollment_completed_at = now(), updated_at = now() where id = v_student.id;
  end if;
  return jsonb_build_object('complete', v_complete, 'completed_poses', coalesce((select jsonb_agg(pose order by pose) from public.student_face_embeddings where student_id = v_student.id), '[]'::jsonb));
end;
$$;

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
    where session.id = p_event_session_id and session.session_status = 'ongoing' and organizer.profile_id = v_actor
  ) then raise exception 'SESSION_NOT_ACTIVE' using errcode = '42501'; end if;
  return query
  select student.id, student.student_number,
         concat_ws(' ', profile.first_name, nullif(profile.middle_name, ''), profile.last_name)
  from public.event_sessions session
  join public.event_participants participant on participant.event_id = session.event_id and participant.participant_status <> 'removed'
  join public.students student on student.id = participant.student_id
  join public.profiles profile on profile.id = student.profile_id
  join public.facial_profiles facial_profile on facial_profile.student_id = student.id and facial_profile.facial_status = 'activated'
  join public.student_face_embeddings embedding on embedding.student_id = student.id and embedding.model_name = 'ArcFace' and embedding.detector_backend = 'retinaface'
  where session.id = p_event_session_id
  group by student.id, student.student_number, profile.first_name, profile.middle_name, profile.last_name
  having count(embedding.id) = 3
  order by student.student_number;
end;
$$;

revoke all on function public.store_student_face_embedding(text, jsonb, text, text) from public, anon;
grant execute on function public.store_student_face_embedding(text, jsonb, text, text) to authenticated;
revoke all on function public.get_live_facial_candidate_ids(uuid) from public, anon;
grant execute on function public.get_live_facial_candidate_ids(uuid) to authenticated;

commit;
