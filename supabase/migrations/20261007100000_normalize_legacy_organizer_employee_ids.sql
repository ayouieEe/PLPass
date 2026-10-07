begin;

-- Keep existing O-### values stable and move only legacy organizer IDs to the
-- next available global organizer number. Profiles and organizers are updated
-- together so the shared employee identifier remains consistent.
create temp table organizer_employee_id_migration (
  organizer_id uuid primary key,
  profile_id uuid not null,
  old_employee_id text not null,
  new_employee_id text not null unique
) on commit drop;

do $$
declare
  max_global_id integer;
  legacy_count integer;
  mapped_count integer;
begin
  if exists (
    select 1
    from public.organizers o
    left join public.profiles p on p.id = o.profile_id
    where o.employee_id ~ '^HM-EMP-[0-9]{3}$'
      and (p.id is null or p.employee_id is distinct from o.employee_id)
  ) then
    raise exception 'Legacy organizer employee IDs do not match their profiles; migration stopped safely.';
  end if;

  select greatest(
    coalesce(max((substring(o.employee_id from '^O-([0-9]{3})$'))::integer), 0),
    coalesce((
      select max((substring(p.employee_id from '^O-([0-9]{3})$'))::integer)
      from public.profiles p
    ), 0)
  )
  into max_global_id
  from public.organizers o;

  select count(*)
  into legacy_count
  from public.organizers
  where employee_id ~ '^HM-EMP-[0-9]{3}$';

  if legacy_count = 0 then
    return;
  end if;

  if max_global_id + legacy_count > 999 then
    raise exception 'Legacy organizer employee IDs exceed the O-### range; migration stopped safely.';
  end if;

  insert into organizer_employee_id_migration (organizer_id, profile_id, old_employee_id, new_employee_id)
  select o.id,
         o.profile_id,
         o.employee_id,
         'O-' || lpad((max_global_id + row_number() over (order by o.created_at, o.id))::text, 3, '0')
  from public.organizers o
  where o.employee_id ~ '^HM-EMP-[0-9]{3}$';

  select count(*) into mapped_count from organizer_employee_id_migration;
  if mapped_count <> legacy_count then
    raise exception 'Not all legacy organizer employee IDs could be mapped; migration stopped safely.';
  end if;

  update public.profiles p
  set employee_id = m.new_employee_id
  from organizer_employee_id_migration m
  where p.id = m.profile_id;

  update public.organizers o
  set employee_id = m.new_employee_id
  from organizer_employee_id_migration m
  where o.id = m.organizer_id;
end;
$$;

commit;
