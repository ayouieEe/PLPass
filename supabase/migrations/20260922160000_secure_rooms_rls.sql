begin;

-- The legacy rooms relation is retained for schema compatibility and mapper
-- joins, but it must never be exposed without an explicit authenticated read
-- policy. No anonymous access or client-side writes are granted.
alter table if exists public.rooms enable row level security;
revoke all on table public.rooms from anon;
grant select on table public.rooms to authenticated;
drop policy if exists rooms_authenticated_read on public.rooms;
create policy rooms_authenticated_read
on public.rooms
for select
to authenticated
using ((select private.is_active_user()));

commit;
