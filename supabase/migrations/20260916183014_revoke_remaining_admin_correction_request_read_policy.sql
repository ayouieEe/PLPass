begin;

-- A pre-Phase 6 migration used this policy name instead of the later
-- admin_operational_read_attendance_requests convention. Keep correction
-- request records restricted to their student owners and event organizers.
drop policy if exists admin_read_attendance_requests on public.attendance_requests;

commit;
