begin;

create or replace function public.admin_prepare_school_year_semesters(p_school_year text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_start_year integer;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_school_year !~ '^\d{4}-\d{4}$' then
    raise exception 'School year must use the YYYY-YYYY format.' using errcode = '22023';
  end if;
  v_start_year := split_part(p_school_year, '-', 1)::integer;
  insert into public.semesters (semester_name, academic_year, start_date, end_date, status)
  values
    ('First Semester', p_school_year, make_date(v_start_year, 6, 1), make_date(v_start_year, 10, 31), 'upcoming'),
    ('Midyear Semester', p_school_year, make_date(v_start_year, 11, 1), make_date(v_start_year + 1, 1, 31), 'upcoming'),
    ('Second Semester', p_school_year, make_date(v_start_year + 1, 2, 1), make_date(v_start_year + 1, 6, 30), 'upcoming')
  on conflict do nothing;
end;
$$;
revoke all on function public.admin_prepare_school_year_semesters(text) from public, anon, authenticated;
grant execute on function public.admin_prepare_school_year_semesters(text) to authenticated;

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
