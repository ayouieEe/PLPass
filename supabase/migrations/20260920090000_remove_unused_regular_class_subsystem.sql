-- Remove the unused regular-class/faculty subsystem.
--
-- This is a compensating migration. Historical migrations are intentionally
-- left unchanged. The guards make the migration safe to apply to both
-- PLPass Current and PLPass Events, whose leftover objects are not identical.
-- Event attendance, event participants, students, organizers, departments,
-- reports, audit logs, and email/outbox data are intentionally untouched.

do $$
declare
  has_rows boolean;
begin
  if to_regclass('public.faculty_profiles') is not null then
    execute 'select exists (select 1 from public.faculty_profiles limit 1)' into has_rows;
    if has_rows then raise exception 'regular-class cleanup blocked: faculty_profiles is not empty'; end if;
  end if;

  if to_regclass('public.class_rosters') is not null then
    execute 'select exists (select 1 from public.class_rosters limit 1)' into has_rows;
    if has_rows then raise exception 'regular-class cleanup blocked: class_rosters is not empty'; end if;
  end if;

  if to_regclass('public.classes') is not null then
    execute 'select exists (select 1 from public.classes limit 1)' into has_rows;
    if has_rows then raise exception 'regular-class cleanup blocked: classes is not empty'; end if;
  end if;

  if to_regclass('public.class_sessions') is not null then
    execute 'select exists (select 1 from public.class_sessions limit 1)' into has_rows;
    if has_rows then raise exception 'regular-class cleanup blocked: class_sessions is not empty'; end if;
  end if;

  if exists (select 1 from public.profiles where role = 'faculty') then
    raise exception 'regular-class cleanup blocked: faculty profile rows exist';
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.class_rosters') is not null then
    execute 'drop policy if exists class_rosters_read_all on public.class_rosters';
    execute 'drop policy if exists class_rosters_read_scoped on public.class_rosters';
  end if;
  if to_regclass('public.faculty_profiles') is not null then
    execute 'drop policy if exists faculty_profiles_read_all on public.faculty_profiles';
  end if;
end;
$$;

drop function if exists private.is_active_faculty();

-- Drop in dependency order. No CASCADE is used so an unexpected dependency
-- aborts the migration instead of silently removing an unrelated object.
drop table if exists public.class_sessions;
drop table if exists public.class_rosters;
drop table if exists public.classes;
drop table if exists public.faculty_profiles;

-- Keep the current department-admin role while removing the retired faculty
-- role. The migration must not narrow the active permission model.
alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles
  add constraint profiles_role_valid
  check (role = any (array['admin', 'department_admin', 'organizer', 'student']));

alter table public.profiles drop constraint if exists profiles_role_identifier_valid;
alter table public.profiles
  add constraint profiles_role_identifier_valid
  check (
    (role = any (array['admin', 'department_admin', 'organizer']) and employee_id is not null and student_id is null)
    or (role = 'student' and student_id is not null and employee_id is null)
  );
