begin;

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
  v_target_semester_year text;
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
  select academic_year into v_target_semester_year from public.semesters where id = p_target_semester_id;
  if v_target_semester_year <> p_target_school_year then
    raise exception 'The selected semester must belong to the target school year.' using errcode = '22023';
  end if;
  v_current_start := split_part(v_current.current_school_year, '-', 1)::integer;
  v_target_start := split_part(p_target_school_year, '-', 1)::integer;
  if v_target_start <> v_current_start + 1 then
    raise exception 'Students can only be advanced to the next school year.' using errcode = '22023';
  end if;

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

create or replace function public.admin_update_system_settings(p_settings_id uuid, p_changes jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_current public.system_settings%rowtype;
  v_school_year text;
  v_semester_id uuid;
  v_year_changed boolean;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Settings changes must be an object.' using errcode = '22023';
  end if;
  select * into v_current from public.system_settings where id = p_settings_id for update;
  if not found then raise exception 'System settings were not found.' using errcode = 'P0002'; end if;

  v_school_year := coalesce(nullif(btrim(p_changes->>'current_school_year'), ''), v_current.current_school_year);
  v_year_changed := v_school_year is distinct from v_current.current_school_year;
  if v_year_changed
    and v_current.current_school_year ~ '^\d{4}-\d{4}$'
    and v_school_year ~ '^\d{4}-\d{4}$'
    and split_part(v_school_year, '-', 1)::integer = split_part(v_current.current_school_year, '-', 1)::integer + 1 then
    raise exception 'Use Student progression to change the school year safely.' using errcode = '22023';
  end if;
  if p_changes ? 'current_semester_id' and nullif(btrim(p_changes->>'current_semester_id'), '') is not null then
    v_semester_id := (p_changes->>'current_semester_id')::uuid;
  else
    v_semester_id := case when v_year_changed then null else v_current.current_semester_id end;
  end if;
  if v_semester_id is null then
    raise exception 'Select a semester belonging to the selected school year before saving.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.semesters where id = v_semester_id and academic_year = v_school_year) then
    raise exception 'The selected semester must belong to the current school year.' using errcode = '22023';
  end if;

  update public.system_settings set
    institution_name = coalesce(nullif(btrim(p_changes->>'institution_name'), ''), institution_name),
    current_school_year = v_school_year,
    current_semester_id = v_semester_id,
    attendance_late_cutoff_minutes = coalesce((p_changes->>'attendance_late_cutoff_minutes')::integer, attendance_late_cutoff_minutes),
    default_session_duration_minutes = coalesce((p_changes->>'default_session_duration_minutes')::integer, default_session_duration_minutes),
    verification_policy = coalesce(nullif(btrim(p_changes->>'verification_policy'), ''), verification_policy),
    notification_preferences = coalesce(p_changes->'notification_preferences', notification_preferences),
    updated_at = now()
  where id = p_settings_id;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), 'admin.system_settings.updated', 'system_settings', p_settings_id, p_changes);
end;
$$;
revoke all on function public.admin_update_system_settings(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_system_settings(uuid, jsonb) to authenticated;

commit;
