begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  target_profile constant uuid := '63aff29f-2323-4831-997d-b73ae412c58e';
  target_admin constant uuid := '062e4023-3a40-4435-8e27-a5e6f92ac589';
  matched integer;
begin
  select count(*) into matched
  from public.profiles
  where id = target_profile
    and lower(trim(email)) = lower('faustino_justineangelo@plpasig.edu.ph')
    and first_name = 'Justine Angelo'
    and last_name = 'Faustino'
    and role = 'department_admin'
    and employee_id = 'DA-003';
  if matched <> 1 then raise exception 'Admin identity check failed; deletion stopped safely.'; end if;

  if (select count(*) from public.admin_profiles where id = target_admin and profile_id = target_profile and employee_number = 'DA-003') <> 1 then
    raise exception 'Admin metadata identity check failed; deletion stopped safely.';
  end if;

  if (select count(*) from auth.users where id = target_profile and lower(email) = lower('faustino_justineangelo@plpasig.edu.ph')) <> 1 then
    raise exception 'Auth identity check failed; deletion stopped safely.';
  end if;

  delete from public.admin_profiles where id = target_admin and profile_id = target_profile;
  delete from public.profiles where id = target_profile;
  delete from auth.users where id = target_profile;
end;
$$;

commit;
