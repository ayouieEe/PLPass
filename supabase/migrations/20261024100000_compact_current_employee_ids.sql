begin;

-- The deleted accounts left gaps in the current production sequence. This
-- migration is deliberately guarded to the audited live shape so it cannot
-- renumber a different account set if applied in the wrong environment.
create temp table employee_id_compaction (
  profile_id uuid primary key,
  role_table text not null,
  role_id uuid not null,
  new_employee_id text not null unique
) on commit drop;

do $$
declare
  organizer_count integer;
  admin_count integer;
begin
  select count(*) into organizer_count from public.organizers;
  select count(*) into admin_count from public.admin_profiles ap
    join public.profiles p on p.id = ap.profile_id
    where p.role in ('admin', 'department_admin');

  if organizer_count <> 3 or admin_count <> 3 then
    raise exception 'Employee ID compaction stopped: expected 3 organizers and 3 admins, found % and %.', organizer_count, admin_count;
  end if;

  if exists (
    select 1
    from public.organizers o
    join public.profiles p on p.id = o.profile_id
    where p.role <> 'organizer'
      or p.employee_id is distinct from o.employee_id
      or o.employee_id not in ('O-001', 'O-004', 'O-005')
  ) or exists (
    select 1
    from public.profiles p
    left join public.admin_profiles ap on ap.profile_id = p.id
    where p.role in ('admin', 'department_admin')
      and (ap.id is null or p.employee_id is distinct from ap.employee_number)
  ) then
    raise exception 'Employee ID compaction stopped: role/profile identifiers are not the audited matched pairs.';
  end if;

  if exists (
    select 1
    from public.admin_profiles ap
    join public.profiles p on p.id = ap.profile_id
    where p.role in ('admin', 'department_admin')
      and ap.employee_number not in ('UA-001', 'DA-001', 'DA-003')
  ) then
    raise exception 'Employee ID compaction stopped: admin identifiers differ from the audited set.';
  end if;

  insert into employee_id_compaction (profile_id, role_table, role_id, new_employee_id)
  select o.profile_id, 'organizers', o.id,
    'O-' || lpad(row_number() over (order by o.created_at, o.id)::text, 3, '0')
  from public.organizers o;

  insert into employee_id_compaction (profile_id, role_table, role_id, new_employee_id)
  select ap.profile_id, 'admin_profiles', ap.id,
    case when p.role = 'department_admin'
      then 'DA-' || lpad(row_number() over (partition by p.role order by ap.created_at, ap.id)::text, 3, '0')
      else 'UA-001'
    end
  from public.admin_profiles ap
  join public.profiles p on p.id = ap.profile_id
  where p.role in ('admin', 'department_admin');

  if (select count(*) from employee_id_compaction) <> 6
     or exists (select 1 from employee_id_compaction where new_employee_id like 'O-%' and new_employee_id not in ('O-001', 'O-002', 'O-003'))
     or exists (select 1 from employee_id_compaction where new_employee_id like 'DA-%' and new_employee_id not in ('DA-001', 'DA-002')) then
    raise exception 'Employee ID compaction stopped: generated mapping was not the expected compact sequence.';
  end if;
end;
$$;

-- Stage both copies away from unique values before assigning the compact IDs.
update public.profiles p
set employee_id = 'EMPLOYEE-ID-COMPACT-' || c.profile_id::text
from employee_id_compaction c
where p.id = c.profile_id;

update public.organizers o
set employee_id = 'EMPLOYEE-ID-COMPACT-' || c.role_id::text
from employee_id_compaction c
where c.role_table = 'organizers' and o.id = c.role_id;

update public.admin_profiles ap
set employee_number = 'EMPLOYEE-ID-COMPACT-' || c.role_id::text
from employee_id_compaction c
where c.role_table = 'admin_profiles' and ap.id = c.role_id;

update public.profiles p
set employee_id = c.new_employee_id
from employee_id_compaction c
where p.id = c.profile_id;

update public.organizers o
set employee_id = c.new_employee_id
from employee_id_compaction c
where c.role_table = 'organizers' and o.id = c.role_id;

update public.admin_profiles ap
set employee_number = c.new_employee_id
from employee_id_compaction c
where c.role_table = 'admin_profiles' and ap.id = c.role_id;

do $$
begin
  if exists (
    select 1
    from employee_id_compaction c
    join public.profiles p on p.id = c.profile_id
    left join public.organizers o on c.role_table = 'organizers' and o.id = c.role_id
    left join public.admin_profiles ap on c.role_table = 'admin_profiles' and ap.id = c.role_id
    where p.employee_id is distinct from c.new_employee_id
      or (c.role_table = 'organizers' and o.employee_id is distinct from c.new_employee_id)
      or (c.role_table = 'admin_profiles' and ap.employee_number is distinct from c.new_employee_id)
  ) then
    raise exception 'Employee ID compaction verification failed.';
  end if;
end;
$$;

commit;
