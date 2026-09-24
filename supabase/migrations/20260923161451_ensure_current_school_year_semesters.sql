begin;

-- The academic cycle can be changed after the initial seed migration runs.
-- Keep the selectable semesters synchronized with the configured school year.
create or replace function private.ensure_current_school_year_semesters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school_year text := btrim(new.current_school_year);
  v_start_year integer;
begin
  -- Preserve the settings table's existing validation behavior for custom
  -- school-year labels, while safely supporting the YYYY-YYYY format used by
  -- the application.
  if v_school_year !~ '^\d{4}-\d{4}$' then
    return new;
  end if;

  v_start_year := split_part(v_school_year, '-', 1)::integer;

  insert into public.semesters (semester_name, academic_year, start_date, end_date, status)
  values
    ('First Semester', v_school_year, make_date(v_start_year, 6, 1), make_date(v_start_year, 10, 31), 'upcoming'),
    ('Midyear Semester', v_school_year, make_date(v_start_year, 11, 1), make_date(v_start_year + 1, 1, 31), 'upcoming'),
    ('Second Semester', v_school_year, make_date(v_start_year + 1, 2, 1), make_date(v_start_year + 1, 6, 30), 'upcoming')
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.ensure_current_school_year_semesters() from public, anon, authenticated;

drop trigger if exists ensure_current_school_year_semesters on public.system_settings;
create trigger ensure_current_school_year_semesters
after insert or update of current_school_year on public.system_settings
for each row
execute function private.ensure_current_school_year_semesters();

-- Backfill the current setting immediately so existing deployments receive
-- options without requiring an administrator to edit the school year again.
insert into public.semesters (semester_name, academic_year, start_date, end_date, status)
select
  semester_name,
  school_year,
  start_date,
  end_date,
  'upcoming'
from public.system_settings settings
cross join lateral (
  select
    'First Semester'::text as semester_name,
    btrim(settings.current_school_year) as school_year,
    make_date(split_part(btrim(settings.current_school_year), '-', 1)::integer, 6, 1) as start_date,
    make_date(split_part(btrim(settings.current_school_year), '-', 1)::integer, 10, 31) as end_date
  where btrim(settings.current_school_year) ~ '^\d{4}-\d{4}$'
  union all
  select
    'Midyear Semester',
    btrim(settings.current_school_year),
    make_date(split_part(btrim(settings.current_school_year), '-', 1)::integer, 11, 1),
    make_date(split_part(btrim(settings.current_school_year), '-', 1)::integer + 1, 1, 31)
  where btrim(settings.current_school_year) ~ '^\d{4}-\d{4}$'
  union all
  select
    'Second Semester',
    btrim(settings.current_school_year),
    make_date(split_part(btrim(settings.current_school_year), '-', 1)::integer + 1, 2, 1),
    make_date(split_part(btrim(settings.current_school_year), '-', 1)::integer + 1, 6, 30)
  where btrim(settings.current_school_year) ~ '^\d{4}-\d{4}$'
) defaults
on conflict do nothing;

commit;
