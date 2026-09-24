begin;

-- Cover every foreign key reported by the linked Supabase advisor.  These
-- indexes are intentionally additive; existing indexes are not removed.
create index if not exists admin_profiles_department_id_idx on public.admin_profiles (department_id);
create index if not exists admin_profiles_profile_id_idx on public.admin_profiles (profile_id);
create index if not exists event_email_outbox_recipient_profile_id_idx on public.event_email_outbox (recipient_profile_id);
create index if not exists event_feedback_task_objectives_objective_id_idx on public.event_feedback_task_objectives (objective_id);
create index if not exists event_feedback_tasks_event_id_idx on public.event_feedback_tasks (event_id);
create index if not exists event_resources_created_by_idx on public.event_resources (created_by);
create index if not exists event_sessions_superseded_by_idx on public.event_sessions (superseded_by);
create index if not exists events_cancelled_by_idx on public.events (cancelled_by);
create index if not exists events_published_by_idx on public.events (published_by);
create index if not exists facial_enrollment_history_created_by_idx on public.facial_enrollment_history (created_by);
create index if not exists facial_enrollment_history_credential_request_id_idx on public.facial_enrollment_history (credential_request_id);
create index if not exists request_email_outbox_recipient_profile_id_idx on public.request_email_outbox (recipient_profile_id);
create index if not exists system_settings_current_semester_id_idx on public.system_settings (current_semester_id);
create index if not exists system_settings_updated_by_idx on public.system_settings (updated_by);
create index if not exists unverified_walkin_attendance_event_id_idx on public.unverified_walkin_attendance (event_id);
create index if not exists unverified_walkin_attendance_recorded_by_idx on public.unverified_walkin_attendance (recorded_by);

-- The advisor reports these authenticated SELECT policies as permissive
-- overlaps.  Preserve their exact predicates, but evaluate them through one
-- policy per table.  This is deliberately limited to the advisor's table set
-- and to SELECT policies; all other policies remain unchanged.
do $$
declare
  v_table text;
  v_policy record;
  v_qual text;
  v_policy_name text;
  v_tables constant text[] := array[
    'admin_profiles', 'attendance_records', 'audit_logs', 'credential_requests',
    'departments', 'event_categories', 'event_email_outbox', 'event_feedback',
    'event_feedback_ratings', 'event_feedback_task_objectives', 'event_feedback_tasks',
    'event_objectives', 'event_participants', 'event_resources', 'event_sessions',
    'event_summary_snapshots', 'events', 'facial_profiles', 'generated_reports',
    'ml_predictions', 'notifications', 'organizers', 'profiles', 'programs',
    'qr_credentials', 'request_email_outbox', 'sections', 'semesters', 'students',
    'system_settings'
  ];
begin
  foreach v_table in array v_tables loop
    select string_agg(format('(%s)', p.qual), ' OR ' order by p.policyname)
      into v_qual
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = v_table
       and p.cmd = 'SELECT'
       and p.permissive = 'PERMISSIVE'
       and p.roles @> array['authenticated']::name[];

    if v_qual is null then
      raise exception 'No authenticated SELECT policies found for %', v_table;
    end if;

    for v_policy in
      select p.policyname
        from pg_policies p
       where p.schemaname = 'public'
         and p.tablename = v_table
         and p.cmd = 'SELECT'
         and p.permissive = 'PERMISSIVE'
         and p.roles @> array['authenticated']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
    end loop;

    v_policy_name := 'authenticated_select_' || v_table;
    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      v_policy_name,
      v_table,
      v_qual
    );
  end loop;
end;
$$;

-- Keep intentionally frontend-callable RPCs available to authenticated users,
-- but remove implicit PUBLIC/anonymous execution.  Function signatures are
-- discovered from pg_proc so overloaded functions are handled safely.
do $$
declare
  v_function record;
  v_rpc_names constant text[] := array[
    'admin_list_credential_statuses', 'admin_manage_catalog_entry',
    'admin_retry_email_job', 'admin_run_data_consistency_check',
    'admin_update_system_settings', 'advance_event_attendance_capture_phase',
    'cancel_organizer_event', 'complete_facial_enrollment', 'create_organizer_event',
    'department_admin_issue_qr_credential', 'department_admin_list_credential_statuses',
    'department_admin_recover_stuck_attendance_session', 'department_admin_retry_event_email_job',
    'discard_empty_event_session', 'end_event_attendance_session',
    'generate_student_qr_credential', 'get_event_attendance_capture_phase',
    'get_facial_descriptor_for_organizer', 'get_live_facial_candidate_ids',
    'get_live_facial_candidates', 'issue_qr_credential', 'log_client_action',
    'organizer_list_invitation_students', 'prepare_offline_event_package',
    'reconcile_offline_event_session_end', 'reconcile_offline_event_session_start',
    'record_live_facial_attendance', 'record_manual_event_attendance',
    'reschedule_organizer_event', 'review_attendance_request', 'review_credential_request',
    'set_student_credential_status', 'start_event_attendance_session',
    'store_facial_descriptor', 'store_student_face_embedding', 'submit_event_late_reason',
    'submit_feedback_task', 'submit_late_reason', 'sync_offline_event_attendance',
    'sync_offline_walkin_attendance', 'update_organizer_event_metadata'
  ];
begin
  for v_function in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = any(v_rpc_names)
       and p.prosecdef
  loop
    execute format('revoke all on function %s from public', v_function.signature);
    execute format('grant execute on function %s to authenticated', v_function.signature);
  end loop;
end;
$$;

commit;
