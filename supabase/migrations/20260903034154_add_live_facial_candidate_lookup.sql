begin;

create or replace function public.get_live_facial_candidates(p_event_session_id uuid)
returns table (
  student_id uuid,
  student_number text,
  display_name text,
  enrollment_reference text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may run facial identification.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.event_sessions session
    join public.events event on event.id = session.event_id
    join public.organizers organizer on organizer.id = event.organizer_id
    where session.id = p_event_session_id
      and session.session_status = 'ongoing'
      and organizer.profile_id = v_actor
  ) then
    raise exception 'An owned active attendance session is required.' using errcode = '42501';
  end if;

  return query
  select
    student.id,
    student.student_number,
    concat_ws(' ', profile.first_name, nullif(profile.middle_name, ''), profile.last_name),
    facial_profile.enrollment_reference
  from public.event_sessions session
  join public.event_participants participant
    on participant.event_id = session.event_id
   and participant.participant_status <> 'removed'
  join public.students student on student.id = participant.student_id
  join public.profiles profile on profile.id = student.profile_id
  join public.facial_profiles facial_profile
    on facial_profile.student_id = student.id
   and facial_profile.facial_status = 'activated'
  where session.id = p_event_session_id
  order by student.student_number;
end;
$$;

create or replace function public.record_live_facial_attendance(
  p_event_session_id uuid,
  p_student_id uuid,
  p_similarity double precision,
  p_action text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_session public.event_sessions;
  v_profile_id uuid;
  v_facial_profile_id uuid;
  v_record public.attendance_records;
  v_attempt public.verification_attempts;
  v_action text;
  v_status text;
  v_record_exists boolean := false;
begin
  if v_actor is null or not (select private.is_active_organizer()) then
    raise exception 'Only active organizers may record facial attendance.' using errcode = '42501';
  end if;
  if p_similarity is null or p_similarity < 0 or p_similarity > 1 then
    raise exception 'A valid facial similarity score is required.' using errcode = '22023';
  end if;
  if p_action not in ('check_in', 'check_out') then
    raise exception 'Facial attendance action must be check_in or check_out.' using errcode = '22023';
  end if;

  select session.* into v_session
  from public.event_sessions session
  join public.events event on event.id = session.event_id
  join public.organizers organizer on organizer.id = event.organizer_id
  where session.id = p_event_session_id
    and session.session_status = 'ongoing'
    and organizer.profile_id = v_actor
  for update of session;

  if not found then
    raise exception 'An owned active attendance session is required.' using errcode = '42501';
  end if;
  if p_occurred_at < coalesce(v_session.attendance_window_start_at, v_session.actual_start, v_session.scheduled_start)
     or p_occurred_at > coalesce(v_session.attendance_window_end_at, v_session.scheduled_end) then
    raise exception 'Facial identification is outside the attendance window.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.event_participants participant
    where participant.event_id = v_session.event_id
      and participant.student_id = p_student_id
      and participant.participant_status <> 'removed'
  ) or not exists (
    select 1 from public.facial_profiles facial_profile
    where facial_profile.student_id = p_student_id
      and facial_profile.facial_status = 'activated'
  ) then
    raise exception 'Student is not eligible for facial attendance in this session.' using errcode = '42501';
  end if;

  select facial_profile.id into v_facial_profile_id
  from public.facial_profiles facial_profile
  where facial_profile.student_id = p_student_id
    and facial_profile.facial_status = 'activated';

  v_profile_id := v_actor;

  select * into v_record
  from public.attendance_records
  where event_session_id = p_event_session_id and student_id = p_student_id
  for update;
  v_record_exists := found;

  if v_record_exists and v_record.time_in is not null and (p_action = 'check_in' or v_record.time_out is not null) then
    return jsonb_build_object('action', 'already_recorded', 'record_id', v_record.id, 'attendance_status', v_record.attendance_status);
  end if;

  if p_action = 'check_out' and (not v_record_exists or v_record.time_in is null) then
    raise exception 'Student must check in before facial check-out.' using errcode = '22023';
  end if;

  insert into public.verification_attempts (
    event_session_id, student_id, facial_profile_id, verification_method,
    attempted_at, accepted, failure_code, message
  ) values (
    p_event_session_id, p_student_id, v_facial_profile_id, 'facial',
    p_occurred_at, true, null, 'Live face identified by DeepFace.'
  ) returning * into v_attempt;

  if p_action = 'check_out' then
    update public.attendance_records
    set time_out = p_occurred_at,
        checkout_verification_method = 'facial',
        recorded_by = v_profile_id,
        updated_at = now()
    where id = v_record.id
    returning * into v_record;
    v_action := 'checked_out';
  elsif v_record_exists then
    v_status := case when p_occurred_at > coalesce(v_session.late_cutoff_at, p_occurred_at) then 'late' else 'present' end;
    update public.attendance_records
    set attendance_status = v_status,
        verification_method = 'facial',
        verification_attempt_id = v_attempt.id,
        time_in = p_occurred_at,
        recorded_at = p_occurred_at,
        recorded_by = v_profile_id,
        updated_at = now()
    where id = v_record.id
    returning * into v_record;
    v_action := 'checked_in';
  else
    v_status := case when p_occurred_at > coalesce(v_session.late_cutoff_at, p_occurred_at) then 'late' else 'present' end;
    insert into public.attendance_records (
      event_session_id, student_id, verification_attempt_id, attendance_status,
      verification_method, time_in, recorded_at, recorded_by
    ) values (
      p_event_session_id, p_student_id, v_attempt.id, v_status,
      'facial', p_occurred_at, p_occurred_at, v_profile_id
    ) returning * into v_record;
    v_action := 'checked_in';
  end if;

  update public.facial_profiles
  set last_verified_at = p_occurred_at, updated_at = now()
  where student_id = p_student_id;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'attendance.facial_' || v_action, 'attendance_record', v_record.id,
    jsonb_build_object('session_id', p_event_session_id, 'student_id', p_student_id, 'similarity', round(p_similarity::numeric, 4))
  );

  return jsonb_build_object(
    'action', v_action,
    'record_id', v_record.id,
    'attendance_status', v_record.attendance_status,
    'recorded_at', coalesce(v_record.time_out, v_record.time_in, v_record.recorded_at)
  );
end;
$$;

revoke all on function public.get_live_facial_candidates(uuid) from public, anon;
grant execute on function public.get_live_facial_candidates(uuid) to authenticated;
revoke all on function public.record_live_facial_attendance(uuid, uuid, double precision, text, timestamptz) from public, anon;
grant execute on function public.record_live_facial_attendance(uuid, uuid, double precision, text, timestamptz) to authenticated;

commit;
