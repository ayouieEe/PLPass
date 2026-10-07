begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  matched integer;
begin
  select count(*) into matched
  from public.profiles
  where id = '5b9fb8b3-65ca-45c0-a86c-227905df45c4'
    and email = 'faustino_justineangelo@plpasig.edu.ph'
    and first_name = 'Justine Angelo'
    and last_name = 'Faustino'
    and coalesce(middle_name, '') = ''
    and student_id = '23-00211';

  if matched <> 1 then
    raise exception 'Student identity check failed; deletion stopped safely.';
  end if;

  if (select count(*) from public.students
      where id = '4a11c534-a3a5-4d6f-8d69-212961799a2f'
        and profile_id = '5b9fb8b3-65ca-45c0-a86c-227905df45c4'
        and student_id = '23-00211') <> 1 then
    raise exception 'Student row identity check failed; deletion stopped safely.';
  end if;

  if (select count(*) from auth.users
      where id = '5b9fb8b3-65ca-45c0-a86c-227905df45c4') <> 1 then
    raise exception 'Auth row identity check failed; deletion stopped safely.';
  end if;

  delete from public.students
  where id = '4a11c534-a3a5-4d6f-8d69-212961799a2f';

  delete from public.profiles
  where id = '5b9fb8b3-65ca-45c0-a86c-227905df45c4';

  delete from auth.users
  where id = '5b9fb8b3-65ca-45c0-a86c-227905df45c4';
end;
$$;

commit;
