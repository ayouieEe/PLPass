insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-request-proofs',
  'attendance-request-proofs',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists attendance_request_proofs_read on storage.objects;
create policy attendance_request_proofs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance-request-proofs'
    and (
      (storage.foldername(name))[1] = (select private.current_student_id())::text
      or (select private.is_active_organizer())
    )
  );

drop policy if exists attendance_request_proofs_insert_self on storage.objects;
create policy attendance_request_proofs_insert_self on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-request-proofs'
    and (storage.foldername(name))[1] = (select private.current_student_id())::text
  );

drop policy if exists attendance_request_proofs_delete_self on storage.objects;
create policy attendance_request_proofs_delete_self on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attendance-request-proofs'
    and (storage.foldername(name))[1] = (select private.current_student_id())::text
  );
