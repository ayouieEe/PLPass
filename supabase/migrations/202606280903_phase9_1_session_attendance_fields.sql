-- Phase 9.1 review migration: additive session timing fields for attendance validation.
-- Do not apply until reviewed. Existing session_date/actual_start/actual_end are preserved.

alter table public.class_sessions
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz,
  add column if not exists late_cutoff_at timestamptz,
  add column if not exists attendance_window_start timestamptz,
  add column if not exists attendance_window_end timestamptz,
  add column if not exists ended_reason text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz;

alter table public.event_sessions
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz,
  add column if not exists mode public.session_mode,
  add column if not exists late_cutoff_at timestamptz,
  add column if not exists attendance_window_start timestamptz,
  add column if not exists attendance_window_end timestamptz,
  add column if not exists ended_reason text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz;

alter table public.events
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz;

create index if not exists class_sessions_created_by_idx
  on public.class_sessions (created_by);

create index if not exists event_sessions_created_by_idx
  on public.event_sessions (created_by);

create index if not exists class_sessions_attendance_window_idx
  on public.class_sessions (attendance_window_start, attendance_window_end);

create index if not exists event_sessions_attendance_window_idx
  on public.event_sessions (attendance_window_start, attendance_window_end);
