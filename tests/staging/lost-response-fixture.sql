-- Staging-only fixture for the one-shot lost-response test.
-- Prerequisite: create only these confirmed Auth users in the staging dashboard:
-- plpass-lost-response-organizer@staging.invalid
-- plpass-lost-response-student@staging.invalid
do $$
declare
  v_organizer_user uuid;
  v_student_user uuid;
  v_department_id uuid;
  v_program_id uuid;
  v_section_id uuid;
  v_category_id uuid;
  v_organizer_id uuid;
  v_student_id uuid;
  v_event_id uuid;
begin
  select id into v_organizer_user from auth.users where email = 'plpass-lost-response-organizer@staging.invalid';
  select id into v_student_user from auth.users where email = 'plpass-lost-response-student@staging.invalid';
  if v_organizer_user is null or v_student_user is null then
    raise exception 'Create the two named synthetic staging Auth users first.';
  end if;

  insert into public.departments (department_code, department_name)
  values ('STG-LR', 'Staging Lost Response Department')
  on conflict ((lower(department_code))) do update set department_name = excluded.department_name
  returning id into v_department_id;

  insert into public.programs (department_id, program_code, program_name)
  values (v_department_id, 'STG-LR', 'Staging Lost Response Program')
  on conflict (department_id, (lower(program_code))) do update set program_name = excluded.program_name
  returning id into v_program_id;

  insert into public.sections (program_id, section_name, year_level, academic_year, semester)
  values (v_program_id, 'LR', 1, '2099-2100', 'Lost Response')
  on conflict (program_id, (lower(section_name)), academic_year, semester) do update set year_level = excluded.year_level
  returning id into v_section_id;

  insert into public.profiles (id, email, first_name, last_name, role, account_status, department_id, employee_id, student_id)
  values (v_organizer_user, 'plpass-lost-response-organizer@staging.invalid', 'Synthetic', 'Lost Response Organizer', 'organizer', 'active', v_department_id, 'STG-LR-ORG', null)
  on conflict (id) do update set email = excluded.email, first_name = excluded.first_name, last_name = excluded.last_name, role = excluded.role, account_status = excluded.account_status, department_id = excluded.department_id, employee_id = excluded.employee_id, student_id = null;

  insert into public.organizers (profile_id, employee_id, department_id, organization_name, position, organizer_status)
  values (v_organizer_user, 'STG-LR-ORG', v_department_id, 'PLPass Staging', 'Lost Response Organizer', 'active')
  on conflict (profile_id) do update set employee_id = excluded.employee_id, department_id = excluded.department_id, organization_name = excluded.organization_name, position = excluded.position, organizer_status = excluded.organizer_status
  returning id into v_organizer_id;

  insert into public.profiles (id, email, first_name, last_name, role, account_status, department_id, employee_id, student_id)
  values (v_student_user, 'plpass-lost-response-student@staging.invalid', 'Synthetic', 'Lost Response Student', 'student', 'active', v_department_id, null, 'STG-LR-1')
  on conflict (id) do update set email = excluded.email, first_name = excluded.first_name, last_name = excluded.last_name, role = excluded.role, account_status = excluded.account_status, department_id = excluded.department_id, employee_id = null, student_id = excluded.student_id;

  insert into public.students (profile_id, student_id, program_id, department_id, section_id, year_level, student_status)
  values (v_student_user, 'STG-LR-1', v_program_id, v_department_id, v_section_id, 1, 'enrolled')
  on conflict (profile_id) do update set student_id = excluded.student_id, program_id = excluded.program_id, department_id = excluded.department_id, section_id = excluded.section_id, year_level = excluded.year_level, student_status = excluded.student_status
  returning id into v_student_id;

  insert into public.event_categories (category_name)
  values ('Staging Lost Response')
  on conflict ((lower(category_name))) do update set category_name = excluded.category_name
  returning id into v_category_id;

  insert into public.events (event_code, organizer_id, department_id, category_id, title, description, venue, starts_at, ends_at, event_status, approval_status)
  values ('STG-LOST-RESPONSE', v_organizer_id, v_department_id, v_category_id, 'Staging Lost Response', 'Synthetic staging fault-injection data only.', 'Staging Test Room', now() - interval '5 minutes', now() + interval '2 hours', 'scheduled', 'approved')
  on conflict ((lower(event_code))) do update set organizer_id = excluded.organizer_id, department_id = excluded.department_id, category_id = excluded.category_id, title = excluded.title, description = excluded.description, venue = excluded.venue, starts_at = excluded.starts_at, ends_at = excluded.ends_at, event_status = 'scheduled', approval_status = 'approved', updated_at = now()
  returning id into v_event_id;

  insert into public.event_participants (event_id, student_id, participant_status)
  values (v_event_id, v_student_id, 'confirmed')
  on conflict (event_id, student_id) do update set participant_status = excluded.participant_status, updated_at = now();
end;
$$;
