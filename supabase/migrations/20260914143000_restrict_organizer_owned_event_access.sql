begin;

-- Organizer authorization is based on the event owner boundary. These helpers
-- run with database privileges so the ownership check cannot be widened by a
-- client-side join or an editable profile claim.
create or replace function private.organizer_owns_event(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select private.is_active_organizer())
    and exists (
      select 1 from public.events
      where id = p_event_id
        and organizer_id = (select private.current_organizer_id())
    );
$$;

create or replace function private.organizer_can_access_student(p_student_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select private.is_active_organizer())
    and exists (
      select 1
      from public.event_participants ep
      join public.events e on e.id = ep.event_id
      where ep.student_id = p_student_id
        and ep.participant_status <> 'removed'
        and e.organizer_id = (select private.current_organizer_id())
    );
$$;

create or replace function private.organizer_can_access_attendance_request(p_request_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select private.is_active_organizer())
    and exists (
      select 1
      from public.attendance_requests ar
      join public.attendance_records rec on rec.id = ar.attendance_record_id
      join public.event_sessions es on es.id = rec.event_session_id
      join public.events e on e.id = es.event_id
      where ar.id = p_request_id
        and e.organizer_id = (select private.current_organizer_id())
    );
$$;

revoke all on function private.organizer_owns_event(uuid) from public, anon, authenticated;
revoke all on function private.organizer_can_access_student(uuid) from public, anon, authenticated;
revoke all on function private.organizer_can_access_attendance_request(uuid) from public, anon, authenticated;
grant execute on function private.organizer_owns_event(uuid) to authenticated;
grant execute on function private.organizer_can_access_student(uuid) to authenticated;
grant execute on function private.organizer_can_access_attendance_request(uuid) to authenticated;

-- Organizers must not see approved events owned by another organizer.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using ((select private.organizer_owns_event(id))
    or ((select private.current_student_id()) is not null
      and approval_status in ('approved', 'completed')
      and exists (select 1 from public.event_participants ep where ep.event_id = events.id and ep.student_id = (select private.current_student_id()))));

drop policy if exists students_read on public.students;
create policy students_read on public.students for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.organizer_can_access_student(id)));

drop policy if exists organizers_read on public.organizers;
create policy organizers_read on public.organizers for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists event_sessions_read on public.event_sessions;
create policy event_sessions_read on public.event_sessions for select to authenticated
  using ((select private.organizer_owns_event(event_id))
    or ((select private.current_student_id()) is not null
      and exists (select 1 from public.event_participants ep where ep.event_id = event_sessions.event_id and ep.student_id = (select private.current_student_id()))));

drop policy if exists event_objectives_read on public.event_objectives;
create policy event_objectives_read on public.event_objectives for select to authenticated
  using ((select private.organizer_owns_event(event_id))
    or ((select private.current_student_id()) is not null
      and exists (select 1 from public.event_participants ep where ep.event_id = event_objectives.event_id and ep.student_id = (select private.current_student_id()))));

drop policy if exists event_summary_snapshots_read on public.event_summary_snapshots;
create policy event_summary_snapshots_read on public.event_summary_snapshots for select to authenticated
  using ((select private.organizer_owns_event(event_id))
    or ((select private.current_student_id()) is not null
      and exists (select 1 from public.event_participants ep where ep.event_id = event_summary_snapshots.event_id and ep.student_id = (select private.current_student_id()))));

drop policy if exists event_feedback_read on public.event_feedback;
create policy event_feedback_read on public.event_feedback for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.organizer_owns_event(event_id)));

drop policy if exists event_feedback_ratings_read on public.event_feedback_ratings;
create policy event_feedback_ratings_read on public.event_feedback_ratings for select to authenticated
  using (exists (
    select 1 from public.event_feedback feedback
    where feedback.id = event_feedback_ratings.feedback_id
      and (feedback.student_id = (select private.current_student_id()) or (select private.organizer_owns_event(feedback.event_id)))
  ));

drop policy if exists qr_credentials_read on public.qr_credentials;
create policy qr_credentials_read on public.qr_credentials for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.organizer_can_access_student(student_id)));
drop policy if exists qr_credentials_write_organizer on public.qr_credentials;
create policy qr_credentials_write_organizer on public.qr_credentials for all to authenticated
  using ((select private.organizer_can_access_student(student_id)))
  with check ((select private.organizer_can_access_student(student_id)));

drop policy if exists facial_profiles_read on public.facial_profiles;
create policy facial_profiles_read on public.facial_profiles for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.organizer_can_access_student(student_id)));
drop policy if exists facial_profiles_write_organizer on public.facial_profiles;
create policy facial_profiles_write_organizer on public.facial_profiles for all to authenticated
  using ((select private.organizer_can_access_student(student_id)))
  with check ((select private.organizer_can_access_student(student_id)));

drop policy if exists credential_requests_read on public.credential_requests;
create policy credential_requests_read on public.credential_requests for select to authenticated
  using (student_id = (select private.current_student_id()) or (select private.organizer_can_access_student(student_id)));
drop policy if exists credential_requests_update_organizer on public.credential_requests;
create policy credential_requests_update_organizer on public.credential_requests for update to authenticated
  using ((select private.organizer_can_access_student(student_id)))
  with check ((select private.organizer_can_access_student(student_id)));

drop policy if exists attendance_attachments_read on public.attendance_request_attachments;
create policy attendance_attachments_read on public.attendance_request_attachments for select to authenticated
  using (exists (
    select 1 from public.attendance_requests ar
    where ar.id = attendance_request_attachments.request_id
      and (ar.student_id = (select private.current_student_id()) or (select private.organizer_can_access_attendance_request(ar.id)))
  ));

drop policy if exists ml_predictions_read on public.ml_predictions;
create policy ml_predictions_read on public.ml_predictions for select to authenticated
  using (student_id = (select private.current_student_id())
    or (event_id is not null and (select private.organizer_owns_event(event_id))));

drop policy if exists system_settings_update_organizer on public.system_settings;
drop policy if exists system_settings_update_admin on public.system_settings;
create policy system_settings_update_admin on public.system_settings for update to authenticated
  using ((select private.is_active_admin()))
  with check ((select private.is_active_admin()));

commit;
