do $$
declare
  target_id uuid;
  target_count integer;
begin
  select count(*) into target_count
  from public.profiles
  where id = '65cf9c45-636c-4fda-a6ae-910dd8183502'
    and lower(email) = lower('faustino_justineangelo@plpasig.edu.ph')
    and role = 'department_admin';

  if target_count <> 1 then
    raise exception 'Deletion guard failed: expected exactly one matching department admin profile, found %', target_count;
  end if;

  target_id := '65cf9c45-636c-4fda-a6ae-910dd8183502';

  if not exists (select 1 from auth.users where id = target_id) then
    raise exception 'Deletion guard failed: matching auth user is missing';
  end if;

  if not exists (select 1 from public.admin_profiles where profile_id = target_id and employee_number = 'DA-003') then
    raise exception 'Deletion guard failed: matching admin profile DA-003 is missing';
  end if;

  delete from public.admin_profiles where profile_id = target_id;
  delete from public.profiles where id = target_id;
  delete from auth.users where id = target_id;
end $$;
