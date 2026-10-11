begin;

-- Keep every server-provided student table label aligned with User Management:
-- surname, first name M., extension. This changes display payloads only.
create or replace function public.prepare_offline_event_package(p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_event public.events;
  v_session public.event_sessions;
  v_result jsonb;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  select * into v_event from public.events
  where id = p_event_id
    and organizer_id = private.current_organizer_id()
    and event_status in ('scheduled', 'ongoing')
  for update;
  if not found then
    raise exception 'An owned scheduled or ongoing event is required.' using errcode = '42501';
  end if;

  select * into v_session from public.event_sessions
  where event_id = v_event.id
    and session_status in ('scheduled', 'ongoing')
    and coalesce(session_archive_status, 'active') = 'active'
  order by case session_status when 'ongoing' then 0 else 1 end, scheduled_start desc
  limit 1 for update;

  if not found then
    insert into public.event_sessions(
      event_id, created_by, session_name, venue, mode, session_status,
      scheduled_start, scheduled_end, attendance_window_start_at,
      attendance_window_end_at, late_cutoff_at, session_archive_status
    ) values (
      v_event.id, v_actor,
      to_char(v_event.starts_at at time zone 'Asia/Manila', 'YYYY-MM-DD') || ' attendance',
      v_event.venue, 'f2f', 'scheduled', v_event.starts_at, v_event.ends_at,
      v_event.starts_at, v_event.ends_at, v_event.starts_at + interval '15 minutes', 'active'
    ) returning * into v_session;
  end if;

  select jsonb_build_object(
    'cacheVersion', 2,
    'preparedAt', now(),
    'event', jsonb_build_object('id', e.id, 'code', e.event_code, 'title', e.title, 'status', e.event_status, 'startsAt', e.starts_at, 'endsAt', e.ends_at),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'eventId', s.event_id, 'title', s.session_name, 'venue', s.venue,
      'status', s.session_status, 'startsAt', s.scheduled_start, 'endsAt', s.scheduled_end,
      'lateCutoffAt', s.late_cutoff_at, 'attendanceWindowStartAt', s.attendance_window_start_at,
      'attendanceWindowEndAt', s.attendance_window_end_at
    )) from public.event_sessions s where s.event_id = e.id and s.session_status in ('scheduled', 'ongoing')), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'studentId', st.id, 'studentNumber', st.student_id,
      'displayName', case
        when nullif(btrim(p.last_name), '') is not null and nullif(btrim(p.first_name), '') is not null
          then concat_ws(' ', concat_ws(', ', p.last_name, p.first_name), nullif(left(btrim(coalesce(p.middle_name, '')), 1) || '.', '.'), nullif(btrim(p.name_extension), ''))
        else concat_ws(' ', p.first_name, nullif(btrim(p.middle_name), ''), p.last_name, nullif(btrim(p.name_extension), ''))
      end,
      'participantStatus', ep.participant_status, 'qrIdentifier', q.id
    )) from public.event_participants ep join public.students st on st.id = ep.student_id join public.profiles p on p.id = st.profile_id
      left join lateral (select qc.id from public.qr_credentials qc where qc.student_id = st.id and qc.credential_status = 'activated' and (qc.expires_at is null or qc.expires_at > now()) order by qc.issued_at desc limit 1) q on true
      where ep.event_id = e.id and ep.participant_status <> 'removed'), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('sessionId', ar.event_session_id, 'studentId', ar.student_id, 'attendanceStatus', ar.attendance_status, 'timeIn', ar.time_in, 'timeOut', ar.time_out))
      from public.attendance_records ar join public.event_sessions s on s.id = ar.event_session_id where s.event_id = e.id), '[]'::jsonb)
  ) into v_result from public.events e where e.id = v_event.id;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.offline_prepared', 'event', v_event.id, jsonb_build_object('session_id', v_session.id, 'participant_count', jsonb_array_length(v_result->'participants')));
  return v_result;
end;
$$;

revoke all on function public.prepare_offline_event_package(uuid) from public, anon;
grant execute on function public.prepare_offline_event_package(uuid) to authenticated;

create or replace function public.organizer_list_credential_directory()
returns table (
  student_id uuid, student_number text, student_name text,
  qr_id uuid, qr_credential_status text, qr_issued_at timestamptz, qr_expires_at timestamptz,
  qr_revoked_at timestamptz, qr_last_successful_check_in_at timestamptz, qr_created_at timestamptz, qr_updated_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select s.id, s.student_id,
    case
      when nullif(btrim(p.last_name), '') is not null and nullif(btrim(p.first_name), '') is not null
        then concat_ws(' ', concat_ws(', ', p.last_name, p.first_name), nullif(left(btrim(coalesce(p.middle_name, '')), 1) || '.', '.'), nullif(btrim(p.name_extension), ''))
      else concat_ws(' ', p.first_name, nullif(btrim(p.middle_name), ''), p.last_name, nullif(btrim(p.name_extension), ''))
    end,
    q.id, q.credential_status, q.issued_at, q.expires_at, q.revoked_at, q.last_successful_check_in_at, q.created_at, q.updated_at
  from public.students s
  join public.profiles p on p.id = s.profile_id
  left join lateral (
    select q.id, q.credential_status, q.issued_at, q.expires_at, q.revoked_at, q.last_successful_check_in_at, q.created_at, q.updated_at
    from public.qr_credentials q where q.student_id = s.id
    order by q.issued_at desc nulls last, q.created_at desc limit 1
  ) q on true
  where (select private.is_active_organizer())
    and exists (
      select 1
      from public.organizers organizer
      where organizer.id = (select private.current_organizer_id())
        and organizer.department_id is not null
        and organizer.department_id = s.department_id
    )
  order by s.student_id;
$$;

revoke all on function public.organizer_list_credential_directory() from public, anon, authenticated;
grant execute on function public.organizer_list_credential_directory() to authenticated;

create or replace function public.record_approved_event_walkin(
  p_local_scan_uuid uuid,
  p_event_id uuid,
  p_session_id uuid,
  p_student_number text,
  p_identification_method text,
  p_time_in timestamptz,
  p_time_out timestamptz default null,
  p_checkout_identification_method text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_event public.events; v_session public.event_sessions;
  v_student public.students; v_matches integer; v_record public.attendance_records; v_display_name text;
  v_participant_status text; v_origin text := 'walk_in'; v_disposition text := 'confirmed_walk_in';
  v_checkout text := coalesce(p_checkout_identification_method, p_identification_method);
begin
  if v_actor is null or not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_local_scan_uuid is null or p_student_number !~ '^[0-9]{2}-[0-9]{5}$'
     or p_identification_method not in ('qr','manual') or p_time_in is null
     or (p_time_out is not null and p_time_out < p_time_in + interval '1 minute')
     or v_checkout not in ('qr','manual') then
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','invalid_walkin');
  end if;
  select e.* into v_event from public.events e where e.id = p_event_id and e.organizer_id = private.current_organizer_id() for update;
  if not found then raise exception 'An owned event is required.' using errcode = '42501'; end if;
  select s.* into v_session from public.event_sessions s where s.id = p_session_id and s.event_id = v_event.id and s.session_status in ('ongoing','completed');
  if not found or (v_session.actual_end is not null and (p_time_in > v_session.actual_end or p_time_out > v_session.actual_end)) then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
      (v_actor,'attendance.offline_walkin_discarded','event',v_event.id,jsonb_build_object('reason_code','session_not_available','student_number',p_student_number,'session_id',p_session_id,'local_scan_uuid',p_local_scan_uuid));
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','session_not_available');
  end if;
  select count(*) into v_matches from public.students s join public.profiles p on p.id = s.profile_id
    where upper(btrim(s.student_id)) = upper(btrim(p_student_number)) and s.student_status = 'enrolled' and p.role = 'student' and p.account_status = 'active';
  if v_matches <> 1 then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
      (v_actor,'attendance.offline_walkin_discarded','event',v_event.id,jsonb_build_object('reason_code','student_not_found','student_number',p_student_number,'session_id',p_session_id,'local_scan_uuid',p_local_scan_uuid));
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','student_not_found');
  end if;
  select s.* into v_student from public.students s join public.profiles p on p.id = s.profile_id
    where upper(btrim(s.student_id)) = upper(btrim(p_student_number)) and s.student_status = 'enrolled' and p.role = 'student' and p.account_status = 'active' order by s.id limit 1;
  select case
    when nullif(btrim(p.last_name), '') is not null and nullif(btrim(p.first_name), '') is not null
      then concat_ws(' ', concat_ws(', ', p.last_name, p.first_name), nullif(left(btrim(coalesce(p.middle_name, '')), 1) || '.', '.'), nullif(btrim(p.name_extension), ''))
    else concat_ws(' ', p.first_name, nullif(btrim(p.middle_name), ''), p.last_name, nullif(btrim(p.name_extension), ''))
  end into v_display_name from public.profiles p where p.id = v_student.profile_id;
  select participant_status into v_participant_status from public.event_participants where event_id = v_event.id and student_id = v_student.id;
  if v_participant_status = 'removed' then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
      (v_actor,'attendance.offline_walkin_discarded','event',v_event.id,jsonb_build_object('reason_code','student_removed','student_id',v_student.id,'session_id',p_session_id,'local_scan_uuid',p_local_scan_uuid));
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','student_removed');
  end if;
  if v_participant_status in ('invited','confirmed') then
    v_origin := 'invited';
    v_disposition := 'confirmed_invited';
  else
    insert into public.event_participants(event_id,student_id,participant_status) values(v_event.id,v_student.id,'walk_in') on conflict(event_id,student_id) do nothing;
  end if;
  select * into v_record from public.attendance_records where event_session_id = p_session_id and student_id = v_student.id for update;
  if found and v_record.local_attendance_uuid is distinct from p_local_scan_uuid then
    insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
      (v_actor,'attendance.offline_walkin_discarded','attendance_record',v_record.id,jsonb_build_object('reason_code','duplicate_student','student_id',v_student.id,'session_id',p_session_id,'local_scan_uuid',p_local_scan_uuid));
    return jsonb_build_object('disposition','discarded_permanent_conflict','reasonCode','duplicate_student');
  end if;
  insert into public.attendance_records(event_session_id,student_id,attendance_status,attendance_origin,verification_method,checkout_verification_method,time_in,time_out,recorded_at,recorded_by,local_attendance_uuid)
  values(p_session_id,v_student.id,case when v_session.late_cutoff_at is not null and p_time_in > v_session.late_cutoff_at then 'late' else 'present' end,v_origin,p_identification_method,case when p_time_out is null then null else v_checkout end,p_time_in,p_time_out,p_time_in,v_actor,p_local_scan_uuid)
  on conflict(event_session_id,student_id) where event_session_id is not null do update set
    time_out = coalesce(excluded.time_out,public.attendance_records.time_out),
    checkout_verification_method = coalesce(excluded.checkout_verification_method,public.attendance_records.checkout_verification_method),
    attendance_origin = case when public.attendance_records.attendance_origin = 'walk_in' then 'walk_in' else excluded.attendance_origin end,
    updated_at = now()
  returning * into v_record;
  insert into public.audit_logs(actor_user_id,action,target_type,target_id,metadata) values
    (v_actor,case when v_disposition = 'confirmed_invited' then 'attendance.offline_invited_reconciled' else 'attendance.walkin_admitted' end,'attendance_record',v_record.id,jsonb_build_object('event_id',v_event.id,'session_id',v_session.id,'student_id',v_student.id,'local_scan_uuid',p_local_scan_uuid));
  return jsonb_build_object('disposition',v_disposition,'attendance',to_jsonb(v_record),'student',jsonb_build_object('id',v_student.id,'studentNumber',v_student.student_id,'displayName',v_display_name));
end;
$$;

revoke all on function public.record_approved_event_walkin(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.record_approved_event_walkin(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text) to authenticated;

commit;
