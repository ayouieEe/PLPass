-- Repair the student legal-access gate and the department-admin credential
-- read policies. The original legal migration version collided with another
-- migration, and the database history contains that version without these
-- schema objects. Keep this forward migration safe to re-run on a partially
-- repaired database.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  constraint legal_acceptances_document_type_valid check (document_type in ('terms', 'privacy')),
  constraint legal_acceptances_document_version_not_blank check (btrim(document_version) <> ''),
  constraint legal_acceptances_user_document_version_unique unique (user_id, document_type, document_version)
);

create index if not exists legal_acceptances_user_id_idx on public.legal_acceptances(user_id);
alter table public.legal_acceptances enable row level security;
grant select, insert on table public.legal_acceptances to authenticated;

drop policy if exists "Students can view their own legal acceptances" on public.legal_acceptances;
create policy "Students can view their own legal acceptances"
  on public.legal_acceptances
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'student')
  );

drop policy if exists "Students can record their own legal acceptances" on public.legal_acceptances;
create policy "Students can record their own legal acceptances"
  on public.legal_acceptances
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'student')
  );

drop policy if exists department_admin_read_qr_credentials on public.qr_credentials;
create policy department_admin_read_qr_credentials
  on public.qr_credentials
  for select to authenticated
  using (
    (select private.is_active_department_admin())
    and exists (
      select 1
      from public.students student
      where student.id = qr_credentials.student_id
        and student.department_id = (select private.current_department_id())
    )
  );

drop policy if exists department_admin_read_facial_profiles on public.facial_profiles;
create policy department_admin_read_facial_profiles
  on public.facial_profiles
  for select to authenticated
  using (
    (select private.is_active_department_admin())
    and exists (
      select 1
      from public.students student
      where student.id = facial_profiles.student_id
        and student.department_id = (select private.current_department_id())
    )
  );
