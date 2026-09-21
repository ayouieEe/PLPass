begin;

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
    )) from public.event_sessions s where s.event_id=e.id and s.session_status in ('scheduled','ongoing')), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(jsonb_build_object(
      'studentId', st.id, 'studentNumber', st.student_id,
      'displayName', concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.last_name),
      'participantStatus', ep.participant_status, 'qrIdentifier', q.id,
      'faceEmbeddings', coalesce((select jsonb_agg(fe.embedding order by fe.pose) from public.student_face_embeddings fe where fe.student_id=st.id and fe.model_name='ArcFace' and fe.detector_backend='retinaface'), '[]'::jsonb)
    )) from public.event_participants ep join public.students st on st.id=ep.student_id join public.profiles p on p.id=st.profile_id
      left join lateral (select qc.id from public.qr_credentials qc where qc.student_id=st.id and qc.credential_status='activated' and (qc.expires_at is null or qc.expires_at>now()) order by qc.issued_at desc limit 1) q on true
      where ep.event_id=e.id and ep.participant_status<>'removed'), '[]'::jsonb),
    'studentDirectory', coalesce((select jsonb_agg(jsonb_build_object(
      'studentId', st.id, 'studentNumber', st.student_id,
      'displayName', concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.last_name),
      'participantStatus', 'directory', 'qrIdentifier', q.id, 'faceEmbeddings', '[]'::jsonb
    )) from public.students st join public.profiles p on p.id=st.profile_id
      left join lateral (select qc.id from public.qr_credentials qc where qc.student_id=st.id and qc.credential_status='activated' and (qc.expires_at is null or qc.expires_at>now()) order by qc.issued_at desc limit 1) q on true
      where st.student_status in ('enrolled', 'loa') and p.account_status='active'), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(jsonb_build_object('sessionId', ar.event_session_id, 'studentId', ar.student_id, 'attendanceStatus', ar.attendance_status, 'timeIn', ar.time_in, 'timeOut', ar.time_out))
      from public.attendance_records ar join public.event_sessions s on s.id=ar.event_session_id where s.event_id=e.id), '[]'::jsonb)
  ) into v_result from public.events e where e.id=v_event.id;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.offline_prepared', 'event', v_event.id, jsonb_build_object('session_id', v_session.id, 'directory_count', jsonb_array_length(v_result->'studentDirectory')));
  return v_result;
end;
$$;

revoke all on function public.prepare_offline_event_package(uuid) from public, anon;
grant execute on function public.prepare_offline_event_package(uuid) to authenticated;

commit;
