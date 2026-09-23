begin;

-- The legacy rooms relation is retained for schema compatibility and mapper
-- joins, but it must never be exposed without an explicit authenticated read
-- policy. No anonymous access or client-side writes are granted.
do $$
begin
  if to_regclass('public.rooms') is not null then
    execute 'alter table public.rooms enable row level security';
    execute 'revoke all on table public.rooms from anon';
    execute 'grant select on table public.rooms to authenticated';
    execute 'drop policy if exists rooms_authenticated_read on public.rooms';
    execute 'create policy rooms_authenticated_read on public.rooms for select to authenticated using ((select private.is_active_user()))';
  end if;
end;
$$;

commit;
