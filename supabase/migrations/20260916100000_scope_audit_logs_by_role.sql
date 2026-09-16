begin;

-- Administrators can review the centralized audit trail. Organizers can only
-- review actions recorded by their own account.
drop policy if exists audit_logs_read_organizer on public.audit_logs;
drop policy if exists audit_logs_read_admin_or_organizer on public.audit_logs;

create policy audit_logs_read_admin_or_organizer on public.audit_logs
  for select
  to authenticated
  using (
    (select private.is_active_admin())
    or (
      (select private.is_active_organizer())
      and actor_user_id = (select auth.uid())
    )
  );

commit;
