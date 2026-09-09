begin;

-- The organizer-facing attendance RPC must be callable by signed-in users.
-- Authorization remains enforced inside the function by the active-organizer
-- and event-ownership checks; anonymous callers remain denied.
revoke all on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer)
  from public, anon;
grant execute on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer)
  to authenticated;

commit;
