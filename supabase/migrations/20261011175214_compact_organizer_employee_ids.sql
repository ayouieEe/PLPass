begin;

-- Employee IDs are duplicated on organizers and profiles, with independent
-- unique indexes. Stage both copies through unique temporary values before
-- assigning the compact sequence so no intermediate update can collide.
create temp table organizer_employee_id_compaction (
  organizer_id uuid primary key,
  profile_id uuid not null unique,
  new_employee_id text not null unique
) on commit drop;

do $$
declare
  organizer_count integer;
begin
  select count(*) into organizer_count from public.organizers;
  if organizer_count <> 5 then
    raise exception 'Organizer ID compaction expects exactly five organizers, found %.', organizer_count;
  end if;

  if exists (
    select 1
    from public.organizers o
    left join public.profiles p on p.id = o.profile_id
    where p.id is null
      or p.role <> 'organizer'
      or p.employee_id is distinct from o.employee_id
      or o.employee_id !~ '^O-[0-9]{3}$'
  ) then
    raise exception 'Organizer ID compaction stopped: organizer/profile employee IDs are not a matched O-### pair.';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.role = 'organizer'
      and not exists (select 1 from public.organizers o where o.profile_id = p.id)
  ) then
    raise exception 'Organizer ID compaction stopped: an organizer profile has no organizer row.';
  end if;

  insert into organizer_employee_id_compaction (organizer_id, profile_id, new_employee_id)
  select o.id,
         o.profile_id,
         'O-' || lpad(row_number() over (order by o.created_at, o.id)::text, 3, '0')
  from public.organizers o;

  if (select count(*) from organizer_employee_id_compaction) <> 5 then
    raise exception 'Organizer ID compaction stopped: the generated mapping is incomplete.';
  end if;
end;
$$;

update public.profiles p
set employee_id = 'ORGANIZER-COMPACT-' || m.profile_id::text
from organizer_employee_id_compaction m
where p.id = m.profile_id;

update public.organizers o
set employee_id = 'ORGANIZER-COMPACT-' || m.organizer_id::text
from organizer_employee_id_compaction m
where o.id = m.organizer_id;

update public.profiles p
set employee_id = m.new_employee_id
from organizer_employee_id_compaction m
where p.id = m.profile_id;

update public.organizers o
set employee_id = m.new_employee_id
from organizer_employee_id_compaction m
where o.id = m.organizer_id;

do $$
begin
  if exists (
    select 1
    from organizer_employee_id_compaction m
    join public.organizers o on o.id = m.organizer_id
    join public.profiles p on p.id = m.profile_id
    where o.employee_id is distinct from m.new_employee_id
      or p.employee_id is distinct from m.new_employee_id
  ) then
    raise exception 'Organizer ID compaction verification failed.';
  end if;
end;
$$;

commit;
