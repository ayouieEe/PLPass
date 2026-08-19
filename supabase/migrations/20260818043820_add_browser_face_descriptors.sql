begin;

-- Human generates this numerical descriptor in the browser.  It is kept in
-- the existing private facial profile rather than exposed in a public table.
alter table public.facial_profiles
  add column if not exists face_descriptor jsonb,
  add column if not exists descriptor_model text,
  add column if not exists descriptor_updated_at timestamptz;

alter table public.facial_profiles
  drop constraint if exists facial_profiles_descriptor_is_array,
  add constraint facial_profiles_descriptor_is_array
    check (face_descriptor is null or jsonb_typeof(face_descriptor) = 'array');

create or replace function public.store_facial_descriptor(p_face_descriptor jsonb)
returns public.facial_profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_profile public.facial_profiles;
begin
  if p_face_descriptor is null
    or jsonb_typeof(p_face_descriptor) <> 'array'
    or jsonb_array_length(p_face_descriptor) < 32
    or jsonb_array_length(p_face_descriptor) > 4096 then
    raise exception 'A valid face descriptor is required.' using errcode = '22023';
  end if;

  select id into v_student_id
  from public.students
  where profile_id = auth.uid() and student_status = 'enrolled';

  if v_student_id is null then
    raise exception 'An active student account is required.' using errcode = '42501';
  end if;

  update public.facial_profiles
  set face_descriptor = p_face_descriptor,
      descriptor_model = 'human-hse-faceres',
      descriptor_updated_at = now(),
      updated_at = now()
  where student_id = v_student_id and facial_status = 'activated'
  returning * into v_profile;

  if not found then
    raise exception 'An active facial profile is required.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'facial_descriptor.stored', 'facial_profile', v_profile.id,
    jsonb_build_object('model', 'human-hse-faceres', 'dimensions', jsonb_array_length(p_face_descriptor)));

  return v_profile;
end;
$$;

revoke all on function public.store_facial_descriptor(jsonb) from public, anon;
grant execute on function public.store_facial_descriptor(jsonb) to authenticated;

commit;
