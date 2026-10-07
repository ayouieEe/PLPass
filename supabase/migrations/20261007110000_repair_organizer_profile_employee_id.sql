begin;

-- Repair the one known legacy pair where the organizer row contains a
-- trailing newline in O-001 and its profile still contains O-2001.
do $$
declare
  repair_count integer;
begin
  select count(*)
  into repair_count
  from public.organizers o
  join public.profiles p on p.id = o.profile_id
  where btrim(o.employee_id) = 'O-001'
    and o.employee_id <> btrim(o.employee_id)
    and p.employee_id = 'O-2001';

  if repair_count = 0 then
    return;
  end if;

  if repair_count <> 1
    or exists (select 1 from public.organizers where employee_id = 'O-001')
    or exists (select 1 from public.profiles where employee_id = 'O-001') then
    raise exception 'Organizer/profile employee ID repair was not uniquely safe; migration stopped.';
  end if;

  update public.profiles p
  set employee_id = 'O-001'
  from public.organizers o
  where p.id = o.profile_id
    and btrim(o.employee_id) = 'O-001'
    and o.employee_id <> btrim(o.employee_id)
    and p.employee_id = 'O-2001';

  update public.organizers o
  set employee_id = 'O-001'
  where btrim(o.employee_id) = 'O-001'
    and o.employee_id <> btrim(o.employee_id)
    and exists (
      select 1
      from public.profiles p
      where p.id = o.profile_id
        and p.employee_id = 'O-001'
    );
end;
$$;

commit;
