begin;

-- Enforce one live session when existing data already satisfies the rule.
-- Do not rewrite historical session rows during deployment; legacy duplicates
-- can be reviewed separately by an organizer.
do $migration$
begin
  if not exists (
    select 1
    from public.event_sessions
    where session_status = 'ongoing'
      and coalesce(session_archive_status, 'active') = 'active'
    group by event_id
    having count(*) > 1
  ) then
    create unique index if not exists event_sessions_one_live_session_idx
    on public.event_sessions(event_id)
    where session_status = 'ongoing' and coalesce(session_archive_status, 'active') = 'active';
  else
    raise notice 'Skipped event_sessions_one_live_session_idx because legacy duplicate live sessions require review.';
  end if;
end
$migration$;

create or replace function public.start_event_attendance_session(
  p_event_id uuid,
  p_venue text,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_mode text,
  p_late_cutoff_minutes integer default 15
) returns public.event_sessions
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_event public.events; v_session public.event_sessions; v_now timestamptz := now();
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_mode not in ('f2f', 'online') then raise exception 'Invalid attendance mode.' using errcode = '22023'; end if;
  if p_scheduled_end <= p_scheduled_start or p_scheduled_end <= v_now then raise exception 'The session must end in the future.' using errcode = '22023'; end if;
  if p_late_cutoff_minutes not between 0 and 240 then raise exception 'Invalid late cutoff.' using errcode = '22023'; end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.organizer_id <> private.current_organizer_id() then raise exception 'Event was not found or is not owned by this organizer.' using errcode = '42501'; end if;
  if v_event.approval_status <> 'approved' or v_event.event_status in ('completed', 'cancelled') then raise exception 'Only an approved active event can start attendance.' using errcode = '22023'; end if;
  if exists (select 1 from public.event_sessions where event_id = p_event_id and session_status = 'ongoing' and coalesce(session_archive_status, 'active') = 'active') then
    raise exception 'This event already has an active attendance session.' using errcode = '23505';
  end if;
  insert into public.event_sessions(event_id, created_by, session_name, venue, mode, session_status, scheduled_start, scheduled_end,
    actual_start, attendance_window_start_at, attendance_window_end_at, late_cutoff_at, session_archive_status)
  values (p_event_id, v_actor, to_char(p_scheduled_start at time zone 'Asia/Manila', 'YYYY-MM-DD') || ' attendance', btrim(p_venue), p_mode,
    'ongoing', p_scheduled_start, p_scheduled_end, v_now, v_now, p_scheduled_end, v_now + make_interval(mins => p_late_cutoff_minutes), 'active')
  returning * into v_session;
  update public.events set event_status = 'ongoing', updated_at = v_now where id = p_event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.started', 'event_session', v_session.id, jsonb_build_object('event_id', p_event_id, 'late_cutoff_minutes', p_late_cutoff_minutes));
  return v_session;
end;
$$;

create or replace function public.end_event_attendance_session(p_session_id uuid, p_reason text)
returns public.event_sessions
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session public.event_sessions; v_now timestamptz := now(); v_absent_count integer;
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'An ending reason of at least 5 characters is required.' using errcode = '22023'; end if;
  select es.* into v_session from public.event_sessions es join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id() for update of es;
  if not found then raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501'; end if;
  if v_session.session_status <> 'ongoing' then raise exception 'Only an active session can be ended.' using errcode = '22023'; end if;
  insert into public.attendance_records(event_session_id, student_id, attendance_status, verification_method, recorded_at, recorded_by, remarks)
  select v_session.id, ep.student_id, 'absent', 'manual', v_now, v_actor, 'Automatically marked absent when session ended: ' || btrim(p_reason)
  from public.event_participants ep
  where ep.event_id = v_session.event_id and ep.participant_status <> 'removed'
    and not exists (select 1 from public.attendance_records ar where ar.event_session_id = v_session.id and ar.student_id = ep.student_id)
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;
  update public.event_sessions set session_status = 'completed', actual_end = v_now, ended_reason = btrim(p_reason), updated_at = v_now
  where id = p_session_id returning * into v_session;
  update public.events set event_status = 'completed', updated_at = v_now where id = v_session.event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.ended', 'event_session', p_session_id, jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'automatically_absent', v_absent_count));
  return v_session;
end;
$$;

create or replace function public.record_manual_event_attendance(
  p_session_id uuid,
  p_student_id uuid,
  p_status text,
  p_reason text,
  p_remarks text default null,
  p_late_reason text default null,
  p_occurred_at timestamptz default now()
) returns public.attendance_records
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session public.event_sessions; v_record public.attendance_records;
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_status not in ('present', 'late') then raise exception 'Manual attendance must be present or late.' using errcode = '22023'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'A manual attendance reason of at least 5 characters is required.' using errcode = '22023'; end if;
  if p_status = 'late' and nullif(btrim(p_late_reason), '') is null then raise exception 'A late reason is required.' using errcode = '22023'; end if;
  select es.* into v_session from public.event_sessions es join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id() for update of es;
  if not found or v_session.session_status <> 'ongoing' then raise exception 'An owned active session is required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.event_participants ep where ep.event_id = v_session.event_id and ep.student_id = p_student_id and ep.participant_status <> 'removed') then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;
  select * into v_record from public.attendance_records where event_session_id = p_session_id and student_id = p_student_id for update;
  if found and v_record.time_in is not null and v_record.time_out is not null then raise exception 'Student has already checked in and out.' using errcode = '23505'; end if;
  if found and v_record.time_in is not null then
    update public.attendance_records set time_out = p_occurred_at, checkout_verification_method = 'manual', recorded_by = v_actor,
      remarks = concat_ws(': ', nullif(remarks, ''), 'Manual checkout - ' || btrim(p_reason), nullif(btrim(p_remarks), '')), updated_at = now()
    where id = v_record.id returning * into v_record;
  elsif found then
    update public.attendance_records set attendance_status = p_status, verification_method = 'manual', time_in = p_occurred_at,
      recorded_at = p_occurred_at, recorded_by = v_actor, remarks = concat_ws(': ', 'Manual override - ' || btrim(p_reason), nullif(btrim(p_remarks), '')),
      late_reason_category = case when p_status = 'late' then btrim(p_late_reason) else null end, updated_at = now()
    where id = v_record.id returning * into v_record;
  else
    insert into public.attendance_records(event_session_id, student_id, attendance_status, verification_method, time_in, recorded_at, recorded_by, remarks, late_reason_category)
    values (p_session_id, p_student_id, p_status, 'manual', p_occurred_at, p_occurred_at, v_actor,
      concat_ws(': ', 'Manual entry - ' || btrim(p_reason), nullif(btrim(p_remarks), '')), case when p_status = 'late' then btrim(p_late_reason) else null end)
    returning * into v_record;
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance.manual_recorded', 'attendance_record', v_record.id,
    jsonb_build_object('session_id', p_session_id, 'student_id', p_student_id, 'status', p_status, 'reason', btrim(p_reason)));
  return v_record;
end;
$$;

revoke all on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer) from public, anon;
grant execute on function public.start_event_attendance_session(uuid, text, timestamptz, timestamptz, text, integer) to authenticated;
revoke all on function public.end_event_attendance_session(uuid, text) from public, anon;
grant execute on function public.end_event_attendance_session(uuid, text) to authenticated;
revoke all on function public.record_manual_event_attendance(uuid, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.record_manual_event_attendance(uuid, uuid, text, text, text, text, timestamptz) to authenticated;

commit;
