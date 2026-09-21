-- Department-admin read scope for reports and audit logs.
-- This is intentionally read-only: no rows, functions, grants, or event controls change.
begin;

drop policy if exists generated_reports_read_department_admin on public.generated_reports;
create policy generated_reports_read_department_admin on public.generated_reports
  for select to authenticated
  using (
    (select private.is_active_department_admin())
    and exists (
      select 1
      from public.organizers o
      where o.profile_id = generated_reports.generated_by
        and o.department_id = (select private.current_department_id())
    )
  );

drop policy if exists audit_logs_read_department_admin on public.audit_logs;
create policy audit_logs_read_department_admin on public.audit_logs
  for select to authenticated
  using (
    (select private.is_active_department_admin())
    and (
      (target_type = 'department' and target_id = (select private.current_department_id()))
      or (target_type = 'event' and exists (
        select 1 from public.events e
        where e.id = audit_logs.target_id
          and e.department_id = (select private.current_department_id())
      ))
      or (target_type = 'event_session' and exists (
        select 1
        from public.event_sessions es
        join public.events e on e.id = es.event_id
        where es.id = audit_logs.target_id
          and e.department_id = (select private.current_department_id())
      ))
      or (target_type = 'attendance_record' and exists (
        select 1
        from public.attendance_records ar
        join public.event_sessions es on es.id = ar.event_session_id
        join public.events e on e.id = es.event_id
        where ar.id = audit_logs.target_id
          and e.department_id = (select private.current_department_id())
      ))
      or (target_type = 'event_participant' and exists (
        select 1
        from public.event_participants ep
        join public.events e on e.id = ep.event_id
        where ep.id = audit_logs.target_id
          and e.department_id = (select private.current_department_id())
      ))
    )
  );

commit;
