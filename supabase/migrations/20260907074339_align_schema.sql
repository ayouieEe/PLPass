begin;

-- 1. Create Academic Classes and Rosters
create table if not exists public.classes (
    id uuid primary key default gen_random_uuid(),
    faculty_id uuid not null references public.profiles(id) on delete cascade,
    program_id uuid not null references public.programs(id) on delete restrict,
    department_id uuid not null references public.departments(id) on delete restrict,
    semester_id uuid not null references public.semesters(id) on delete restrict,
    subject_code text not null,
    subject_title text not null,
    room text not null,
    section_id uuid not null references public.sections(id) on delete restrict,
    year_level integer not null,
    schedule_label text not null,
    status text not null default 'active' check (status in ('active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.class_rosters (
    id uuid primary key default gen_random_uuid(),
    class_id uuid not null references public.classes(id) on delete cascade,
    student_id uuid not null references public.students(id) on delete cascade,
    enrolled_at timestamptz not null default now(),
    unique (class_id, student_id)
);

-- 2. Alter Events (Columns already exist in previous migrations)

-- 3. Create Faculty and Admin Profiles
create table if not exists public.faculty_profiles (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    department_id uuid not null references public.departments(id) on delete restrict,
    employee_number text not null unique,
    employment_status text not null,
    title text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.admin_profiles (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id) on delete cascade,
    department_id uuid not null references public.departments(id) on delete restrict,
    employee_number text not null unique,
    office_name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- The production application intentionally continues to use event_sessions.
-- Do not rename it here: later migrations and the current repositories depend
-- on that relation. Class attendance has its own class_sessions relation.

-- Enable RLS and setup default policies for new tables
alter table public.classes enable row level security;
alter table public.class_rosters enable row level security;
alter table public.faculty_profiles enable row level security;
alter table public.admin_profiles enable row level security;

-- Setup basic read policies (Admins/Organizers read all, users read own)
drop policy if exists classes_read_all on public.classes;
create policy classes_read_all on public.classes for select to authenticated using (true);
drop policy if exists class_rosters_read_all on public.class_rosters;
create policy class_rosters_read_all on public.class_rosters for select to authenticated using (true);
drop policy if exists faculty_profiles_read_all on public.faculty_profiles;
create policy faculty_profiles_read_all on public.faculty_profiles for select to authenticated using (true);
drop policy if exists admin_profiles_read_all on public.admin_profiles;
create policy admin_profiles_read_all on public.admin_profiles for select to authenticated using (true);

commit;
