begin;

do $$
declare
  conflicting_id uuid;
begin
  if exists (
    select 1
    from public.admin_profiles ap
    join public.profiles p on p.id = ap.profile_id
    where p.role in ('admin', 'department_admin')
      and ap.employee_number !~ '-[0-9]{3}$'
  ) then
    raise exception 'Cannot normalize admin IDs safely: an admin ID has no three-digit suffix.';
  end if;

  select ap.id into conflicting_id
  from public.admin_profiles ap
  join public.profiles p on p.id = ap.profile_id
  where ap.employee_number in (
    select case when p2.role = 'department_admin' then 'DA-' else 'UA-' end
      || right(ap2.employee_number, 3)
    from public.admin_profiles ap2
    join public.profiles p2 on p2.id = ap2.profile_id
    where p2.role in ('admin', 'department_admin')
  )
    and p.role not in ('admin', 'department_admin');

  if conflicting_id is not null then
    raise exception 'Cannot normalize admin IDs safely: target ID already exists.';
  end if;

  update public.admin_profiles ap
  set employee_number = case
    when p.role = 'department_admin' then 'DA-' || right(ap.employee_number, 3)
    when p.role = 'admin' then 'UA-' || right(ap.employee_number, 3)
    else ap.employee_number
  end
  from public.profiles p
  where p.id = ap.profile_id
    and p.role in ('admin', 'department_admin');

  update public.profiles p
  set employee_id = case
    when p.role = 'department_admin' then 'DA-' || right(p.employee_id, 3)
    when p.role = 'admin' then 'UA-' || right(p.employee_id, 3)
    else p.employee_id
  end
  where p.role in ('admin', 'department_admin')
    and p.employee_id is not null;
end;
$$;

commit;
