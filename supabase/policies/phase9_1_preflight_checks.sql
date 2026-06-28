-- Phase 9.1 read-only preflight checks.
-- Safe to run manually before approving migrations. These queries do not modify data.

-- Duplicate class enrollments.
select class_id, student_id, count(*) as duplicate_count
from public.class_enrollments
where class_id is not null and student_id is not null
group by class_id, student_id
having count(*) > 1;

-- Duplicate event participants.
select event_id, student_id, count(*) as duplicate_count
from public.event_participants
where event_id is not null and student_id is not null
group by event_id, student_id
having count(*) > 1;

-- Duplicate attendance records per class session.
select student_id, class_session_id, count(*) as duplicate_count
from public.attendance_records
where student_id is not null and class_session_id is not null
group by student_id, class_session_id
having count(*) > 1;

-- Duplicate attendance records per event session.
select student_id, event_session_id, count(*) as duplicate_count
from public.attendance_records
where student_id is not null and event_session_id is not null
group by student_id, event_session_id
having count(*) > 1;

-- Attendance records with both session IDs filled.
select id, attendance_type, student_id, class_session_id, event_session_id
from public.attendance_records
where class_session_id is not null
  and event_session_id is not null;

-- Attendance records with neither session ID filled.
select id, attendance_type, student_id, class_session_id, event_session_id
from public.attendance_records
where class_session_id is null
  and event_session_id is null;

-- Class attendance rows not aligned to class_session_id only.
select id, attendance_type, student_id, class_session_id, event_session_id
from public.attendance_records
where attendance_type = 'class'
  and (class_session_id is null or event_session_id is not null);

-- Event attendance rows not aligned to event_session_id only.
select id, attendance_type, student_id, class_session_id, event_session_id
from public.attendance_records
where attendance_type = 'event'
  and (event_session_id is null or class_session_id is not null);

-- Existing NFC credentials that would conflict with one active credential per student.
select student_id, count(*) as active_credential_count
from public.nfc_credentials
where nfc_status = 'activated'
  and student_id is not null
group by student_id
having count(*) > 1;

-- Existing pending duplicate correction requests by request type.
select student_id, attendance_record_id, request_type, count(*) as pending_duplicate_count
from public.attendance_requests
where request_status = 'pending'
  and student_id is not null
  and attendance_record_id is not null
  and request_type is not null
group by student_id, attendance_record_id, request_type
having count(*) > 1;

-- Credential requests with null created_at that would prevent setting NOT NULL.
select id, student_id, request_type, status
from public.credential_requests
where created_at is null;
