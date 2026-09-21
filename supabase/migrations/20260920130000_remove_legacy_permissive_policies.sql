-- Remove legacy permissive policies after confirming their scoped replacements
-- exist on PLPass Current. This migration changes policy metadata only:
-- no rows, functions, grants, or historical outbox records are modified.
begin;

drop policy if exists "Allow authenticated read profiles" on public.profiles;
drop policy if exists "Allow authenticated read students" on public.students;
drop policy if exists event_email_outbox_insert_system on public.event_email_outbox;

commit;
