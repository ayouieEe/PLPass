begin;

-- The regular-class subsystem was removed in 20260920090000. A later
-- compatibility migration recreated `rooms`, but no remaining application
-- feature or relation owns it. Do not silently discard manually-entered data:
-- an operator must explicitly review it if this legacy table is populated.
do $$
begin
  if to_regclass('public.rooms') is not null
     and exists (select 1 from public.rooms limit 1) then
    raise exception 'rooms cleanup blocked: public.rooms contains data';
  end if;
end;
$$;

-- No CASCADE: an unexpected foreign key or view is a deployment-time signal
-- that the relation is still in use and must be investigated first.
drop table if exists public.rooms;

commit;
