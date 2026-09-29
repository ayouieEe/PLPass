begin;

-- Both the current mapper and the class-session compatibility schema retain
-- rooms as an optional relation.  Some older linked projects recorded the
-- original restoration migration without leaving the relation in place.
-- Reassert it without touching any existing event, attendance, or auth data.
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

-- Rooms remain a read-only compatibility relation for active application
-- users.  This is intentionally explicit so an automatically exposed table
-- cannot become a public write surface.
alter table public.rooms enable row level security;
revoke all on table public.rooms from public, anon;
grant select on table public.rooms to authenticated;
drop policy if exists rooms_authenticated_read on public.rooms;
create policy rooms_authenticated_read on public.rooms for select to authenticated
  using ((select private.is_active_user()));

commit;
