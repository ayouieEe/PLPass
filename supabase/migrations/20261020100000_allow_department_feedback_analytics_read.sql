begin;

-- Department admins may review sentiment for events owned by their department.
-- Keep the boundary on the event row so feedback and snapshots cannot escape
-- the department scope enforced by the rest of the analytics surface.
drop policy if exists department_admin_read_event_feedback_analytics on public.event_feedback;
create policy department_admin_read_event_feedback_analytics
  on public.event_feedback for select to authenticated
  using (
    (select private.is_active_department_admin())
    and exists (
      select 1
      from public.events
      where events.id = event_feedback.event_id
        and events.department_id = (select private.current_department_id())
    )
  );

drop policy if exists department_admin_read_event_summary_analytics on public.event_summary_snapshots;
create policy department_admin_read_event_summary_analytics
  on public.event_summary_snapshots for select to authenticated
  using (
    (select private.is_active_department_admin())
    and exists (
      select 1
      from public.events
      where events.id = event_summary_snapshots.event_id
        and events.department_id = (select private.current_department_id())
    )
  );

commit;
