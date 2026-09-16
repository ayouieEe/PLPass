begin;

-- Catalogs and attendance policy options are institution-wide configuration.
-- Organizers must not be able to mutate them directly.
drop policy if exists departments_settings_write on public.departments;
drop policy if exists programs_settings_write on public.programs;
drop policy if exists sections_settings_write on public.sections;
drop policy if exists event_categories_settings_write on public.event_categories;
drop policy if exists attendance_late_reason_options_manage on public.attendance_late_reason_options;
drop policy if exists attendance_late_reason_translations_manage on public.attendance_late_reason_option_translations;

-- Credential workflow mutations remain available only for students assigned to
-- an event owned by the current organizer; active-organizer status alone is
-- never a sufficient authorization boundary.
drop policy if exists credential_requests_update_organizer on public.credential_requests;
create policy credential_requests_update_scoped on public.credential_requests for update to authenticated
  using ((select private.organizer_can_access_student(student_id)))
  with check ((select private.organizer_can_access_student(student_id)));

drop policy if exists qr_credentials_update_organizer on public.qr_credentials;
drop policy if exists qr_credentials_delete_organizer on public.qr_credentials;
create policy qr_credentials_update_scoped on public.qr_credentials for update to authenticated
  using ((select private.organizer_can_access_student(student_id)))
  with check ((select private.organizer_can_access_student(student_id)));
create policy qr_credentials_delete_scoped on public.qr_credentials for delete to authenticated
  using ((select private.organizer_can_access_student(student_id)));

commit;
