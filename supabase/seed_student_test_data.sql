begin;

do $$
declare
  v_student_id uuid;
  v_student_profile_id uuid;
  v_department_id uuid;
  v_organizer_id uuid;
  v_organizer_profile_id uuid;
  v_category_id uuid;

  v_event_upcoming_id uuid := '11111111-1111-4111-8111-111111111111';
  v_event_ongoing_id uuid := '22222222-2222-4222-8222-222222222222';
  v_event_present_id uuid := '33333333-3333-4333-8333-333333333333';
  v_event_late_id uuid := '44444444-4444-4444-8444-444444444444';
  v_event_absent_id uuid := '55555555-5555-4555-8555-555555555555';

  v_session_upcoming_id uuid := 'aaaaaaaa-1111-4111-8111-111111111111';
  v_session_ongoing_id uuid := 'aaaaaaaa-2222-4222-8222-222222222222';
  v_session_present_id uuid := 'aaaaaaaa-3333-4333-8333-333333333333';
  v_session_late_id uuid := 'aaaaaaaa-4444-4444-8444-444444444444';
  v_session_absent_id uuid := 'aaaaaaaa-5555-4555-8555-555555555555';

  v_record_present_id uuid := 'bbbbbbbb-3333-4333-8333-333333333333';
  v_record_late_id uuid := 'bbbbbbbb-4444-4444-8444-444444444444';
  v_record_absent_id uuid := 'bbbbbbbb-5555-4555-8555-555555555555';
begin
  select s.id, s.profile_id, s.department_id
    into v_student_id, v_student_profile_id, v_department_id
  from public.students s
  join public.profiles p on p.id = s.profile_id
  where lower(p.email) = lower('balbacal_chrishamazel@plpass.edu.ph')
     or lower(p.student_id) = lower('23-00226')
     or lower(s.student_id) = lower('23-00226')
  limit 1;

  if v_student_id is null then
    raise exception 'Student test seed could not find Chrisha Mazel Balbacal. Update the email/student number in supabase/seed_student_test_data.sql.';
  end if;

  select o.id, o.profile_id
    into v_organizer_id, v_organizer_profile_id
  from public.organizers o
  join public.profiles p on p.id = o.profile_id
  where o.organizer_status = 'active'
    and p.account_status = 'active'
  order by o.created_at
  limit 1;

  if v_organizer_id is null then
    raise exception 'Student test seed needs at least one active organizer account before test events can be created.';
  end if;

  select id
    into v_category_id
  from public.event_categories
  where lower(category_name) = lower('Student Side Testing')
  limit 1;

  if v_category_id is null then
    insert into public.event_categories (category_name)
    values ('Student Side Testing')
    returning id into v_category_id;
  end if;

  delete from public.events
  where event_code in (
    'PLP-TST-UPCOMING',
    'PLP-TST-ONGOING',
    'PLP-TST-PRESENT',
    'PLP-TST-LATE',
    'PLP-TST-ABSENT'
  );

  delete from public.credential_requests
  where student_id = v_student_id
    and reason = 'Seeded resolved request for student request-history testing.';

  insert into public.events (
    id,
    event_code,
    organizer_id,
    department_id,
    category_id,
    title,
    description,
    venue,
    starts_at,
    ends_at,
    event_status,
    approval_status,
    predicted_turnout_percent
  )
  values
    (
      v_event_upcoming_id,
      'PLP-TST-UPCOMING',
      v_organizer_id,
      v_department_id,
      v_category_id,
      'PLPass Test: Upcoming Orientation',
      'Student-side test event for dashboard, events list, event details, and schedule display.',
      'PLM Activity Center',
      now() + interval '1 day',
      now() + interval '1 day 2 hours',
      'scheduled',
      'approved',
      82.50
    ),
    (
      v_event_ongoing_id,
      'PLP-TST-ONGOING',
      v_organizer_id,
      v_department_id,
      v_category_id,
      'PLPass Test: Ongoing Check-in',
      'Student-side test event for the ongoing tab and current attendance window.',
      'Computer Laboratory 1',
      now() - interval '30 minutes',
      now() + interval '90 minutes',
      'ongoing',
      'approved',
      76.00
    ),
    (
      v_event_present_id,
      'PLP-TST-PRESENT',
      v_organizer_id,
      v_department_id,
      v_category_id,
      'PLPass Test: Completed Present Record',
      'Student-side test event with a present attendance record and feedback objectives.',
      'Auditorium',
      now() - interval '7 days',
      now() - interval '7 days' + interval '2 hours',
      'completed',
      'approved',
      91.25
    ),
    (
      v_event_late_id,
      'PLP-TST-LATE',
      v_organizer_id,
      v_department_id,
      v_category_id,
      'PLPass Test: Completed Late Record',
      'Student-side test event with a late attendance record for late reason and correction testing.',
      'Room 401',
      now() - interval '5 days',
      now() - interval '5 days' + interval '2 hours',
      'completed',
      'approved',
      68.75
    ),
    (
      v_event_absent_id,
      'PLP-TST-ABSENT',
      v_organizer_id,
      v_department_id,
      v_category_id,
      'PLPass Test: Completed Absent Record',
      'Student-side test event with an absent record for excuse and correction testing.',
      'Room 402',
      now() - interval '3 days',
      now() - interval '3 days' + interval '2 hours',
      'completed',
      'approved',
      64.00
    );

  insert into public.event_participants (event_id, student_id, participant_status)
  values
    (v_event_upcoming_id, v_student_id, 'confirmed'),
    (v_event_ongoing_id, v_student_id, 'confirmed'),
    (v_event_present_id, v_student_id, 'confirmed'),
    (v_event_late_id, v_student_id, 'confirmed'),
    (v_event_absent_id, v_student_id, 'confirmed')
  on conflict (event_id, student_id) do update
    set participant_status = excluded.participant_status,
        updated_at = now();

  insert into public.event_sessions (
    id,
    event_id,
    session_name,
    venue,
    mode,
    session_status,
    scheduled_start,
    scheduled_end,
    actual_start,
    actual_end,
    late_cutoff_at,
    attendance_window_start_at,
    attendance_window_end_at,
    created_by
  )
  values
    (
      v_session_upcoming_id,
      v_event_upcoming_id,
      'Main session',
      'PLM Activity Center',
      'f2f',
      'scheduled',
      now() + interval '1 day',
      now() + interval '1 day 2 hours',
      null,
      null,
      now() + interval '1 day 15 minutes',
      now() + interval '1 day' - interval '15 minutes',
      now() + interval '1 day 2 hours',
      v_organizer_profile_id
    ),
    (
      v_session_ongoing_id,
      v_event_ongoing_id,
      'Live check-in session',
      'Computer Laboratory 1',
      'f2f',
      'ongoing',
      now() - interval '30 minutes',
      now() + interval '90 minutes',
      now() - interval '30 minutes',
      null,
      now() - interval '15 minutes',
      now() - interval '45 minutes',
      now() + interval '90 minutes',
      v_organizer_profile_id
    ),
    (
      v_session_present_id,
      v_event_present_id,
      'Completed session',
      'Auditorium',
      'f2f',
      'completed',
      now() - interval '7 days',
      now() - interval '7 days' + interval '2 hours',
      now() - interval '7 days',
      now() - interval '7 days' + interval '2 hours',
      now() - interval '7 days' + interval '15 minutes',
      now() - interval '7 days' - interval '15 minutes',
      now() - interval '7 days' + interval '2 hours',
      v_organizer_profile_id
    ),
    (
      v_session_late_id,
      v_event_late_id,
      'Completed late session',
      'Room 401',
      'f2f',
      'completed',
      now() - interval '5 days',
      now() - interval '5 days' + interval '2 hours',
      now() - interval '5 days',
      now() - interval '5 days' + interval '2 hours',
      now() - interval '5 days' + interval '15 minutes',
      now() - interval '5 days' - interval '15 minutes',
      now() - interval '5 days' + interval '2 hours',
      v_organizer_profile_id
    ),
    (
      v_session_absent_id,
      v_event_absent_id,
      'Completed absent session',
      'Room 402',
      'f2f',
      'completed',
      now() - interval '3 days',
      now() - interval '3 days' + interval '2 hours',
      now() - interval '3 days',
      now() - interval '3 days' + interval '2 hours',
      now() - interval '3 days' + interval '15 minutes',
      now() - interval '3 days' - interval '15 minutes',
      now() - interval '3 days' + interval '2 hours',
      v_organizer_profile_id
    );

  insert into public.attendance_records (
    id,
    event_session_id,
    student_id,
    attendance_status,
    verification_method,
    time_in,
    time_out,
    recorded_at,
    recorded_by,
    remarks,
    late_reason_category,
    minutes_late
  )
  values
    (
      v_record_present_id,
      v_session_present_id,
      v_student_id,
      'present',
      'qr',
      now() - interval '7 days' + interval '5 minutes',
      now() - interval '7 days' + interval '2 hours',
      now() - interval '7 days' + interval '5 minutes',
      v_organizer_profile_id,
      'Seeded student-side test present record',
      null,
      null
    ),
    (
      v_record_late_id,
      v_session_late_id,
      v_student_id,
      'late',
      'qr',
      now() - interval '5 days' + interval '25 minutes',
      now() - interval '5 days' + interval '2 hours',
      now() - interval '5 days' + interval '25 minutes',
      v_organizer_profile_id,
      'Seeded student-side test late record',
      null,
      10
    ),
    (
      v_record_absent_id,
      v_session_absent_id,
      v_student_id,
      'absent',
      'facial',
      null,
      null,
      now() - interval '3 days' + interval '2 hours',
      v_organizer_profile_id,
      'Seeded student-side test absent record',
      null,
      null
    );

  insert into public.event_objectives (event_id, objective_order, objective_text)
  values
    (v_event_upcoming_id, 1, 'Confirm that students can view upcoming published event details.'),
    (v_event_upcoming_id, 2, 'Confirm that event resources and schedules display correctly.'),
    (v_event_ongoing_id, 1, 'Confirm that ongoing events appear in the current attendance window.'),
    (v_event_present_id, 1, 'Evaluate whether event instructions were clear.'),
    (v_event_present_id, 2, 'Evaluate whether the event helped students understand PLPass attendance.'),
    (v_event_late_id, 1, 'Evaluate late-reason and correction request behavior.'),
    (v_event_late_id, 2, 'Confirm that student follow-up actions are visible.'),
    (v_event_absent_id, 1, 'Evaluate absent-record correction and excuse request behavior.')
  on conflict (event_id, objective_order) do update
    set objective_text = excluded.objective_text,
        updated_at = now();

  insert into public.qr_credentials (
    student_id,
    token_hash,
    credential_status,
    issued_at,
    expires_at,
    last_successful_check_in_at
  )
  select
    v_student_id,
    'plpass-test-token-hash-23-00226',
    'activated',
    now() - interval '30 days',
    now() + interval '180 days',
    now() - interval '7 days' + interval '5 minutes'
  where not exists (
    select 1
    from public.qr_credentials
    where student_id = v_student_id
      and credential_status = 'activated'
  );

  insert into public.facial_profiles (
    student_id,
    enrollment_reference,
    facial_status,
    enrolled_at,
    last_verified_at,
    consent_recorded_at
  )
  values (
    v_student_id,
    'plpass-test-face-23-00226',
    'activated',
    now() - interval '30 days',
    now() - interval '5 days',
    now() - interval '30 days'
  )
  on conflict (student_id) do nothing;

  insert into public.credential_requests (
    student_id,
    credential_type,
    request_type,
    reason,
    request_status,
    reviewed_by,
    reviewed_at,
    review_remarks
  )
  values (
    v_student_id,
    'qr',
    'technical_issue',
    'Seeded resolved request for student request-history testing.',
    'resolved',
    v_organizer_profile_id,
    now() - interval '2 days',
    'Seed data: issue resolved.'
  );
end $$;

commit;
