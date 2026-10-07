begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  matched integer;
begin
  select count(*) into matched
  from public.profiles
  where id = '68573728-181f-4ea1-a0f2-b2fe1da6f336'
    and email = 'tornea_keithandrea@plpasig.edu.ph'
    and first_name = 'Keith Andrea'
    and last_name = 'Tornea'
    and student_id = '23-00265';
  if matched <> 1 then
    raise exception 'Student identity check failed; deletion stopped safely.';
  end if;

  if (select count(*) from public.students
      where id = '70b36339-9f99-4467-92f6-27d70007dcc7'
        and profile_id = '68573728-181f-4ea1-a0f2-b2fe1da6f336'
        and student_id = '23-00265') <> 1 then
    raise exception 'Student row identity check failed; deletion stopped safely.';
  end if;

  if (select count(*) from auth.users
      where id = '68573728-181f-4ea1-a0f2-b2fe1da6f336') <> 1 then
    raise exception 'Auth row identity check failed; deletion stopped safely.';
  end if;

  delete from public.students
  where id = '70b36339-9f99-4467-92f6-27d70007dcc7';

  delete from public.profiles
  where id = '68573728-181f-4ea1-a0f2-b2fe1da6f336';

  delete from auth.users
  where id = '68573728-181f-4ea1-a0f2-b2fe1da6f336';
end;
$$;

commit;
