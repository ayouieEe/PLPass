-- Add columns to event_sessions to support Option C+ (historical records)
-- These columns track when a session was archived due to event reschedule

alter table public.event_sessions
add column if not exists session_archive_status text default 'active' check (session_archive_status in ('active', 'archived')),
add column if not exists superseded_by uuid references public.event_sessions(id) on delete set null,
add column if not exists rescheduled_reason text,
add column if not exists rescheduled_at timestamptz;

-- Index for finding archived sessions
create index if not exists event_sessions_archive_status_idx on public.event_sessions (session_archive_status);

-- Add columns to events table to support rescheduling
alter table public.events
add column if not exists last_rescheduled_at timestamptz,
add column if not exists reschedule_count int default 0;

-- Index for finding recently rescheduled events
create index if not exists events_last_rescheduled_idx on public.events (last_rescheduled_at desc);
