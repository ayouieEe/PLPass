insert into public.semesters (semester_name, academic_year, start_date, end_date, status)
select semester_name, academic_year, start_date, end_date, 'upcoming'
from (
  select
    'First Semester'::text as semester_name,
    s.current_school_year as academic_year,
    make_date(split_part(s.current_school_year, '-', 1)::int, 6, 1) as start_date,
    make_date(split_part(s.current_school_year, '-', 1)::int, 10, 31) as end_date
  from public.system_settings s
  union all
  select
    'Midyear Semester',
    s.current_school_year,
    make_date(split_part(s.current_school_year, '-', 1)::int, 11, 1),
    make_date(split_part(s.current_school_year, '-', 1)::int + 1, 1, 31)
  from public.system_settings s
  union all
  select
    'Second Semester',
    s.current_school_year,
    make_date(split_part(s.current_school_year, '-', 1)::int + 1, 2, 1),
    make_date(split_part(s.current_school_year, '-', 1)::int + 1, 6, 30)
  from public.system_settings s
) defaults
where not exists (
  select 1
  from public.semesters existing
  where existing.academic_year = defaults.academic_year
    and lower(existing.semester_name) = lower(defaults.semester_name)
);
