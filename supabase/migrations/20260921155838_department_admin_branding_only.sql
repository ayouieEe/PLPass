-- Organizers may read their existing branding for reports, but branding changes
-- are managed by administrators; department admins can only change their own
-- department branding through the departments table and department storage path.

drop policy if exists organizers_update_own_branding on public.organizers;
create policy organizers_update_admin_branding on public.organizers
  for update to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

drop policy if exists branding_assets_read on storage.objects;
create policy branding_assets_read on storage.objects for select to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (storage.foldername(name))[1] = (select private.current_organizer_id())::text
      or (
        (select private.is_active_department_admin())
        and (storage.foldername(name))[1] = 'departments'
        and (storage.foldername(name))[2] = (select private.current_department_id())::text
      )
    )
  );

drop policy if exists branding_assets_insert on storage.objects;
create policy branding_assets_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (
        (select private.is_active_department_admin())
        and (storage.foldername(name))[1] = 'departments'
        and (storage.foldername(name))[2] = (select private.current_department_id())::text
      )
    )
  );

drop policy if exists branding_assets_update on storage.objects;
create policy branding_assets_update on storage.objects for update to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (
        (select private.is_active_department_admin())
        and (storage.foldername(name))[1] = 'departments'
        and (storage.foldername(name))[2] = (select private.current_department_id())::text
      )
    )
  )
  with check (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (
        (select private.is_active_department_admin())
        and (storage.foldername(name))[1] = 'departments'
        and (storage.foldername(name))[2] = (select private.current_department_id())::text
      )
    )
  );

drop policy if exists branding_assets_delete on storage.objects;
create policy branding_assets_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'branding-assets'
    and (
      (select private.is_active_admin())
      or (
        (select private.is_active_department_admin())
        and (storage.foldername(name))[1] = 'departments'
        and (storage.foldername(name))[2] = (select private.current_department_id())::text
      )
    )
  );
