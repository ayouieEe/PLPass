-- Department-admin audit access is actor-scoped.  A department admin may see
-- their own actions and actions taken by organizers or students assigned to
-- their department, but never university-admin or other-department activity.
-- RLS remains the authorization boundary; the client-side role filter is only
-- a presentation control.
begin;

drop policy if exists audit_logs_read_department_admin on public.audit_logs;
create policy audit_logs_read_department_admin on public.audit_logs
for select to authenticated
using (
  (select private.is_active_department_admin())
  and (select private.current_department_id()) is not null
  and (
    audit_logs.actor_user_id = (select auth.uid())
    or exists (
      select 1
      from public.organizers as organizer
      where organizer.profile_id = audit_logs.actor_user_id
        and organizer.department_id = (select private.current_department_id())
    )
    or exists (
      select 1
      from public.students as student
      where student.profile_id = audit_logs.actor_user_id
        and student.department_id = (select private.current_department_id())
    )
  )
);

commit;
