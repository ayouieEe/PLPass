begin;

-- Admin operational screens are read-only. Remove the broad policies created
-- by the initial admin access migration so a direct client request cannot
-- mutate events, sessions, attendance, or event child records.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'events', 'event_participants', 'event_sessions', 'attendance_sessions',
    'attendance_records', 'attendance_attempts', 'event_objectives',
    'event_summary_snapshots', 'event_feedback', 'event_feedback_ratings',
    'event_feedback_tasks', 'event_feedback_task_objectives', 'event_resources',
    'generated_reports', 'ml_predictions', 'attendance_requests',
    'attendance_request_attachments'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', 'admin_global_' || table_name, table_name);
      execute format('drop policy if exists %I on public.%I', 'admin_operational_read_' || table_name, table_name);
      execute format(
        'create policy %I on public.%I for select to authenticated using ((select private.is_active_admin()))',
        'admin_operational_read_' || table_name,
        table_name
      );
    end if;
  end loop;
end $$;

-- Raw biometric descriptors and verification attempts are never part of the
-- admin operational read surface. Controlled credential actions must use the
-- dedicated reset/revoke workflow instead of direct table access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['facial_profiles', 'verification_attempts'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists %I on public.%I', 'admin_global_' || table_name, table_name);
    end if;
  end loop;
end $$;

commit;
