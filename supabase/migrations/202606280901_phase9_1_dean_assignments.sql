-- Phase 9.1 review migration: department-scoped dean/admin assignments.
-- Do not apply until reviewed against institutional access rules.
-- Alternative: if PLPass should use global admins only, do not apply this table
-- and continue scoping admins through public.profiles.role = 'admin'.

create table if not exists public.dean_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  office_name text not null default 'Dean Office',
  employee_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dean_assignments_profile_department_uidx
  on public.dean_assignments (profile_id, department_id);

create index if not exists dean_assignments_profile_id_idx
  on public.dean_assignments (profile_id);

create index if not exists dean_assignments_department_id_idx
  on public.dean_assignments (department_id);

comment on table public.dean_assignments is
  'Optional department-scoped dean/admin assignments for PLPass role isolation. If global admin access is preferred, leave this table unused.';
