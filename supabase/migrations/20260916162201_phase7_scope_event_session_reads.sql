begin;

drop policy if exists event_sessions_read on public.event_sessions;
create policy event_sessions_read on public.event_sessions for select to authenticated
  using (
    exists (
      select 1
      from public.events
      where events.id = event_sessions.event_id
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

commit;
