begin;

-- The linked production database predates the ownership migration, so keep
-- this Phase 6 correction self-contained instead of relying on migration
-- history that is currently absent there.
create or replace function private.organizer_can_access_student(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select private.is_active_organizer())
    and exists (
      select 1
      from public.event_participants ep
      join public.events e on e.id = ep.event_id
      where ep.student_id = p_student_id
        and ep.participant_status <> 'removed'
        and e.organizer_id = (select private.current_organizer_id())
    );
$$;
revoke all on function private.organizer_can_access_student(uuid) from public, anon;
grant execute on function private.organizer_can_access_student(uuid) to authenticated;

-- Remove every legacy blanket administrator write policy.  Administrative
-- writes below are deliberately limited to audited security-definer RPCs or
-- the manage-users Edge Function.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'admin_global_%'
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

-- Active administrators retain read-only visibility where their approved UI
-- needs it.  Biometric descriptors and verification attempts are excluded.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'admin_profiles', 'students', 'organizers', 'departments',
    'programs', 'sections', 'semesters', 'event_categories', 'events',
    'event_participants', 'event_sessions', 'attendance_sessions',
    'attendance_records', 'attendance_requests', 'credential_requests',
    'qr_credentials', 'notifications', 'audit_logs', 'system_settings',
    'generated_reports', 'ml_predictions', 'event_resources', 'event_feedback',
    'event_feedback_ratings', 'event_feedback_tasks',
    'event_feedback_task_objectives', 'event_summary_snapshots', 'event_objectives'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', 'admin_read_' || table_name, table_name);
      execute format('create policy %I on public.%I for select to authenticated using ((select private.is_active_admin()))', 'admin_read_' || table_name, table_name);
    end if;
  end loop;
end $$;

-- Global settings are an administrator-only control plane.
drop policy if exists system_settings_update_organizer on public.system_settings;
drop policy if exists system_settings_update_admin on public.system_settings;

-- Facial templates may only be read or changed by the organizer who has the
-- student in an event they own.  Direct administrator access is intentionally
-- absent; live facial verification uses its dedicated, audited RPC.
drop policy if exists facial_profiles_read on public.facial_profiles;
drop policy if exists facial_profiles_insert_organizer on public.facial_profiles;
drop policy if exists facial_profiles_update_organizer on public.facial_profiles;
drop policy if exists facial_profiles_delete_organizer on public.facial_profiles;
create policy facial_profiles_read_scoped on public.facial_profiles for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.organizer_can_access_student(student_id)));
create policy facial_profiles_insert_scoped on public.facial_profiles for insert to authenticated
  with check ((select private.organizer_can_access_student(student_id)));
create policy facial_profiles_update_scoped on public.facial_profiles for update to authenticated
  using ((select private.organizer_can_access_student(student_id)))
  with check ((select private.organizer_can_access_student(student_id)));
create policy facial_profiles_delete_scoped on public.facial_profiles for delete to authenticated
  using ((select private.organizer_can_access_student(student_id)));

create or replace function public.admin_manage_catalog_entry(
  p_table text,
  p_id uuid default null,
  p_values jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'Catalog values must be an object.' using errcode = '22023';
  end if;

  case p_table
    when 'departments' then
      if p_id is null then
        insert into public.departments (department_code, department_name, is_active)
        values (btrim(p_values->>'department_code'), btrim(p_values->>'department_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.departments set department_code = coalesce(nullif(btrim(p_values->>'department_code'), ''), department_code), department_name = coalesce(nullif(btrim(p_values->>'department_name'), ''), department_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'programs' then
      if p_id is null then
        insert into public.programs (department_id, program_code, program_name, is_active)
        values ((p_values->>'department_id')::uuid, btrim(p_values->>'program_code'), btrim(p_values->>'program_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.programs set department_id = coalesce((p_values->>'department_id')::uuid, department_id), program_code = coalesce(nullif(btrim(p_values->>'program_code'), ''), program_code), program_name = coalesce(nullif(btrim(p_values->>'program_name'), ''), program_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'sections' then
      if p_id is null then
        insert into public.sections (program_id, section_name, year_level, academic_year, semester, is_active)
        values ((p_values->>'program_id')::uuid, btrim(p_values->>'section_name'), (p_values->>'year_level')::integer, btrim(p_values->>'academic_year'), btrim(p_values->>'semester'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.sections set program_id = coalesce((p_values->>'program_id')::uuid, program_id), section_name = coalesce(nullif(btrim(p_values->>'section_name'), ''), section_name), year_level = coalesce((p_values->>'year_level')::integer, year_level), academic_year = coalesce(nullif(btrim(p_values->>'academic_year'), ''), academic_year), semester = coalesce(nullif(btrim(p_values->>'semester'), ''), semester), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    when 'event_categories' then
      if p_id is null then
        insert into public.event_categories (category_name, is_active)
        values (btrim(p_values->>'category_name'), coalesce((p_values->>'is_active')::boolean, true)) returning id into v_id;
      else
        update public.event_categories set category_name = coalesce(nullif(btrim(p_values->>'category_name'), ''), category_name), is_active = coalesce((p_values->>'is_active')::boolean, is_active) where id = p_id returning id into v_id;
      end if;
    else
      raise exception 'Unsupported catalog table.' using errcode = '22023';
  end case;

  if v_id is null then raise exception 'Catalog entry was not found.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), format('admin.catalog.%s', case when p_id is null then 'created' else 'updated' end), p_table, v_id, p_values);
  return v_id;
end;
$$;
revoke all on function public.admin_manage_catalog_entry(text, uuid, jsonb) from public, anon;
grant execute on function public.admin_manage_catalog_entry(text, uuid, jsonb) to authenticated;

create or replace function public.admin_update_system_settings(p_settings_id uuid, p_changes jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not (select private.is_active_admin()) then raise exception 'An active administrator account is required.' using errcode = '42501'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'Settings changes must be an object.' using errcode = '22023'; end if;
  update public.system_settings set
    institution_name = coalesce(nullif(btrim(p_changes->>'institution_name'), ''), institution_name),
    current_school_year = coalesce(nullif(btrim(p_changes->>'current_school_year'), ''), current_school_year),
    current_semester_id = coalesce((p_changes->>'current_semester_id')::uuid, current_semester_id),
    attendance_late_cutoff_minutes = coalesce((p_changes->>'attendance_late_cutoff_minutes')::integer, attendance_late_cutoff_minutes),
    default_session_duration_minutes = coalesce((p_changes->>'default_session_duration_minutes')::integer, default_session_duration_minutes),
    verification_policy = coalesce(nullif(btrim(p_changes->>'verification_policy'), ''), verification_policy),
    notification_preferences = coalesce(p_changes->'notification_preferences', notification_preferences),
    updated_at = now()
  where id = p_settings_id;
  if not found then raise exception 'System settings were not found.' using errcode = 'P0002'; end if;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), 'admin.system_settings.updated', 'system_settings', p_settings_id, p_changes);
end;
$$;
revoke all on function public.admin_update_system_settings(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_system_settings(uuid, jsonb) to authenticated;

commit;
