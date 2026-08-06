begin;
-- Supabase's automatic-RLS event trigger must retain definer privileges so it
-- can secure newly created tables, but it must not be callable through the API.
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
-- Replace FOR ALL policies because they also create a second permissive SELECT
-- policy. Read access remains centralized in the existing scoped read policies.
drop policy qr_credentials_write_organizer on public.qr_credentials;
create policy qr_credentials_insert_organizer on public.qr_credentials for insert to authenticated
  with check ((select private.is_active_organizer()));
create policy qr_credentials_update_organizer on public.qr_credentials for update to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));
create policy qr_credentials_delete_organizer on public.qr_credentials for delete to authenticated
  using ((select private.is_active_organizer()));
drop policy facial_profiles_write_organizer on public.facial_profiles;
create policy facial_profiles_insert_organizer on public.facial_profiles for insert to authenticated
  with check ((select private.is_active_organizer()));
create policy facial_profiles_update_organizer on public.facial_profiles for update to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));
create policy facial_profiles_delete_organizer on public.facial_profiles for delete to authenticated
  using ((select private.is_active_organizer()));
commit;
