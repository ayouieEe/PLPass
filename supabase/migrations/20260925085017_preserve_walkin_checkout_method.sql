begin;

-- Walk-ins can use a different valid capture method at Time Out. Keep that
-- audit detail separate from the original Time In method.
create or replace function public.sync_offline_walkin_attendance_v2(
  p_local_scan_uuid uuid,
  p_event_id uuid,
  p_session_id uuid,
  p_student_number text,
  p_identification_method text,
  p_time_in timestamptz,
  p_time_out timestamptz default null,
  p_checkout_identification_method text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_student public.students;
  v_profile public.profiles;
  v_existing public.attendance_records;
  v_attendance public.attendance_records;
  v_matches integer;
  v_display_name text;
  v_participant_added boolean := false;
  v_checkout_method text := coalesce(p_checkout_identification_method, p_identification_method);
begin
  if v_actor is null or not private.is_active_organizer() then
    return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'organizer_not_active');
  end if;
  if p_local_scan_uuid is null or p_event_id is null or p_session_id is null
     or p_student_number !~ '^[0-9]{2}-[0-9]{5}$' or p_time_in is null
     or (p_time_out is not null and p_time_out < p_time_in)
     or p_identification_method not in ('qr', 'manual')
     or (p_checkout_identification_method is not null and p_checkout_identification_method not in ('qr', 'manual')) then
    return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'invalid_scan');
  end if;

  select e.* into v_event from public.events e
  where e.id = p_event_id and e.organizer_id = private.current_organizer_id() for update;
  if not found then return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'event_not_owned'); end if;

  select s.* into v_session from public.event_sessions s
  where s.id = p_session_id and s.event_id = v_event.id and s.session_status in ('ongoing', 'completed');
  if not found then return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'session_not_available'); end if;
  if v_session.actual_end is not null and (p_time_in > v_session.actual_end or p_time_out > v_session.actual_end) then
    return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'scan_after_session_end');
  end if;

  select count(*) into v_matches from public.students s
  join public.profiles p on p.id = s.profile_id and p.role = 'student' and p.account_status = 'active'
  where upper(btrim(s.student_id)) = upper(btrim(p_student_number)) and s.student_status = 'enrolled';
  if v_matches <> 1 then return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'no_active_enrolled_student'); end if;

  select s.* into v_student from public.students s
  join public.profiles p on p.id = s.profile_id and p.role = 'student' and p.account_status = 'active'
  where upper(btrim(s.student_id)) = upper(btrim(p_student_number)) and s.student_status = 'enrolled';
  select p.* into v_profile from public.profiles p where p.id = v_student.profile_id;
  v_display_name := concat_ws(' ', v_profile.first_name, nullif(v_profile.middle_name, ''), v_profile.last_name);

  if exists (select 1 from public.event_participants ep where ep.event_id = v_event.id and ep.student_id = v_student.id and ep.participant_status = 'removed') then
    return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'student_removed_from_event');
  end if;

  select ar.* into v_existing from public.attendance_records ar where ar.local_attendance_uuid = p_local_scan_uuid;
  if found then
    if v_existing.event_session_id is distinct from p_session_id
       or v_existing.student_id is distinct from v_student.id
       or v_existing.time_in is distinct from p_time_in
       or (v_existing.time_out is not null and p_time_out is not null and v_existing.time_out is distinct from p_time_out) then
      return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'existing_scan_conflict');
    end if;
    if p_time_out is not null and v_existing.time_out is null then
      update public.attendance_records set time_out = p_time_out, checkout_verification_method = v_checkout_method,
        recorded_by = v_actor, updated_at = now() where id = v_existing.id returning * into v_existing;
    end if;
    return jsonb_build_object('disposition', 'confirmed_registered', 'attendance', to_jsonb(v_existing),
      'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_id, 'displayName', v_display_name));
  end if;

  insert into public.event_participants(event_id, student_id, participant_status)
  values (v_event.id, v_student.id, 'invited') on conflict(event_id, student_id) do nothing;
  get diagnostics v_matches = row_count;
  v_participant_added := v_matches = 1;

  begin
    v_attendance := public.sync_offline_event_attendance(
      p_local_scan_uuid, p_session_id, v_student.id, p_identification_method, 'absent', p_time_in, p_time_out,
      case when p_time_out is not null then v_checkout_method else null end, null, null
    );
  exception
    when unique_violation or foreign_key_violation or check_violation or invalid_parameter_value then
      return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'attendance_validation_conflict');
    when serialization_failure then
      if sqlerrm ~* 'central attendance record conflicts|central record differs' then
        return jsonb_build_object('disposition', 'discarded_permanent_conflict', 'reasonCode', 'central_attendance_conflict');
      end if;
      raise;
  end;
  if v_attendance.id is null then raise exception 'Offline walk-in synchronization was rate limited; retry safely.' using errcode = '55006'; end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance.offline_walkin_reconciled', 'event_participant', v_event.id,
    jsonb_build_object('student_id', v_student.id, 'session_id', v_session.id, 'local_scan_uuid', p_local_scan_uuid, 'participant_added', v_participant_added));
  return jsonb_build_object('disposition', 'confirmed_registered', 'attendance', to_jsonb(v_attendance),
    'student', jsonb_build_object('id', v_student.id, 'studentNumber', v_student.student_id, 'displayName', v_display_name));
end;
$$;

revoke all on function public.sync_offline_walkin_attendance_v2(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.sync_offline_walkin_attendance_v2(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text) to authenticated;

commit;
