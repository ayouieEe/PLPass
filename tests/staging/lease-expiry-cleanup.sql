-- Staging-only exact cleanup for lease-expiry-fixture.sql.
do $$
declare
  v_event_id uuid;
  v_department_id uuid;
  v_program_id uuid;
  v_section_id uuid;
  v_category_id uuid;
begin
  select id into v_event_id from public.events where event_code = 'STG-LEASE-EXPIRY';
  select id into v_department_id from public.departments where department_code = 'STG-LE';
  select id into v_program_id from public.programs where department_id = v_department_id and program_code = 'STG-LE';
  select id into v_section_id from public.sections where program_id = v_program_id and section_name = 'LE' and academic_year = '2099-2100' and semester = 'Lease Expiry';
  select id into v_category_id from public.event_categories where category_name = 'Staging Lease Expiry';
  if v_event_id is not null then delete from public.events where id = v_event_id; end if;
  delete from auth.users where email in ('plpass-lease-expiry-organizer@staging.invalid', 'plpass-lease-expiry-student@staging.invalid');
  if v_category_id is not null and not exists (select 1 from public.events where category_id = v_category_id) then delete from public.event_categories where id = v_category_id; end if;
  if v_section_id is not null and not exists (select 1 from public.students where section_id = v_section_id) then delete from public.sections where id = v_section_id; end if;
  if v_program_id is not null and not exists (select 1 from public.students where program_id = v_program_id) then delete from public.programs where id = v_program_id; end if;
  if v_department_id is not null and not exists (select 1 from public.programs where department_id = v_department_id) then delete from public.departments where id = v_department_id; end if;
end;
$$;
