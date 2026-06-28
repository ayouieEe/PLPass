-- Phase 9 PLPass constraint/index review draft.
-- Do not apply automatically. Review against the live Supabase schema first.

-- One active NFC credential per student.
create unique index if not exists nfc_credentials_one_active_per_student
  on public.nfc_credentials (student_id)
  where nfc_status = 'activated';

-- One attendance record per student per class session.
create unique index if not exists attendance_records_one_per_student_class_session
  on public.attendance_records (student_id, class_session_id)
  where class_session_id is not null;

-- One attendance record per student per event session.
create unique index if not exists attendance_records_one_per_student_event_session
  on public.attendance_records (student_id, event_session_id)
  where event_session_id is not null;

-- Exactly one session reference.
alter table public.attendance_records
  add constraint attendance_records_exactly_one_session
  check (
    (class_session_id is not null and event_session_id is null)
    or
    (class_session_id is null and event_session_id is not null)
  );

create unique index if not exists class_enrollments_one_student_per_class
  on public.class_enrollments (class_id, student_id);

create unique index if not exists event_participants_one_student_per_event
  on public.event_participants (event_id, student_id);

create unique index if not exists students_unique_student_id
  on public.students (student_id);

create unique index if not exists subjects_unique_subject_code
  on public.subjects (subject_code);

create unique index if not exists events_unique_event_code
  on public.events (event_code);

create unique index if not exists rooms_unique_room_code
  on public.rooms (room_code);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists students_profile_id_idx on public.students (profile_id);
create index if not exists faculty_profile_id_idx on public.faculty (profile_id);
create index if not exists organizers_profile_id_idx on public.organizers (profile_id);
create index if not exists classes_faculty_id_idx on public.classes (faculty_id);
create index if not exists class_enrollments_class_id_idx on public.class_enrollments (class_id);
create index if not exists class_enrollments_student_id_idx on public.class_enrollments (student_id);
create index if not exists class_sessions_class_id_idx on public.class_sessions (class_id);
create index if not exists event_sessions_event_id_idx on public.event_sessions (event_id);
create index if not exists event_participants_event_id_idx on public.event_participants (event_id);
create index if not exists event_participants_student_id_idx on public.event_participants (student_id);
create index if not exists attendance_records_student_id_idx on public.attendance_records (student_id);
create index if not exists attendance_records_class_session_id_idx on public.attendance_records (class_session_id);
create index if not exists attendance_records_event_session_id_idx on public.attendance_records (event_session_id);
create index if not exists notifications_recipient_id_idx on public.notifications (recipient_id);
create index if not exists credential_requests_student_id_idx on public.credential_requests (student_id);
