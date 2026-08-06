begin;
-- Temporary server-side permissions for the reviewed PLPass dummy-data seed.
-- A follow-up migration revokes these grants immediately after verification.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
commit;
