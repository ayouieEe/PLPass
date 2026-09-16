begin;

-- Supporting files follow the same ownership boundary as the correction
-- request itself: the submitting student or the organizer who owns its event.
drop policy if exists attendance_attachments_read on public.attendance_request_attachments;
create policy attendance_attachments_read on public.attendance_request_attachments
  for select to authenticated
  using (
    exists (
      select 1
      from public.attendance_requests request
      join public.attendance_records record on record.id = request.attendance_record_id
      join public.event_sessions session on session.id = record.event_session_id
      join public.events event on event.id = session.event_id
      where request.id = attendance_request_attachments.request_id
        and (
          request.student_id = (select private.current_student_id())
          or event.organizer_id = (select private.current_organizer_id())
        )
    )
  );

commit;
