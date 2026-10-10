begin;

create or replace function public.admin_preview_student_progression(p_target_school_year text, p_target_semester_id uuid)
returns table (
  student_id uuid,
  student_number text,
  display_name text,
  current_year_level smallint,
  target_year_level smallint,
  current_section text,
  target_section_id uuid,
  issue text
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_current_year text;
  v_target_semester_year text;
  v_current_start integer;
  v_target_start integer;
begin
  if not (select private.is_active_admin()) then
    raise exception 'Only university administrators can advance students.' using errcode = '42501';
  end if;
  select current_school_year into v_current_year from public.system_settings order by updated_at desc limit 1;
  select academic_year into v_target_semester_year from public.semesters where id = p_target_semester_id;
  if p_target_school_year !~ '^\d{4}-\d{4}$' or v_target_semester_year is null then
    raise exception 'Select a valid target school year and semester.' using errcode = '22023';
  end if;
  if v_target_semester_year <> p_target_school_year then
    raise exception 'The selected semester must belong to the target school year.' using errcode = '22023';
  end if;
  v_current_start := split_part(v_current_year, '-', 1)::integer;
  v_target_start := split_part(p_target_school_year, '-', 1)::integer;
  if v_target_start <> v_current_start + 1 then
    raise exception 'Students can only be advanced to the next school year.' using errcode = '22023';
  end if;

  return query
  select s.id::uuid,
    s.student_id::text,
    trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name))::text,
    s.year_level::smallint,
    (s.year_level + 1)::smallint,
    sec.section_name::text,
    target.id::uuid,
    (case when target.id is null then 'No matching next-year section' else null end)::text
  from public.students s
  join public.profiles p on p.id = s.profile_id
  join public.sections sec on sec.id = s.section_id
  left join public.semesters target_semester on target_semester.id = p_target_semester_id
  left join public.sections target on target.program_id = s.program_id
    and lower(target.section_name) = lower(sec.section_name)
    and target.year_level = s.year_level + 1
    and target.academic_year = p_target_school_year
    and lower(target.semester) = lower(target_semester.semester_name)
  where s.student_status = 'enrolled' and s.year_level < 8;
end;
$$;

revoke all on function public.admin_preview_student_progression(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_preview_student_progression(text, uuid) to authenticated;

commit;
