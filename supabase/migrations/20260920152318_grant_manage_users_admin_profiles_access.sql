-- The manage-users Edge Function uses the service role for its protected
-- account-management transaction. Keep frontend access governed by RLS while
-- restoring only the DML it needs for admin creation, updates, and rollback.
grant select, insert, update, delete on public.admin_profiles to service_role;
