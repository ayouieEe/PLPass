begin;

-- Correction requests are student-to-organizer workflows. Administrators do
-- not receive a general read or write path to request records or proof files.
-- Remove both historical policy names defensively so this remains safe on
-- databases that applied either the original or Phase 6 policy set.
drop policy if exists admin_global_attendance_requests on public.attendance_requests;
drop policy if exists admin_operational_read_attendance_requests on public.attendance_requests;
drop policy if exists admin_global_attendance_request_attachments on public.attendance_request_attachments;
drop policy if exists admin_operational_read_attendance_request_attachments on public.attendance_request_attachments;

commit;
