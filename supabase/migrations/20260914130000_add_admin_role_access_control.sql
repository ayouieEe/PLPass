begin;

-- Admin authorization is derived from the database profile and its required
-- admin_profiles row. It is intentionally not based on editable user metadata.
alter table public.profiles drop constraint if exists profiles_role_valid;
alter table public.profiles add constraint profiles_role_valid check (role in ('admin', 'organizer', 'student'));

create or replace function private.is_active_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles p
      join public.admin_profiles a on a.profile_id = p.id
      where p.id = (select auth.uid())
        and p.role = 'admin'
        and p.account_status = 'active'
    );
$$;
revoke all on function private.is_active_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_active_admin() to authenticated;

-- The existing policies remain the organizer/student policies. These additive
-- policies give active Admins global access without weakening other roles.
create policy profiles_read_admin on public.profiles for select to authenticated
  using ((select private.is_active_admin()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

drop policy if exists admin_profiles_read_all on public.admin_profiles;
create policy admin_profiles_read_admin on public.admin_profiles for select to authenticated
  using ((select private.is_active_admin()));
create policy admin_profiles_update_admin on public.admin_profiles for update to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

-- Admins need global operational visibility and management. Keep this list
-- explicit so newly-created tables do not accidentally inherit access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'students', 'organizers', 'faculty_profiles', 'departments', 'programs',
    'sections', 'semesters', 'subjects', 'rooms', 'event_categories',
    'classes', 'class_schedules', 'class_enrollments', 'class_rosters',
    'events', 'event_participants', 'event_sessions', 'attendance_sessions',
    'class_sessions', 'attendance_records', 'attendance_attempts',
    'attendance_requests', 'attendance_request_attachments',
    'credential_requests', 'qr_credentials', 'facial_profiles',
    'verification_devices', 'verification_attempts', 'generated_reports',
    'audit_logs', 'ml_predictions', 'notifications', 'system_settings',
    'event_resources', 'event_feedback', 'event_feedback_ratings',
    'event_feedback_tasks', 'event_feedback_task_objectives',
    'event_summary_snapshots', 'event_objectives'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', 'admin_global_' || table_name, table_name);
      execute format('create policy %I on public.%I for all to authenticated using ((select private.is_active_admin())) with check ((select private.is_active_admin()))', 'admin_global_' || table_name, table_name);
    end if;
  end loop;
end $$;

-- Organizer audit visibility is personal activity only. Admins retain the
-- global policy above; this replaces the previous organizer-wide read rule.
drop policy if exists audit_logs_read_organizer on public.audit_logs;
create policy audit_logs_read_organizer on public.audit_logs for select to authenticated
  using ((select private.is_active_admin()) or actor_user_id = (select auth.uid()));

drop policy if exists system_settings_update_organizer on public.system_settings;
create policy system_settings_update_admin on public.system_settings for update to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

commit;
