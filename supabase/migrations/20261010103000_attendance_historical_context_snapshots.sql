begin;

alter table public.attendance_records
  add column if not exists historical_academic_year text,
  add column if not exists historical_semester_id uuid references public.semesters(id) on delete set null,
  add column if not exists historical_year_level smallint,
  add column if not exists historical_section_id uuid references public.sections(id) on delete set null,
  add column if not exists historical_section_name text;

alter table public.attendance_records
  drop constraint if exists attendance_records_historical_year_level_valid;

alter table public.attendance_records
  add constraint attendance_records_historical_year_level_valid
  check (historical_year_level is null or historical_year_level between 1 and 8);

create index if not exists attendance_records_historical_academic_year_idx
  on public.attendance_records (historical_academic_year);

create or replace function public.snapshot_attendance_student_context()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_student public.students%rowtype;
  v_section_name text;
  v_school_year text;
  v_semester_id uuid;
begin
  if new.student_id is null
     or new.historical_academic_year is not null
     or new.historical_year_level is not null
     or new.historical_section_id is not null
     or new.historical_section_name is not null then
    return new;
  end if;

  select * into v_student from public.students where id = new.student_id;
  if not found then
    return new;
  end if;

  select section_name into v_section_name
  from public.sections
  where id = v_student.section_id;

  select current_school_year, current_semester_id
    into v_school_year, v_semester_id
  from public.system_settings
  order by updated_at desc
  limit 1;

  new.historical_academic_year := v_school_year;
  new.historical_semester_id := v_semester_id;
  new.historical_year_level := v_student.year_level;
  new.historical_section_id := v_student.section_id;
  new.historical_section_name := v_section_name;
  return new;
end;
$$;

revoke all on function public.snapshot_attendance_student_context() from public, anon, authenticated;

create trigger attendance_records_snapshot_student_context
before insert on public.attendance_records
for each row execute function public.snapshot_attendance_student_context();

with snapshot as (
  select distinct on (ar.id)
    ar.id,
    se.academic_year,
    se.semester_id,
    se.year_level,
    se.section_id,
    sec.section_name
  from public.attendance_records ar
  join public.student_enrollments se on se.student_id = ar.student_id
  join public.sections sec on sec.id = se.section_id
  where ar.historical_academic_year is null
  order by
    ar.id,
    (se.created_at <= coalesce(ar.recorded_at, ar.created_at)) desc,
    abs(extract(epoch from (se.created_at - coalesce(ar.recorded_at, ar.created_at)))) asc,
    se.created_at desc
)
update public.attendance_records ar
set historical_academic_year = snapshot.academic_year,
    historical_semester_id = snapshot.semester_id,
    historical_year_level = snapshot.year_level,
    historical_section_id = snapshot.section_id,
    historical_section_name = snapshot.section_name
from snapshot
where ar.id = snapshot.id;

comment on column public.attendance_records.historical_academic_year is
  'Academic year captured when attendance was recorded; never derived from the current student placement.';
comment on column public.attendance_records.historical_year_level is
  'Year level captured when attendance was recorded; never derived from the current student placement.';
comment on column public.attendance_records.historical_section_name is
  'Section name captured when attendance was recorded; never derived from the current section.';

commit;
