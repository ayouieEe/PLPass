begin;

do $$
begin
  update public.admin_profiles ap
  set employee_number = 'DA-TEMP-' || ap.id::text
  from public.profiles p
  where p.id = ap.profile_id
    and p.role = 'department_admin';

  update public.profiles p
  set employee_id = 'DA-TEMP-' || p.id::text
  where p.role = 'department_admin';

  with ranked as (
    select ap.id,
           row_number() over (order by ap.created_at, ap.id) as sequence_number
    from public.admin_profiles ap
    join public.profiles p on p.id = ap.profile_id
    where p.role = 'department_admin'
  )
  update public.admin_profiles ap
  set employee_number = 'DA-' || lpad(ranked.sequence_number::text, 3, '0')
  from ranked
  where ranked.id = ap.id;

  with ranked as (
    select p.id,
           row_number() over (order by ap.created_at, ap.id) as sequence_number
    from public.profiles p
    join public.admin_profiles ap on ap.profile_id = p.id
    where p.role = 'department_admin'
  )
  update public.profiles p
  set employee_id = 'DA-' || lpad(ranked.sequence_number::text, 3, '0')
  from ranked
  where ranked.id = p.id;
end;
$$;

commit;
