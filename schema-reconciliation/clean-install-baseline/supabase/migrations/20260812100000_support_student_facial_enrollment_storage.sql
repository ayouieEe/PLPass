begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facial-enrollments',
  'facial-enrollments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists facial_enrollments_read_self_or_organizer on storage.objects;
create policy facial_enrollments_read_self_or_organizer
on storage.objects
for select
to authenticated
using (
  bucket_id = 'facial-enrollments'
  and (
    ((storage.foldername(name))[1] = (select private.current_student_id())::text)
    or (select private.is_active_organizer())
  )
);

drop policy if exists facial_enrollments_insert_self_once on storage.objects;
create policy facial_enrollments_insert_self_once
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'facial-enrollments'
  and ((storage.foldername(name))[1] = (select private.current_student_id())::text)
);

drop policy if exists facial_profiles_insert_student_once on public.facial_profiles;
create policy facial_profiles_insert_student_once
on public.facial_profiles
for insert
to authenticated
with check (
  student_id = (select private.current_student_id())
);

commit;
