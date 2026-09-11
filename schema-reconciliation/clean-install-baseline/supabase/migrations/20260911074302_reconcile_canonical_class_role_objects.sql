-- Canonical clean-install reconciliation only.
--
-- This restores the current class-capable application contract after the
-- historical event-only cleanup. It intentionally preserves event_sessions,
-- attendance_records.event_session_id, and verification_attempts.event_session_id.
-- It must never be used as a production-forward migration.

begin;

alter table public.profiles
  drop constraint profiles_role_valid,
  drop constraint profiles_role_identifier_valid,
  add constraint profiles_role_valid check (role in ('organizer', 'student', 'faculty', 'admin')),
  add constraint profiles_role_identifier_valid check (
    (role in ('organizer', 'faculty', 'admin') and employee_id is not null and student_id is null)
    or (role = 'student' and student_id is not null and employee_id is null)
  );

create table public.faculty_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  employee_number text not null unique,
  employment_status text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faculty_profiles_employee_number_not_blank check (btrim(employee_number) <> ''),
  constraint faculty_profiles_employment_status_not_blank check (btrim(employment_status) <> ''),
  constraint faculty_profiles_title_not_blank check (btrim(title) <> '')
);

create table public.admin_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  employee_number text not null unique,
  office_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_profiles_employee_number_not_blank check (btrim(employee_number) <> ''),
  constraint admin_profiles_office_name_not_blank check (btrim(office_name) <> '')
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.profiles(id) on delete restrict,
  program_id uuid not null references public.programs(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  subject_code text not null,
  subject_title text not null,
  room text not null,
  section_id uuid not null references public.sections(id) on delete restrict,
  year_level smallint not null,
  schedule_label text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_subject_code_not_blank check (btrim(subject_code) <> ''),
  constraint classes_subject_title_not_blank check (btrim(subject_title) <> ''),
  constraint classes_room_not_blank check (btrim(room) <> ''),
  constraint classes_schedule_label_not_blank check (btrim(schedule_label) <> ''),
  constraint classes_year_level_valid check (year_level between 1 and 8),
  constraint classes_status_valid check (status in ('active', 'archived'))
);

create table public.class_rosters (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  constraint class_rosters_class_id_student_id_key unique (class_id, student_id)
);

create index faculty_profiles_department_id_idx on public.faculty_profiles (department_id);
create index admin_profiles_department_id_idx on public.admin_profiles (department_id);
create index classes_faculty_id_idx on public.classes (faculty_id);
create index classes_program_id_idx on public.classes (program_id);
create index classes_department_id_idx on public.classes (department_id);
create index classes_semester_id_idx on public.classes (semester_id);
create index classes_section_id_idx on public.classes (section_id);
create index classes_status_idx on public.classes (status);
create unique index classes_offering_identity_unique_idx
  on public.classes (program_id, section_id, semester_id, lower(subject_code), schedule_label);
create index class_rosters_class_id_idx on public.class_rosters (class_id);
create index class_rosters_student_id_idx on public.class_rosters (student_id);

create or replace function private.is_active_faculty()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles
      join public.faculty_profiles on faculty_profiles.profile_id = profiles.id
      where profiles.id = (select auth.uid())
        and profiles.role = 'faculty'
        and profiles.account_status = 'active'
        and faculty_profiles.employment_status not in ('inactive', 'resigned')
    );
$$;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles
      join public.admin_profiles on admin_profiles.profile_id = profiles.id
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
        and profiles.account_status = 'active'
    );
$$;

create or replace function private.is_class_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_active_organizer()) or (select private.is_active_admin());
$$;

revoke all on function private.is_active_faculty() from public, anon, authenticated;
revoke all on function private.is_active_admin() from public, anon, authenticated;
revoke all on function private.is_class_manager() from public, anon, authenticated;
grant execute on function private.is_active_faculty() to authenticated;
grant execute on function private.is_active_admin() to authenticated;
grant execute on function private.is_class_manager() to authenticated;

alter table public.faculty_profiles enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_rosters enable row level security;

-- PostgreSQL 17 local defaults grant additional table privileges (Dxtm) to
-- public-facing roles. Clear every direct privilege before issuing the narrow
-- application grants below; service_role and owner privileges are untouched.
revoke all privileges on public.faculty_profiles, public.admin_profiles, public.classes, public.class_rosters from public, anon, authenticated;
grant select on public.faculty_profiles, public.admin_profiles, public.classes to authenticated;
grant select, insert, delete on public.class_rosters to authenticated;

-- The historical track was authored before PostgreSQL 17 exposed these
-- additional table privileges in the local default ACL. They are never part
-- of the browser-facing contract, and RLS does not constrain all of them.
-- Preserve each migration's existing DML grants while removing DDL-adjacent
-- privileges from all canonical public tables and from future postgres-owned
-- tables created by this inactive clean-install track.
revoke truncate, references, trigger, maintain on table
  public.admin_profiles,
  public.attendance_late_reason_options,
  public.attendance_late_reason_option_translations,
  public.attendance_records,
  public.attendance_request_attachments,
  public.attendance_requests,
  public.audit_logs,
  public.class_rosters,
  public.classes,
  public.credential_request_attachments,
  public.credential_requests,
  public.departments,
  public.event_categories,
  public.event_email_outbox,
  public.event_feedback,
  public.event_feedback_ratings,
  public.event_objectives,
  public.event_participants,
  public.event_resources,
  public.event_sessions,
  public.event_summary_snapshots,
  public.events,
  public.facial_enrollment_history,
  public.facial_profiles,
  public.faculty_profiles,
  public.generated_reports,
  public.ml_predictions,
  public.notifications,
  public.organizers,
  public.profiles,
  public.programs,
  public.qr_credentials,
  public.request_email_outbox,
  public.sections,
  public.semesters,
  public.student_face_embeddings,
  public.students,
  public.verification_attempts
from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from public, anon, authenticated;

create policy faculty_profiles_read_scoped on public.faculty_profiles for select to authenticated
  using ((select private.is_class_manager()) or profile_id = (select auth.uid()));
create policy admin_profiles_read_scoped on public.admin_profiles for select to authenticated
  using ((select private.is_class_manager()) or profile_id = (select auth.uid()));
create policy classes_read_active_user on public.classes for select to authenticated
  using ((select private.is_active_user()));
create policy class_rosters_read_scoped on public.class_rosters for select to authenticated
  using (
    (select private.is_class_manager())
    or exists (select 1 from public.classes where classes.id = class_rosters.class_id and classes.faculty_id = (select auth.uid()))
    or exists (select 1 from public.students where students.id = class_rosters.student_id and students.profile_id = (select auth.uid()))
  );
create policy class_rosters_insert_manager on public.class_rosters for insert to authenticated
  with check ((select private.is_class_manager()));
create policy class_rosters_delete_manager on public.class_rosters for delete to authenticated
  using ((select private.is_class_manager()));

commit;
