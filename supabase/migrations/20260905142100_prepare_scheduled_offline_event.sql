begin;

-- Preparing an upcoming event must not start attendance, but it needs a stable
-- session ID so the desktop package and later sync use the same record.
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

  select * into v_event
  from public.events
  where id = p_event_id
    and organizer_id = private.current_organizer_id()
    and event_status in ('scheduled', 'ongoing')
    and approval_status = 'approved'
  for update;

  if not found then
    raise exception 'An owned approved scheduled or ongoing event is required.' using errcode = '42501';
  end if;

  select * into v_session
  from public.event_sessions
  where event_id = v_event.id
    and session_status in ('scheduled', 'ongoing')
    and coalesce(session_archive_status, 'active') = 'active'
  order by case session_status when 'ongoing' then 0 else 1 end, scheduled_start desc
  limit 1
  for update;

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
    'cacheVersion', 1,
    'preparedAt', now(),
    'event', jsonb_build_object('id', e.id, 'code', e.event_code, 'title', e.title, 'status', e.event_status, 'startsAt', e.starts_at, 'endsAt', e.ends_at),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'eventId', s.event_id, 'title', s.session_name, 'venue', s.venue,
        'status', s.session_status, 'startsAt', s.scheduled_start, 'endsAt', s.scheduled_end,
        'lateCutoffAt', s.late_cutoff_at, 'attendanceWindowStartAt', s.attendance_window_start_at,
        'attendanceWindowEndAt', s.attendance_window_end_at
      )) from public.event_sessions s
      where s.event_id = e.id and s.session_status in ('scheduled', 'ongoing')
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'studentId', st.id, 'studentNumber', st.student_id,
        'displayName', concat_ws(' ', p.first_name, nullif(p.middle_name, ''), p.last_name),
        'participantStatus', ep.participant_status, 'qrIdentifier', q.id,
        'faceEmbeddings', coalesce((select jsonb_agg(fe.embedding order by fe.pose) from public.student_face_embeddings fe where fe.student_id = st.id and fe.model_name = 'ArcFace' and fe.detector_backend = 'retinaface'), '[]'::jsonb)
      ))
      from public.event_participants ep
      join public.students st on st.id = ep.student_id
      join public.profiles p on p.id = st.profile_id
      left join lateral (
        select qc.id from public.qr_credentials qc
        where qc.student_id = st.id and qc.credential_status = 'activated'
          and (qc.expires_at is null or qc.expires_at > now())
        order by qc.issued_at desc limit 1
      ) q on true
      where ep.event_id = e.id and ep.participant_status <> 'removed'
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('sessionId', ar.event_session_id, 'studentId', ar.student_id, 'attendanceStatus', ar.attendance_status, 'timeIn', ar.time_in, 'timeOut', ar.time_out))
      from public.attendance_records ar
      join public.event_sessions s on s.id = ar.event_session_id
      where s.event_id = e.id
    ), '[]'::jsonb)
  ) into v_result
  from public.events e where e.id = v_event.id;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'event.offline_prepared', 'event', v_event.id, jsonb_build_object('session_id', v_session.id));

  return v_result;
end;
$$;

-- Promote the prepared scheduled session at attendance start rather than
-- inserting another session for the same event.
create or replace function public.start_event_attendance_session(
  p_event_id uuid, p_venue text, p_scheduled_start timestamptz,
  p_scheduled_end timestamptz, p_mode text, p_late_cutoff_minutes integer default 15
) returns public.event_sessions
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_event public.events; v_session public.event_sessions; v_now timestamptz := now();
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_mode not in ('f2f', 'online') or p_scheduled_end <= p_scheduled_start or p_late_cutoff_minutes not between 0 and 240 then raise exception 'Invalid attendance session details.' using errcode = '22023'; end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() or v_event.approval_status <> 'approved' or v_event.event_status in ('completed', 'cancelled') then raise exception 'Only an owned approved event can start attendance.' using errcode = '42501'; end if;
  select * into v_session from public.event_sessions where event_id = p_event_id and session_status = 'ongoing' and coalesce(session_archive_status, 'active') = 'active' limit 1 for update;
  if found then return v_session; end if;
  select * into v_session from public.event_sessions where event_id = p_event_id and session_status = 'scheduled' and coalesce(session_archive_status, 'active') = 'active' order by scheduled_start desc limit 1 for update;
  if found then
    update public.event_sessions set venue = btrim(p_venue), mode = p_mode, session_status = 'ongoing', actual_start = v_now, attendance_window_start_at = v_now, attendance_window_end_at = null, late_cutoff_at = v_now + make_interval(mins => p_late_cutoff_minutes), updated_at = v_now where id = v_session.id returning * into v_session;
  else
    insert into public.event_sessions(event_id, created_by, session_name, venue, mode, session_status, scheduled_start, scheduled_end, actual_start, attendance_window_start_at, attendance_window_end_at, late_cutoff_at, session_archive_status)
    values (p_event_id, v_actor, to_char(p_scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') || ' attendance', btrim(p_venue), p_mode, 'ongoing', p_scheduled_start, p_scheduled_end, v_now, v_now, null, v_now + make_interval(mins => p_late_cutoff_minutes), 'active') returning * into v_session;
  end if;
  update public.events set event_status = 'ongoing', updated_at = v_now where id = p_event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata) values (v_actor, 'attendance_session.started', 'event_session', v_session.id, jsonb_build_object('event_id', p_event_id, 'late_cutoff_minutes', p_late_cutoff_minutes));
  return v_session;
end;
$$;

revoke all on function public.prepare_offline_event_package(uuid) from public, anon;
grant execute on function public.prepare_offline_event_package(uuid) to authenticated;
revoke all on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer) from public, anon;
grant execute on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer) to authenticated;

commit;
