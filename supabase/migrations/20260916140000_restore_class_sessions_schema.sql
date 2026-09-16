begin;

-- The production project was missing the class_sessions relation even though
-- attendance_records still references it. Restore the planned schema so
-- attendance integrity checks and class attendance workflows can operate.
-- The linked project also lacks the rooms relation referenced by the planned
-- class-session schema, so restore that prerequisite before creating the FK.
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  building text,
  capacity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_code_not_blank check (btrim(room_code) <> ''),
  constraint rooms_capacity_valid check (capacity is null or capacity > 0)
);

create unique index if not exists rooms_code_unique_idx on public.rooms (lower(room_code));

create table if not exists public.class_sessions (
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

create index if not exists class_sessions_class_id_idx on public.class_sessions (class_id);
create index if not exists class_sessions_room_id_idx on public.class_sessions (room_id);
create index if not exists class_sessions_created_by_idx on public.class_sessions (created_by);
create index if not exists class_sessions_status_start_idx on public.class_sessions (session_status, scheduled_start);

grant select on public.class_sessions to authenticated;
drop policy if exists class_sessions_read on public.class_sessions;
create policy class_sessions_read on public.class_sessions for select to authenticated
  using ((select private.is_active_user()));

commit;
