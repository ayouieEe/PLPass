begin;

create or replace function public.snapshot_attendance_student_context()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_student public.students%rowtype;
  v_school_year text;
  v_semester_id uuid;
begin
  if new.student_id is null then
    return new;
  end if;

  select se.academic_year,
         se.semester_id,
         se.year_level,
         se.section_id,
         sec.section_name
    into new.historical_academic_year,
         new.historical_semester_id,
         new.historical_year_level,
         new.historical_section_id,
         new.historical_section_name
  from public.student_enrollments se
  join public.sections sec on sec.id = se.section_id
  where se.student_id = new.student_id
  order by
    (se.created_at <= coalesce(new.recorded_at, new.created_at)) desc,
    abs(extract(epoch from (se.created_at - coalesce(new.recorded_at, new.created_at)))) asc,
    se.created_at desc
  limit 1;

  if new.historical_academic_year is not null then
    return new;
  end if;

  select * into v_student from public.students where id = new.student_id;
  if not found then
    return new;
  end if;

  select current_school_year, current_semester_id
    into v_school_year, v_semester_id
  from public.system_settings
  order by updated_at desc
  limit 1;

  new.historical_academic_year := v_school_year;
  new.historical_semester_id := v_semester_id;
  new.historical_year_level := v_student.year_level;
  new.historical_section_id := v_student.section_id;
  select section_name into new.historical_section_name
  from public.sections
  where id = v_student.section_id;
  return new;
end;
$$;

revoke all on function public.snapshot_attendance_student_context() from public, anon, authenticated;

commit;
