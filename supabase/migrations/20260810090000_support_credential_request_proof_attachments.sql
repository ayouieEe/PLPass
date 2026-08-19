insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'credential-request-proofs',
  'credential-request-proofs',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- This table may already exist in projects where the attachment feature was
-- provisioned before its migration history was recorded. Keep that data and
-- continue applying the access controls below.
create table if not exists public.credential_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.credential_requests(id) on delete cascade,
  storage_bucket text not null,
  storage_object_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  uploaded_at timestamptz not null default now(),
  constraint credential_request_attachments_bucket_not_blank check (btrim(storage_bucket) <> ''),
  constraint credential_request_attachments_path_not_blank check (btrim(storage_object_path) <> ''),
  constraint credential_request_attachments_name_not_blank check (btrim(original_file_name) <> ''),
  constraint credential_request_attachments_size_valid check (file_size_bytes > 0),
  constraint credential_request_attachments_request_path_unique unique (request_id, storage_object_path)
);

create index if not exists credential_request_attachments_request_id_idx
  on public.credential_request_attachments (request_id);

alter table public.credential_request_attachments enable row level security;

grant select, insert, delete on public.credential_request_attachments to authenticated;

drop policy if exists credential_request_attachments_read on public.credential_request_attachments;
create policy credential_request_attachments_read on public.credential_request_attachments
  for select to authenticated
  using (exists (
    select 1
    from public.credential_requests
    where credential_requests.id = credential_request_attachments.request_id
      and (
        credential_requests.student_id = (select private.current_student_id())
        or (select private.is_active_organizer())
      )
  ));

drop policy if exists credential_request_attachments_insert_self on public.credential_request_attachments;
create policy credential_request_attachments_insert_self on public.credential_request_attachments
  for insert to authenticated
  with check (exists (
    select 1
    from public.credential_requests
    where credential_requests.id = credential_request_attachments.request_id
      and credential_requests.student_id = (select private.current_student_id())
      and credential_requests.request_status = 'pending'
  ));

drop policy if exists credential_request_attachments_delete_self on public.credential_request_attachments;
create policy credential_request_attachments_delete_self on public.credential_request_attachments
  for delete to authenticated
  using (exists (
    select 1
    from public.credential_requests
    where credential_requests.id = credential_request_attachments.request_id
      and credential_requests.student_id = (select private.current_student_id())
      and credential_requests.request_status = 'pending'
  ));

drop policy if exists credential_request_proofs_read on storage.objects;
create policy credential_request_proofs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'credential-request-proofs'
    and (
      (storage.foldername(name))[1] = (select private.current_student_id())::text
      or (select private.is_active_organizer())
    )
  );

drop policy if exists credential_request_proofs_insert_self on storage.objects;
create policy credential_request_proofs_insert_self on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'credential-request-proofs'
    and (storage.foldername(name))[1] = (select private.current_student_id())::text
  );

drop policy if exists credential_request_proofs_delete_self on storage.objects;
create policy credential_request_proofs_delete_self on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'credential-request-proofs'
    and (storage.foldername(name))[1] = (select private.current_student_id())::text
  );
