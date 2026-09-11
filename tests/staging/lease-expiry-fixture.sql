-- Staging-only fixture for the individual lease-expiry recovery test.
-- Create only the two named confirmed Auth users before running this script:
-- plpass-lease-expiry-organizer@staging.invalid
-- plpass-lease-expiry-student@staging.invalid
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
  v_day timestamp;
begin
  select id into v_organizer_user from auth.users where email = 'plpass-lease-expiry-organizer@staging.invalid';
  select id into v_student_user from auth.users where email = 'plpass-lease-expiry-student@staging.invalid';
  if v_organizer_user is null or v_student_user is null then
    raise exception 'Create the two named synthetic staging Auth users first.';
  end if;
  v_day := date_trunc('day', now() at time zone 'Asia/Manila');

  insert into public.departments (department_code, department_name) values ('STG-LE', 'Staging Lease Expiry Department')
  on conflict ((lower(department_code))) do update set department_name = excluded.department_name returning id into v_department_id;
  insert into public.programs (department_id, program_code, program_name) values (v_department_id, 'STG-LE', 'Staging Lease Expiry Program')
  on conflict (department_id, (lower(program_code))) do update set program_name = excluded.program_name returning id into v_program_id;
  insert into public.sections (program_id, section_name, year_level, academic_year, semester) values (v_program_id, 'LE', 1, '2099-2100', 'Lease Expiry')
  on conflict (program_id, (lower(section_name)), academic_year, semester) do update set year_level = excluded.year_level returning id into v_section_id;

  insert into public.profiles (id, email, first_name, last_name, role, account_status, department_id, employee_id, student_id)
  values (v_organizer_user, 'plpass-lease-expiry-organizer@staging.invalid', 'Synthetic', 'Lease Expiry Organizer', 'organizer', 'active', v_department_id, 'STG-LE-ORG', null)
  on conflict (id) do update set email = excluded.email, first_name = excluded.first_name, last_name = excluded.last_name, role = excluded.role, account_status = excluded.account_status, department_id = excluded.department_id, employee_id = excluded.employee_id, student_id = null;
  insert into public.organizers (profile_id, employee_id, department_id, organization_name, position, organizer_status)
  values (v_organizer_user, 'STG-LE-ORG', v_department_id, 'PLPass Staging', 'Lease Expiry Organizer', 'active')
  on conflict (profile_id) do update set employee_id = excluded.employee_id, department_id = excluded.department_id, organization_name = excluded.organization_name, position = excluded.position, organizer_status = excluded.organizer_status returning id into v_organizer_id;

  insert into public.profiles (id, email, first_name, last_name, role, account_status, department_id, employee_id, student_id)
  values (v_student_user, 'plpass-lease-expiry-student@staging.invalid', 'Synthetic', 'Lease Expiry Student', 'student', 'active', v_department_id, null, 'STG-LE-1')
  on conflict (id) do update set email = excluded.email, first_name = excluded.first_name, last_name = excluded.last_name, role = excluded.role, account_status = excluded.account_status, department_id = excluded.department_id, employee_id = null, student_id = excluded.student_id;
  insert into public.students (profile_id, student_id, program_id, department_id, section_id, year_level, student_status)
  values (v_student_user, 'STG-LE-1', v_program_id, v_department_id, v_section_id, 1, 'enrolled')
  on conflict (profile_id) do update set student_id = excluded.student_id, program_id = excluded.program_id, department_id = excluded.department_id, section_id = excluded.section_id, year_level = excluded.year_level, student_status = excluded.student_status returning id into v_student_id;

  insert into public.event_categories (category_name) values ('Staging Lease Expiry')
  on conflict ((lower(category_name))) do update set category_name = excluded.category_name returning id into v_category_id;
  insert into public.events (event_code, organizer_id, department_id, category_id, title, description, venue, starts_at, ends_at, event_status, approval_status)
  values ('STG-LEASE-EXPIRY', v_organizer_id, v_department_id, v_category_id, 'Staging Lease Expiry', 'Synthetic staging lease-expiry data only.', 'Staging Test Room', v_day at time zone 'Asia/Manila', (v_day + interval '23 hours 59 minutes') at time zone 'Asia/Manila', 'scheduled', 'approved')
  on conflict ((lower(event_code))) do update set organizer_id = excluded.organizer_id, department_id = excluded.department_id, category_id = excluded.category_id, title = excluded.title, description = excluded.description, venue = excluded.venue, starts_at = excluded.starts_at, ends_at = excluded.ends_at, event_status = 'scheduled', approval_status = 'approved', updated_at = now() returning id into v_event_id;
  insert into public.event_participants (event_id, student_id, participant_status) values (v_event_id, v_student_id, 'confirmed')
  on conflict (event_id, student_id) do update set participant_status = excluded.participant_status, updated_at = now();

  -- The test synchronizes against this one server-issued session ID. It is
  -- already active so no separate lifecycle test is mixed into lease recovery.
  delete from public.event_sessions where event_id = v_event_id;
  insert into public.event_sessions (
    event_id, session_name, venue, mode, session_status, scheduled_start,
    scheduled_end, actual_start, late_cutoff_at, attendance_window_start_at,
    attendance_window_end_at, created_by
  ) values (
    v_event_id, 'Lease Expiry Attendance', 'Staging Test Room', 'f2f', 'ongoing',
    v_day at time zone 'Asia/Manila', (v_day + interval '23 hours 59 minutes') at time zone 'Asia/Manila',
    now(), now() + interval '15 minutes', now(), (v_day + interval '23 hours 59 minutes') at time zone 'Asia/Manila', v_organizer_user
  );
  update public.events set event_status = 'ongoing', updated_at = now() where id = v_event_id;
end;
$$;
