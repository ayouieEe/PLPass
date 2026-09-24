-- These privileged helpers are invoked only by other trusted database routines.
-- They are not part of the browser RPC surface, so deny direct authenticated
-- execution while preserving server-side function composition.
revoke execute on function public.create_organizer_event(
  text, uuid, text, text, text, timestamptz, timestamptz, text, numeric,
  text, uuid[], text[], text, text, text
) from authenticated;

revoke execute on function public.finalize_event_attendance_session(
  uuid, text, jsonb
) from authenticated;

revoke execute on function public.identify_event_participant_by_face(
  uuid, jsonb
) from authenticated;
