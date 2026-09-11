begin;
create table public.events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null,
  organizer_id uuid not null references public.organizers(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  category_id uuid not null references public.event_categories(id) on delete restrict,
  title text not null,
  description text,
  venue text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  event_status text not null default 'draft',
  approval_status text not null default 'pending',
  approval_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_code_not_blank check (btrim(event_code) <> ''),
  constraint events_title_not_blank check (btrim(title) <> ''),
  constraint events_venue_not_blank check (btrim(venue) <> ''),
  constraint events_time_order_valid check (ends_at > starts_at),
  constraint events_status_valid check (event_status in ('draft', 'scheduled', 'ongoing', 'completed', 'cancelled')),
  constraint events_approval_status_valid check (approval_status in ('pending', 'approved', 'declined'))
);
create unique index events_code_unique_idx on public.events (lower(event_code));
create index events_organizer_id_idx on public.events (organizer_id);
create index events_department_id_idx on public.events (department_id);
create index events_category_id_idx on public.events (category_id);
create index events_status_starts_at_idx on public.events (event_status, starts_at);
create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  participant_status text not null default 'confirmed',
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_participants_status_valid check (participant_status in ('invited', 'confirmed', 'removed')),
  constraint event_participants_event_student_unique unique (event_id, student_id)
);
create index event_participants_event_id_idx on public.event_participants (event_id);
create index event_participants_student_id_idx on public.event_participants (student_id);
create index event_participants_student_status_idx
  on public.event_participants (student_id, participant_status);
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  session_name text not null,
  session_date date not null,
  mode text not null default 'f2f',
  session_status text not null default 'scheduled',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  late_cutoff_at timestamptz,
  attendance_window_start_at timestamptz,
  attendance_window_end_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  ended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_sessions_name_not_blank check (btrim(session_name) <> ''),
  constraint class_sessions_mode_valid check (mode in ('f2f', 'online')),
  constraint class_sessions_status_valid check (session_status in ('scheduled', 'ongoing', 'completed', 'cancelled')),
  constraint class_sessions_schedule_order_valid check (scheduled_end > scheduled_start),
  constraint class_sessions_actual_order_valid check (actual_end is null or actual_start is null or actual_end >= actual_start),
  constraint class_sessions_window_order_valid check (
    attendance_window_end_at is null
    or attendance_window_start_at is null
    or attendance_window_end_at > attendance_window_start_at
  )
);
create index class_sessions_class_id_idx on public.class_sessions (class_id);
create index class_sessions_room_id_idx on public.class_sessions (room_id);
create index class_sessions_created_by_idx on public.class_sessions (created_by);
create index class_sessions_status_start_idx on public.class_sessions (session_status, scheduled_start);
create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_name text not null,
  venue text not null,
  mode text not null default 'f2f',
  session_status text not null default 'scheduled',
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  actual_start timestamptz,
  actual_end timestamptz,
  late_cutoff_at timestamptz,
  attendance_window_start_at timestamptz,
  attendance_window_end_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  ended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sessions_name_not_blank check (btrim(session_name) <> ''),
  constraint event_sessions_venue_not_blank check (btrim(venue) <> ''),
  constraint event_sessions_mode_valid check (mode in ('f2f', 'online')),
  constraint event_sessions_status_valid check (session_status in ('scheduled', 'ongoing', 'completed', 'cancelled')),
  constraint event_sessions_schedule_order_valid check (scheduled_end > scheduled_start),
  constraint event_sessions_actual_order_valid check (actual_end is null or actual_start is null or actual_end >= actual_start),
  constraint event_sessions_window_order_valid check (
    attendance_window_end_at is null
    or attendance_window_start_at is null
    or attendance_window_end_at > attendance_window_start_at
  )
);
create index event_sessions_event_id_idx on public.event_sessions (event_id);
create index event_sessions_created_by_idx on public.event_sessions (created_by);
create index event_sessions_status_start_idx on public.event_sessions (session_status, scheduled_start);
create table public.qr_credentials (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  token_hash text not null,
  credential_status text not null default 'activated',
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_successful_check_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qr_credentials_hash_not_blank check (btrim(token_hash) <> ''),
  constraint qr_credentials_status_valid check (credential_status in ('activated', 'inactive', 'damaged', 'blocked')),
  constraint qr_credentials_expiry_valid check (expires_at is null or expires_at > issued_at)
);
create unique index qr_credentials_token_hash_unique_idx on public.qr_credentials (token_hash);
create unique index qr_credentials_one_active_per_student_idx
  on public.qr_credentials (student_id) where credential_status = 'activated';
create index qr_credentials_student_id_idx on public.qr_credentials (student_id);
create table public.facial_profiles (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete cascade,
  enrollment_reference text not null,
  facial_status text not null default 'activated',
  enrolled_at timestamptz not null default now(),
  last_verified_at timestamptz,
  consent_recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facial_profiles_reference_not_blank check (btrim(enrollment_reference) <> ''),
  constraint facial_profiles_status_valid check (facial_status in ('activated', 'inactive', 'damaged', 'blocked'))
);
create unique index facial_profiles_enrollment_reference_unique_idx
  on public.facial_profiles (enrollment_reference);
create table public.verification_devices (
  id uuid primary key default gen_random_uuid(),
  device_code text not null,
  device_name text not null,
  device_type text not null,
  device_status text not null default 'active',
  location text not null,
  department_id uuid references public.departments(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  last_seen_at timestamptz,
  is_trusted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verification_devices_code_not_blank check (btrim(device_code) <> ''),
  constraint verification_devices_name_not_blank check (btrim(device_name) <> ''),
  constraint verification_devices_type_valid check (device_type in ('qr_scanner', 'camera')),
  constraint verification_devices_status_valid check (device_status in ('active', 'inactive', 'maintenance')),
  constraint verification_devices_location_not_blank check (btrim(location) <> '')
);
create unique index verification_devices_code_unique_idx
  on public.verification_devices (lower(device_code));
create index verification_devices_department_id_idx on public.verification_devices (department_id);
create index verification_devices_assigned_to_idx on public.verification_devices (assigned_to);
create index verification_devices_type_status_idx on public.verification_devices (device_type, device_status);
create table public.verification_attempts (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid references public.class_sessions(id) on delete cascade,
  event_session_id uuid references public.event_sessions(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  device_id uuid references public.verification_devices(id) on delete set null,
  qr_credential_id uuid references public.qr_credentials(id) on delete set null,
  facial_profile_id uuid references public.facial_profiles(id) on delete set null,
  verification_method text not null,
  accepted boolean not null,
  failure_code text,
  message text not null,
  attempted_at timestamptz not null default now(),
  constraint verification_attempts_one_session check (
    (class_session_id is not null)::integer + (event_session_id is not null)::integer = 1
  ),
  constraint verification_attempts_method_valid check (verification_method in ('qr', 'facial')),
  constraint verification_attempts_matching_credential check (
    (verification_method = 'qr' and qr_credential_id is not null and facial_profile_id is null)
    or (verification_method = 'facial' and facial_profile_id is not null and qr_credential_id is null)
    or (accepted = false and qr_credential_id is null and facial_profile_id is null)
  ),
  constraint verification_attempts_message_not_blank check (btrim(message) <> '')
);
create index verification_attempts_class_session_id_idx on public.verification_attempts (class_session_id);
create index verification_attempts_event_session_id_idx on public.verification_attempts (event_session_id);
create index verification_attempts_student_id_idx on public.verification_attempts (student_id);
create index verification_attempts_device_id_idx on public.verification_attempts (device_id);
create index verification_attempts_qr_credential_id_idx on public.verification_attempts (qr_credential_id);
create index verification_attempts_facial_profile_id_idx on public.verification_attempts (facial_profile_id);
create index verification_attempts_method_time_idx on public.verification_attempts (verification_method, attempted_at desc);
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid references public.class_sessions(id) on delete cascade,
  event_session_id uuid references public.event_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  verification_attempt_id uuid unique references public.verification_attempts(id) on delete set null,
  attendance_status text not null,
  verification_method text not null,
  time_in timestamptz,
  time_out timestamptz,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id) on delete set null,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_one_session check (
    (class_session_id is not null)::integer + (event_session_id is not null)::integer = 1
  ),
  constraint attendance_records_status_valid check (attendance_status in ('present', 'late', 'absent', 'excused')),
  constraint attendance_records_method_valid check (verification_method in ('qr', 'facial')),
  constraint attendance_records_time_order_valid check (time_out is null or time_in is null or time_out >= time_in)
);
create unique index attendance_records_class_student_unique_idx
  on public.attendance_records (class_session_id, student_id) where class_session_id is not null;
create unique index attendance_records_event_student_unique_idx
  on public.attendance_records (event_session_id, student_id) where event_session_id is not null;
create index attendance_records_class_session_id_idx on public.attendance_records (class_session_id);
create index attendance_records_event_session_id_idx on public.attendance_records (event_session_id);
create index attendance_records_student_id_idx on public.attendance_records (student_id);
create index attendance_records_recorded_by_idx on public.attendance_records (recorded_by);
create index attendance_records_student_recorded_idx on public.attendance_records (student_id, recorded_at desc);
create table public.attendance_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
  requested_status text not null,
  explanation text not null,
  request_status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_requests_status_valid check (requested_status in ('present', 'late', 'absent', 'excused')),
  constraint attendance_requests_explanation_not_blank check (btrim(explanation) <> ''),
  constraint attendance_requests_request_status_valid check (request_status in ('pending', 'approved', 'rejected')),
  constraint attendance_requests_review_consistent check (
    (request_status = 'pending' and reviewed_at is null)
    or (request_status in ('approved', 'rejected') and reviewed_at is not null and reviewed_by is not null)
  )
);
create unique index attendance_requests_one_pending_per_record_idx
  on public.attendance_requests (student_id, attendance_record_id) where request_status = 'pending';
create index attendance_requests_student_id_idx on public.attendance_requests (student_id);
create index attendance_requests_attendance_record_id_idx on public.attendance_requests (attendance_record_id);
create index attendance_requests_reviewed_by_idx on public.attendance_requests (reviewed_by);
create index attendance_requests_status_created_idx on public.attendance_requests (request_status, created_at desc);
create table public.attendance_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.attendance_requests(id) on delete cascade,
  storage_bucket text not null,
  storage_object_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  uploaded_at timestamptz not null default now(),
  constraint attendance_attachments_bucket_not_blank check (btrim(storage_bucket) <> ''),
  constraint attendance_attachments_path_not_blank check (btrim(storage_object_path) <> ''),
  constraint attendance_attachments_name_not_blank check (btrim(original_file_name) <> ''),
  constraint attendance_attachments_size_valid check (file_size_bytes > 0),
  constraint attendance_attachments_request_path_unique unique (request_id, storage_object_path)
);
create index attendance_request_attachments_request_id_idx
  on public.attendance_request_attachments (request_id);
create table public.credential_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  credential_type text not null,
  request_type text not null,
  reason text not null,
  request_status text not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credential_requests_credential_type_valid check (credential_type in ('qr', 'facial')),
  constraint credential_requests_type_valid check (request_type in ('replacement', 're_enrollment', 'technical_issue')),
  constraint credential_requests_reason_not_blank check (btrim(reason) <> ''),
  constraint credential_requests_status_valid check (request_status in ('pending', 'approved', 'rejected', 'resolved')),
  constraint credential_requests_review_consistent check (
    (request_status = 'pending' and reviewed_at is null)
    or (request_status <> 'pending' and reviewed_at is not null and reviewed_by is not null)
  )
);
create unique index credential_requests_one_pending_type_idx
  on public.credential_requests (student_id, credential_type, request_type) where request_status = 'pending';
create index credential_requests_student_id_idx on public.credential_requests (student_id);
create index credential_requests_reviewed_by_idx on public.credential_requests (reviewed_by);
create index credential_requests_status_created_idx on public.credential_requests (request_status, created_at desc);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  notification_status text not null default 'unread',
  action_url text,
  reference_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_valid check (notification_type in ('attendance', 'correction', 'system', 'report')),
  constraint notifications_title_not_blank check (btrim(title) <> ''),
  constraint notifications_message_not_blank check (btrim(message) <> ''),
  constraint notifications_status_valid check (notification_status in ('unread', 'read', 'archived')),
  constraint notifications_read_consistent check (
    (notification_status = 'unread' and read_at is null)
    or notification_status in ('read', 'archived')
  )
);
create index notifications_recipient_status_created_idx
  on public.notifications (recipient_id, notification_status, created_at desc);
create table public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  report_name text not null,
  scope text not null,
  report_format text not null,
  report_status text not null default 'queued',
  generated_by uuid not null references public.profiles(id) on delete restrict,
  storage_bucket text,
  storage_object_path text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generated_reports_name_not_blank check (btrim(report_name) <> ''),
  constraint generated_reports_scope_not_blank check (btrim(scope) <> ''),
  constraint generated_reports_format_valid check (report_format in ('pdf', 'xlsx')),
  constraint generated_reports_status_valid check (report_status in ('queued', 'processing', 'ready', 'failed')),
  constraint generated_reports_file_consistent check (
    report_status <> 'ready'
    or (storage_bucket is not null and storage_object_path is not null and generated_at is not null)
  )
);
create index generated_reports_generated_by_idx on public.generated_reports (generated_by);
create index generated_reports_status_created_idx on public.generated_reports (report_status, created_at desc);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_not_blank check (btrim(action) <> ''),
  constraint audit_logs_target_type_not_blank check (btrim(target_type) <> ''),
  constraint audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object')
);
create index audit_logs_actor_user_id_idx on public.audit_logs (actor_user_id);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create table public.ml_predictions (
  id uuid primary key default gen_random_uuid(),
  prediction_type text not null default 'random_forest_risk',
  risk_level text not null,
  student_id uuid references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  pattern_label text not null,
  score numeric(8, 6) not null,
  explanation text not null,
  generated_at timestamptz not null default now(),
  constraint ml_predictions_type_valid check (prediction_type = 'random_forest_risk'),
  constraint ml_predictions_risk_valid check (risk_level in ('low', 'medium', 'high', 'critical')),
  constraint ml_predictions_scope_present check (student_id is not null or class_id is not null or event_id is not null),
  constraint ml_predictions_pattern_not_blank check (btrim(pattern_label) <> ''),
  constraint ml_predictions_score_valid check (score between 0 and 1),
  constraint ml_predictions_explanation_not_blank check (btrim(explanation) <> '')
);
create index ml_predictions_student_id_idx on public.ml_predictions (student_id);
create index ml_predictions_class_id_idx on public.ml_predictions (class_id);
create index ml_predictions_event_id_idx on public.ml_predictions (event_id);
create index ml_predictions_risk_generated_idx on public.ml_predictions (risk_level, generated_at desc);
create table public.system_settings (
  id uuid primary key default gen_random_uuid(),
  institution_name text not null,
  current_school_year text not null,
  current_semester_id uuid references public.semesters(id) on delete set null,
  attendance_late_cutoff_minutes integer not null default 15,
  default_session_duration_minutes integer not null default 90,
  verification_policy text not null,
  notification_preferences jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_settings_institution_not_blank check (btrim(institution_name) <> ''),
  constraint system_settings_school_year_not_blank check (btrim(current_school_year) <> ''),
  constraint system_settings_late_cutoff_valid check (attendance_late_cutoff_minutes between 0 and 240),
  constraint system_settings_duration_valid check (default_session_duration_minutes between 1 and 1440),
  constraint system_settings_verification_policy_not_blank check (btrim(verification_policy) <> ''),
  constraint system_settings_notification_object check (jsonb_typeof(notification_preferences) = 'object')
);
create index system_settings_current_semester_id_idx on public.system_settings (current_semester_id);
create index system_settings_updated_by_idx on public.system_settings (updated_by);
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.class_sessions enable row level security;
alter table public.event_sessions enable row level security;
alter table public.qr_credentials enable row level security;
alter table public.facial_profiles enable row level security;
alter table public.verification_devices enable row level security;
alter table public.verification_attempts enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_requests enable row level security;
alter table public.attendance_request_attachments enable row level security;
alter table public.credential_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.generated_reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ml_predictions enable row level security;
alter table public.system_settings enable row level security;
revoke all on table
  public.events,
  public.event_participants,
  public.class_sessions,
  public.event_sessions,
  public.qr_credentials,
  public.facial_profiles,
  public.verification_devices,
  public.verification_attempts,
  public.attendance_records,
  public.attendance_requests,
  public.attendance_request_attachments,
  public.credential_requests,
  public.notifications,
  public.generated_reports,
  public.audit_logs,
  public.ml_predictions,
  public.system_settings
from anon, authenticated;
commit;
