begin;

create or replace function private.prepare_student_progression_sections(
  p_current_school_year text,
  p_target_school_year text,
  p_target_semester_id uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_semester_name text;
begin
  select semester_name into v_semester_name
  from public.semesters
  where id = p_target_semester_id and academic_year = p_target_school_year;
  if v_semester_name is null then
    raise exception 'The selected semester must belong to the target school year.' using errcode = '22023';
  end if;

  insert into public.sections (program_id, section_name, year_level, academic_year, semester, is_active)
  select source.program_id, source.section_name, source.year_level + 1, p_target_school_year, v_semester_name, true
  from public.sections source
  where source.academic_year = p_current_school_year
    and source.is_active
    and source.year_level < 8
    and not exists (
      select 1 from public.sections target
      where target.program_id = source.program_id
        and lower(btrim(target.section_name)) = lower(btrim(source.section_name))
        and target.year_level = source.year_level + 1
        and target.academic_year = p_target_school_year
        and target.is_active
    );
end;
$$;
revoke all on function private.prepare_student_progression_sections(text, text, uuid) from public, anon, authenticated;

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
  select s.id, s.student_id, trim(concat_ws(' ', p.first_name, p.middle_name, p.last_name)), s.year_level,
    s.year_level + 1, sec.section_name, target.id,
    case when target.id is null then 'Next-year section will be created automatically' else null end
  from public.students s
  join public.profiles p on p.id = s.profile_id
  join public.sections sec on sec.id = s.section_id
  left join public.sections target on target.program_id = s.program_id
    and lower(target.section_name) = lower(sec.section_name)
    and target.year_level = s.year_level + 1
    and target.academic_year = p_target_school_year
    and target.is_active
  where s.student_status = 'enrolled' and s.year_level < 8;
end;
$$;
revoke all on function public.admin_preview_student_progression(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_preview_student_progression(text, uuid) to authenticated;

create or replace function public.admin_apply_student_progression(p_target_school_year text, p_target_semester_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_current_year text;
  v_current_start integer;
  v_target_start integer;
  v_count integer := 0;
  r record;
begin
  if not (select private.is_active_admin()) then
    raise exception 'Only university administrators can advance students.' using errcode = '42501';
  end if;
  select current_school_year into v_current_year from public.system_settings order by updated_at desc limit 1 for update;
  v_current_start := split_part(v_current_year, '-', 1)::integer;
  v_target_start := split_part(p_target_school_year, '-', 1)::integer;
  if v_target_start <> v_current_start + 1 then
    raise exception 'Students can only be advanced to the next school year.' using errcode = '22023';
  end if;
  perform private.prepare_student_progression_sections(v_current_year, p_target_school_year, p_target_semester_id);
  for r in select * from public.admin_preview_student_progression(p_target_school_year, p_target_semester_id) where issue is not null loop
    raise exception 'Promotion stopped: no matching section for student %.', r.student_number using errcode = '22023';
  end loop;
  for r in select * from public.admin_preview_student_progression(p_target_school_year, p_target_semester_id) loop
    insert into public.student_enrollments (student_id, academic_year, semester_id, program_id, section_id, year_level, enrollment_status)
    select s.id, p_target_school_year, p_target_semester_id, s.program_id, r.target_section_id, s.year_level + 1, 'enrolled'
    from public.students s where s.id = r.student_id
    on conflict (student_id, semester_id) do nothing;
    update public.students set section_id = r.target_section_id, year_level = year_level + 1, updated_at = now() where id = r.student_id and student_status = 'enrolled' and year_level < 8;
    v_count := v_count + 1;
  end loop;
  insert into public.audit_logs (actor_user_id, action, target_type, metadata)
  values ((select auth.uid()), 'admin.student_progression.applied', 'student_enrollments', jsonb_build_object('targetSchoolYear', p_target_school_year, 'targetSemesterId', p_target_semester_id, 'updatedCount', v_count));
  return jsonb_build_object('updatedCount', v_count, 'targetSchoolYear', p_target_school_year, 'targetSemesterId', p_target_semester_id);
end;
$$;
revoke all on function public.admin_apply_student_progression(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_apply_student_progression(text, uuid) to authenticated;

create or replace function public.admin_transition_school_year(
  p_settings_id uuid,
  p_target_school_year text,
  p_target_semester_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_current public.system_settings%rowtype;
  v_current_start integer;
  v_target_start integer;
  v_count integer := 0;
  r record;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Settings changes must be an object.' using errcode = '22023';
  end if;
  select * into v_current from public.system_settings where id = p_settings_id for update;
  if not found then raise exception 'System settings were not found.' using errcode = 'P0002'; end if;
  if p_target_school_year !~ '^\d{4}-\d{4}$' then
    raise exception 'School year must use the YYYY-YYYY format.' using errcode = '22023';
  end if;
  v_current_start := split_part(v_current.current_school_year, '-', 1)::integer;
  v_target_start := split_part(p_target_school_year, '-', 1)::integer;
  if v_target_start <> v_current_start + 1 then
    raise exception 'Students can only be advanced to the next school year.' using errcode = '22023';
  end if;
  perform private.prepare_student_progression_sections(v_current.current_school_year, p_target_school_year, p_target_semester_id);
  for r in select * from public.admin_preview_student_progression(p_target_school_year, p_target_semester_id) where issue is not null loop
    raise exception 'Promotion stopped: no matching section for student %.', r.student_number using errcode = '22023';
  end loop;
  for r in select * from public.admin_preview_student_progression(p_target_school_year, p_target_semester_id) loop
    insert into public.student_enrollments (student_id, academic_year, semester_id, program_id, section_id, year_level, enrollment_status)
    select s.id, p_target_school_year, p_target_semester_id, s.program_id, r.target_section_id, s.year_level + 1, 'enrolled'
    from public.students s where s.id = r.student_id
    on conflict (student_id, semester_id) do nothing;
    update public.students set section_id = r.target_section_id, year_level = year_level + 1, updated_at = now()
    where id = r.student_id and student_status = 'enrolled' and year_level < 8;
    v_count := v_count + 1;
  end loop;
  update public.system_settings set
    institution_name = coalesce(nullif(btrim(p_changes->>'institution_name'), ''), institution_name),
    current_school_year = p_target_school_year,
    current_semester_id = p_target_semester_id,
    attendance_late_cutoff_minutes = coalesce((p_changes->>'attendance_late_cutoff_minutes')::integer, attendance_late_cutoff_minutes),
    default_session_duration_minutes = coalesce((p_changes->>'default_session_duration_minutes')::integer, default_session_duration_minutes),
    verification_policy = coalesce(nullif(btrim(p_changes->>'verification_policy'), ''), verification_policy),
    notification_preferences = coalesce(p_changes->'notification_preferences', notification_preferences),
    updated_at = now()
  where id = p_settings_id;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), 'admin.school_year_transition.applied', 'system_settings', p_settings_id,
    jsonb_build_object('targetSchoolYear', p_target_school_year, 'targetSemesterId', p_target_semester_id, 'updatedCount', v_count));
  return jsonb_build_object('updatedCount', v_count, 'targetSchoolYear', p_target_school_year, 'targetSemesterId', p_target_semester_id);
end;
$$;
revoke all on function public.admin_transition_school_year(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_transition_school_year(uuid, text, uuid, jsonb) to authenticated;

commit;
