begin;
-- Keep future objects private until a migration grants explicit Data API access.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  department_code text not null,
  department_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_code_not_blank check (btrim(department_code) <> ''),
  constraint departments_name_not_blank check (btrim(department_name) <> '')
);
create unique index departments_code_unique_idx
  on public.departments (lower(department_code));
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  program_code text not null,
  program_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_code_not_blank check (btrim(program_code) <> ''),
  constraint programs_name_not_blank check (btrim(program_name) <> '')
);
create unique index programs_department_code_unique_idx
  on public.programs (department_id, lower(program_code));
create index programs_department_id_idx on public.programs (department_id);
create table public.sections (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  section_name text not null,
  year_level smallint not null,
  academic_year text not null,
  semester text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sections_name_not_blank check (btrim(section_name) <> ''),
  constraint sections_year_level_valid check (year_level between 1 and 8),
  constraint sections_academic_year_not_blank check (btrim(academic_year) <> ''),
  constraint sections_semester_not_blank check (btrim(semester) <> '')
);
create unique index sections_identity_unique_idx
  on public.sections (program_id, lower(section_name), academic_year, semester);
create index sections_program_id_idx on public.sections (program_id);
create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  semester_name text not null,
  academic_year text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'upcoming',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint semesters_name_not_blank check (btrim(semester_name) <> ''),
  constraint semesters_academic_year_not_blank check (btrim(academic_year) <> ''),
  constraint semesters_date_order_valid check (end_date >= start_date),
  constraint semesters_status_valid check (status in ('upcoming', 'active', 'completed'))
);
create unique index semesters_identity_unique_idx
  on public.semesters (academic_year, lower(semester_name));
create unique index semesters_single_active_idx
  on public.semesters (status) where status = 'active';
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  subject_code text not null,
  subject_name text not null,
  units numeric(4, 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_code_not_blank check (btrim(subject_code) <> ''),
  constraint subjects_name_not_blank check (btrim(subject_name) <> ''),
  constraint subjects_units_valid check (units is null or units > 0)
);
create unique index subjects_code_unique_idx on public.subjects (lower(subject_code));
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  building text,
  capacity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_code_not_blank check (btrim(room_code) <> ''),
  constraint rooms_capacity_valid check (capacity is null or capacity > 0)
);
create unique index rooms_code_unique_idx on public.rooms (lower(room_code));
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  profile_picture text,
  role text not null,
  account_status text not null default 'active',
  department_id uuid references public.departments(id) on delete set null,
  employee_id text,
  student_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (btrim(email) <> ''),
  constraint profiles_first_name_not_blank check (btrim(first_name) <> ''),
  constraint profiles_last_name_not_blank check (btrim(last_name) <> ''),
  constraint profiles_role_valid check (role in ('organizer', 'student')),
  constraint profiles_account_status_valid check (account_status in ('active', 'inactive', 'suspended')),
  constraint profiles_role_identifier_valid check (
    (role = 'organizer' and employee_id is not null and student_id is null)
    or (role = 'student' and student_id is not null and employee_id is null)
  )
);
create unique index profiles_email_unique_idx on public.profiles (lower(email));
create unique index profiles_employee_id_unique_idx
  on public.profiles (lower(employee_id)) where employee_id is not null;
create unique index profiles_student_id_unique_idx
  on public.profiles (lower(student_id)) where student_id is not null;
create index profiles_department_id_idx on public.profiles (department_id);
create index profiles_role_status_idx on public.profiles (role, account_status);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  student_id text not null,
  program_id uuid not null references public.programs(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  section_id uuid not null references public.sections(id) on delete restrict,
  year_level smallint not null,
  student_status text not null default 'enrolled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_id_not_blank check (btrim(student_id) <> ''),
  constraint students_year_level_valid check (year_level between 1 and 8),
  constraint students_status_valid check (student_status in ('enrolled', 'loa', 'dropped', 'archived'))
);
create unique index students_student_id_unique_idx on public.students (lower(student_id));
create index students_program_id_idx on public.students (program_id);
create index students_department_id_idx on public.students (department_id);
create index students_section_id_idx on public.students (section_id);
create index students_status_idx on public.students (student_status);
create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  employee_id text not null,
  department_id uuid references public.departments(id) on delete set null,
  organization_name text not null default 'PLPass',
  position text not null default 'Organizer',
  organizer_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizers_employee_id_not_blank check (btrim(employee_id) <> ''),
  constraint organizers_organization_name_not_blank check (btrim(organization_name) <> ''),
  constraint organizers_position_not_blank check (btrim(position) <> ''),
  constraint organizers_status_valid check (organizer_status in ('active', 'inactive'))
);
create unique index organizers_employee_id_unique_idx on public.organizers (lower(employee_id));
create index organizers_department_id_idx on public.organizers (department_id);
create index organizers_status_idx on public.organizers (organizer_status);
create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  category_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_categories_name_not_blank check (btrim(category_name) <> '')
);
create unique index event_categories_name_unique_idx
  on public.event_categories (lower(category_name));
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid references public.profiles(id) on delete set null,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  room_id uuid references public.rooms(id) on delete set null,
  section_id uuid not null references public.sections(id) on delete restrict,
  semester_id uuid not null references public.semesters(id) on delete restrict,
  class_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_status_valid check (class_status in ('active', 'inactive', 'completed'))
);
create unique index classes_identity_unique_idx
  on public.classes (subject_id, section_id, semester_id);
create index classes_faculty_id_idx on public.classes (faculty_id);
create index classes_subject_id_idx on public.classes (subject_id);
create index classes_room_id_idx on public.classes (room_id);
create index classes_section_id_idx on public.classes (section_id);
create index classes_semester_id_idx on public.classes (semester_id);
create index classes_status_idx on public.classes (class_status);
create table public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_schedules_day_valid check (day_of_week between 1 and 7),
  constraint class_schedules_time_order_valid check (end_time > start_time)
);
create unique index class_schedules_identity_unique_idx
  on public.class_schedules (class_id, day_of_week, start_time, end_time);
create index class_schedules_class_id_idx on public.class_schedules (class_id);
create table public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  enrollment_status text not null default 'enrolled',
  enrolled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_enrollments_status_valid check (enrollment_status in ('enrolled', 'dropped', 'removed')),
  constraint class_enrollments_class_student_unique unique (class_id, student_id)
);
create index class_enrollments_class_id_idx on public.class_enrollments (class_id);
create index class_enrollments_student_id_idx on public.class_enrollments (student_id);
create index class_enrollments_student_status_idx
  on public.class_enrollments (student_id, enrollment_status);
alter table public.departments enable row level security;
alter table public.programs enable row level security;
alter table public.sections enable row level security;
alter table public.semesters enable row level security;
alter table public.subjects enable row level security;
alter table public.rooms enable row level security;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.organizers enable row level security;
alter table public.event_categories enable row level security;
alter table public.classes enable row level security;
alter table public.class_schedules enable row level security;
alter table public.class_enrollments enable row level security;
revoke all on table
  public.departments,
  public.programs,
  public.sections,
  public.semesters,
  public.subjects,
  public.rooms,
  public.profiles,
  public.students,
  public.organizers,
  public.event_categories,
  public.classes,
  public.class_schedules,
  public.class_enrollments
from anon, authenticated;
commit;
