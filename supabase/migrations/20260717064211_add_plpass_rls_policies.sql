begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and account_status = 'active'
    );
$$;
create or replace function private.is_active_organizer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'organizer'
        and account_status = 'active'
    )
    and exists (
      select 1
      from public.organizers
      where profile_id = (select auth.uid())
        and organizer_status = 'active'
    );
$$;
create or replace function private.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select students.id
  from public.students
  join public.profiles on profiles.id = students.profile_id
  where students.profile_id = (select auth.uid())
    and profiles.role = 'student'
    and profiles.account_status = 'active'
    and students.student_status = 'enrolled'
  limit 1;
$$;
create or replace function private.current_organizer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organizers.id
  from public.organizers
  join public.profiles on profiles.id = organizers.profile_id
  where organizers.profile_id = (select auth.uid())
    and profiles.role = 'organizer'
    and profiles.account_status = 'active'
    and organizers.organizer_status = 'active'
  limit 1;
$$;
revoke all on function private.is_active_user() from public, anon, authenticated;
revoke all on function private.is_active_organizer() from public, anon, authenticated;
revoke all on function private.current_student_id() from public, anon, authenticated;
revoke all on function private.current_organizer_id() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_active_organizer() to authenticated;
grant execute on function private.current_student_id() to authenticated;
grant execute on function private.current_organizer_id() to authenticated;
grant usage on schema public to authenticated;
grant select on table
  public.departments,
  public.programs,
  public.sections,
  public.semesters,
  public.subjects,
  public.rooms,
  public.event_categories,
  public.classes,
  public.class_schedules
to authenticated;
create policy departments_read on public.departments for select to authenticated
  using ((select private.is_active_user()));
create policy programs_read on public.programs for select to authenticated
  using ((select private.is_active_user()));
create policy sections_read on public.sections for select to authenticated
  using ((select private.is_active_user()));
create policy semesters_read on public.semesters for select to authenticated
  using ((select private.is_active_user()));
create policy subjects_read on public.subjects for select to authenticated
  using ((select private.is_active_user()));
create policy rooms_read on public.rooms for select to authenticated
  using ((select private.is_active_user()));
create policy event_categories_read on public.event_categories for select to authenticated
  using ((select private.is_active_user()));
create policy classes_read on public.classes for select to authenticated
  using ((select private.is_active_user()));
create policy class_schedules_read on public.class_schedules for select to authenticated
  using ((select private.is_active_user()));
grant select on public.profiles to authenticated;
grant update (first_name, middle_name, last_name, profile_picture, updated_at)
  on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_active_organizer()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_active_user()))
  with check (id = (select auth.uid()) and (select private.is_active_user()));
grant select on public.students, public.organizers, public.class_enrollments to authenticated;
grant insert, update, delete on public.class_enrollments to authenticated;
create policy students_read on public.students for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_active_organizer()));
create policy organizers_read on public.organizers for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_active_organizer()));
create policy class_enrollments_read on public.class_enrollments for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or (select private.is_active_organizer())
  );
create policy class_enrollments_insert_organizer on public.class_enrollments for insert to authenticated
  with check ((select private.is_active_organizer()));
create policy class_enrollments_update_organizer on public.class_enrollments for update to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));
create policy class_enrollments_delete_organizer on public.class_enrollments for delete to authenticated
  using ((select private.is_active_organizer()));
grant select, insert, update, delete on public.events, public.event_participants, public.event_sessions to authenticated;
grant select on public.class_sessions to authenticated;
create policy events_read on public.events for select to authenticated
  using (
    (select private.is_active_user())
    and (
      approval_status = 'approved'
      or organizer_id = (select private.current_organizer_id())
    )
  );
create policy events_insert_owner on public.events for insert to authenticated
  with check (
    (select private.is_active_organizer())
    and organizer_id = (select private.current_organizer_id())
  );
create policy events_update_owner on public.events for update to authenticated
  using (organizer_id = (select private.current_organizer_id()))
  with check (organizer_id = (select private.current_organizer_id()));
create policy events_delete_owner on public.events for delete to authenticated
  using (organizer_id = (select private.current_organizer_id()));
create policy event_participants_read on public.event_participants for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (
      select 1 from public.events
      where events.id = event_participants.event_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  );
create policy event_participants_insert_owner on public.event_participants for insert to authenticated
  with check (exists (
    select 1 from public.events
    where events.id = event_participants.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy event_participants_update_owner on public.event_participants for update to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_participants.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ))
  with check (exists (
    select 1 from public.events
    where events.id = event_participants.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy event_participants_delete_owner on public.event_participants for delete to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_participants.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy class_sessions_read on public.class_sessions for select to authenticated
  using ((select private.is_active_user()));
create policy event_sessions_read on public.event_sessions for select to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_sessions.event_id
      and (
        events.approval_status = 'approved'
        or events.organizer_id = (select private.current_organizer_id())
      )
  ));
create policy event_sessions_insert_owner on public.event_sessions for insert to authenticated
  with check (exists (
    select 1 from public.events
    where events.id = event_sessions.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy event_sessions_update_owner on public.event_sessions for update to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_sessions.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ))
  with check (exists (
    select 1 from public.events
    where events.id = event_sessions.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy event_sessions_delete_owner on public.event_sessions for delete to authenticated
  using (exists (
    select 1 from public.events
    where events.id = event_sessions.event_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
grant select (id, student_id, credential_status, issued_at, expires_at, revoked_at, last_successful_check_in_at, created_at, updated_at)
  on public.qr_credentials to authenticated;
grant insert, update, delete on public.qr_credentials to authenticated;
grant select (id, student_id, facial_status, enrolled_at, last_verified_at, consent_recorded_at, created_at, updated_at)
  on public.facial_profiles to authenticated;
grant insert, update, delete on public.facial_profiles to authenticated;
create policy qr_credentials_read on public.qr_credentials for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.is_active_organizer()));
create policy qr_credentials_write_organizer on public.qr_credentials for all to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));
create policy facial_profiles_read on public.facial_profiles for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.is_active_organizer()));
create policy facial_profiles_write_organizer on public.facial_profiles for all to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));
grant select, insert, update, delete on public.verification_devices to authenticated;
create policy verification_devices_read_organizer on public.verification_devices for select to authenticated
  using ((select private.is_active_organizer()));
create policy verification_devices_write_organizer on public.verification_devices for all to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));
grant select, insert on public.verification_attempts to authenticated;
create policy verification_attempts_read on public.verification_attempts for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (
      select 1
      from public.event_sessions
      join public.events on events.id = event_sessions.event_id
      where event_sessions.id = verification_attempts.event_session_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  );
create policy verification_attempts_insert_owner on public.verification_attempts for insert to authenticated
  with check (
    (select private.is_active_organizer())
    and exists (
      select 1
      from public.event_sessions
      join public.events on events.id = event_sessions.event_id
      where event_sessions.id = verification_attempts.event_session_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  );
grant select, insert, update on public.attendance_records to authenticated;
create policy attendance_records_read on public.attendance_records for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (
      select 1
      from public.event_sessions
      join public.events on events.id = event_sessions.event_id
      where event_sessions.id = attendance_records.event_session_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  );
create policy attendance_records_insert_owner on public.attendance_records for insert to authenticated
  with check (exists (
    select 1
    from public.event_sessions
    join public.events on events.id = event_sessions.event_id
    where event_sessions.id = attendance_records.event_session_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
create policy attendance_records_update_owner on public.attendance_records for update to authenticated
  using (exists (
    select 1
    from public.event_sessions
    join public.events on events.id = event_sessions.event_id
    where event_sessions.id = attendance_records.event_session_id
      and events.organizer_id = (select private.current_organizer_id())
  ))
  with check (exists (
    select 1
    from public.event_sessions
    join public.events on events.id = event_sessions.event_id
    where event_sessions.id = attendance_records.event_session_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
grant select, insert, update on public.attendance_requests to authenticated;
create policy attendance_requests_read on public.attendance_requests for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (
      select 1
      from public.attendance_records
      join public.event_sessions on event_sessions.id = attendance_records.event_session_id
      join public.events on events.id = event_sessions.event_id
      where attendance_records.id = attendance_requests.attendance_record_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  );
create policy attendance_requests_insert_self on public.attendance_requests for insert to authenticated
  with check (student_id = (select private.current_student_id()));
create policy attendance_requests_update_organizer on public.attendance_requests for update to authenticated
  using (exists (
    select 1
    from public.attendance_records
    join public.event_sessions on event_sessions.id = attendance_records.event_session_id
    join public.events on events.id = event_sessions.event_id
    where attendance_records.id = attendance_requests.attendance_record_id
      and events.organizer_id = (select private.current_organizer_id())
  ))
  with check (exists (
    select 1
    from public.attendance_records
    join public.event_sessions on event_sessions.id = attendance_records.event_session_id
    join public.events on events.id = event_sessions.event_id
    where attendance_records.id = attendance_requests.attendance_record_id
      and events.organizer_id = (select private.current_organizer_id())
  ));
grant select, insert, delete on public.attendance_request_attachments to authenticated;
create policy attendance_attachments_read on public.attendance_request_attachments for select to authenticated
  using (exists (
    select 1 from public.attendance_requests
    where attendance_requests.id = attendance_request_attachments.request_id
      and (
        attendance_requests.student_id = (select private.current_student_id())
        or (select private.is_active_organizer())
      )
  ));
create policy attendance_attachments_insert_self on public.attendance_request_attachments for insert to authenticated
  with check (exists (
    select 1 from public.attendance_requests
    where attendance_requests.id = attendance_request_attachments.request_id
      and attendance_requests.student_id = (select private.current_student_id())
      and attendance_requests.request_status = 'pending'
  ));
create policy attendance_attachments_delete_self on public.attendance_request_attachments for delete to authenticated
  using (exists (
    select 1 from public.attendance_requests
    where attendance_requests.id = attendance_request_attachments.request_id
      and attendance_requests.student_id = (select private.current_student_id())
      and attendance_requests.request_status = 'pending'
  ));
grant select, insert, update on public.credential_requests to authenticated;
create policy credential_requests_read on public.credential_requests for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.is_active_organizer()));
create policy credential_requests_insert_self on public.credential_requests for insert to authenticated
  with check (student_id = (select private.current_student_id()));
create policy credential_requests_update_organizer on public.credential_requests for update to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));
grant select, update (notification_status, read_at) on public.notifications to authenticated;
create policy notifications_read_self on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and (select private.is_active_user()));
create policy notifications_update_self on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()) and (select private.is_active_user()))
  with check (recipient_id = (select auth.uid()) and (select private.is_active_user()));
grant select, insert on public.generated_reports to authenticated;
create policy generated_reports_read_owner on public.generated_reports for select to authenticated
  using (generated_by = (select auth.uid()) and (select private.is_active_organizer()));
create policy generated_reports_insert_owner on public.generated_reports for insert to authenticated
  with check (generated_by = (select auth.uid()) and (select private.is_active_organizer()));
grant select on public.audit_logs to authenticated;
create policy audit_logs_read_organizer on public.audit_logs for select to authenticated
  using ((select private.is_active_organizer()));
grant select on public.ml_predictions to authenticated;
create policy ml_predictions_read on public.ml_predictions for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.is_active_organizer()));
grant select, update on public.system_settings to authenticated;
create policy system_settings_read on public.system_settings for select to authenticated
  using ((select private.is_active_user()));
create policy system_settings_update_organizer on public.system_settings for update to authenticated
  using ((select private.is_active_organizer()))
  with check ((select private.is_active_organizer()));
commit;
