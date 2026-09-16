begin;

-- Organizers may operate only on events they own. Students retain access to
-- published public/participating events, while active admins use their
-- separate global-read policies.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (organizer_id = (select private.current_organizer_id()))
      or (
        (select private.current_student_id()) is not null
        and approval_status = 'approved'
        and event_status <> 'draft'
        and (
          visibility = 'public'
          or (select private.is_current_student_event_participant(events.id))
        )
      )
    )
  );

drop policy if exists events_update_owner on public.events;
create policy events_update_owner on public.events for update to authenticated
  using (organizer_id = (select private.current_organizer_id()))
  with check (organizer_id = (select private.current_organizer_id()));

drop policy if exists event_sessions_update_owner on public.event_sessions;
create policy event_sessions_update_owner on public.event_sessions for update to authenticated
  using (
    exists (
      select 1
      from public.events
      where events.id = event_sessions.event_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  )
  with check (
    exists (
      select 1
      from public.events
      where events.id = event_sessions.event_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  );

drop policy if exists credential_requests_read on public.credential_requests;
create policy credential_requests_read on public.credential_requests for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or (select private.organizer_can_access_student(student_id))
  );

drop policy if exists qr_credentials_read on public.qr_credentials;
create policy qr_credentials_read on public.qr_credentials for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or (select private.organizer_can_access_student(student_id))
  );

drop policy if exists event_summary_snapshots_read on public.event_summary_snapshots;
create policy event_summary_snapshots_read on public.event_summary_snapshots for select to authenticated
  using (
    exists (
      select 1
      from public.events
      where events.id = event_summary_snapshots.event_id
        and (
          events.organizer_id = (select private.current_organizer_id())
          or (
            (select private.current_student_id()) is not null
            and events.approval_status = 'approved'
            and events.event_status <> 'draft'
            and (
              events.visibility = 'public'
              or (select private.is_current_student_event_participant(events.id))
            )
          )
        )
    )
  );

drop policy if exists ml_predictions_read on public.ml_predictions;
create policy ml_predictions_read on public.ml_predictions for select to authenticated
  using (
    student_id = (select private.current_student_id())
    or exists (
      select 1
      from public.events
      where events.id = ml_predictions.event_id
        and events.organizer_id = (select private.current_organizer_id())
    )
  );

commit;
