-- requested_status already exists as constrained text in the linked PLPass schema.
-- Add the access-path needed by the student request history screen.
create index if not exists attendance_requests_student_status_idx
  on public.attendance_requests (student_id, request_status, created_at desc);
