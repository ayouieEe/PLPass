begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  matched integer;
begin
  select count(*) into matched
  from public.profiles
  where id = '650ef444-dd63-488c-ad84-c606095bca09'
    and email = 'vargasiii_rudy@plpasig.edu.ph'
    and first_name = 'Rudy'
    and last_name = 'Vargas'
    and name_extension = 'III'
    and student_id = '23-00189';

  if matched <> 1 then
    raise exception 'Student identity check failed; deletion stopped safely.';
  end if;

  if (select count(*) from public.students
      where id = 'bca5ed5d-dbf5-44eb-aa9a-11bd0e65339f'
        and profile_id = '650ef444-dd63-488c-ad84-c606095bca09'
        and student_id = '23-00189') <> 1 then
    raise exception 'Student row identity check failed; deletion stopped safely.';
  end if;

  if (select count(*) from auth.users
      where id = '650ef444-dd63-488c-ad84-c606095bca09') <> 1 then
    raise exception 'Auth row identity check failed; deletion stopped safely.';
  end if;

  delete from public.students
  where id = 'bca5ed5d-dbf5-44eb-aa9a-11bd0e65339f';

  delete from public.profiles
  where id = '650ef444-dd63-488c-ad84-c606095bca09';

  delete from auth.users
  where id = '650ef444-dd63-488c-ad84-c606095bca09';
end;
$$;

commit;
