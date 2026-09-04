begin;

create or replace function public.finalize_event_attendance_session(
  p_session_id uuid,
  p_reason text,
  p_attendance_records jsonb default '[]'::jsonb
) returns public.event_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
  v_now timestamptz := now();
  v_record jsonb;
  v_student_id uuid;
  v_status text;
  v_method text;
  v_time_in timestamptz;
  v_time_out timestamptz;
  v_late_reason text;
  v_remarks text;
  v_absent_count integer;
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'An ending reason of at least 5 characters is required.' using errcode = '22023'; end if;
  if jsonb_typeof(p_attendance_records) <> 'array' then raise exception 'Attendance records must be an array.' using errcode = '22023'; end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id()
  for update of es;
  if not found then raise exception 'Session was not found or is outside this organizer scope.' using errcode = '42501'; end if;
  if v_session.session_status <> 'ongoing' then raise exception 'Only an active session can be ended.' using errcode = '22023'; end if;

  for v_record in select value from jsonb_array_elements(p_attendance_records)
  loop
    v_student_id := (v_record->>'student_id')::uuid;
    v_status := v_record->>'attendance_status';
    v_method := v_record->>'verification_method';
    v_time_in := coalesce((v_record->>'time_in')::timestamptz, v_now);
    v_time_out := nullif(v_record->>'time_out', '')::timestamptz;
    v_late_reason := nullif(btrim(v_record->>'late_reason'), '');
    v_remarks := nullif(btrim(v_record->>'remarks'), '');

    if v_status not in ('present', 'late') then raise exception 'Draft attendance must be present or late.' using errcode = '22023'; end if;
    if v_method not in ('qr', 'facial', 'manual') then raise exception 'Invalid attendance verification method.' using errcode = '22023'; end if;
    if v_time_out is not null and v_time_out < v_time_in + interval '1 minute' then raise exception 'Time Out must be at least one minute after Time In.' using errcode = '22023'; end if;
    if not exists (
      select 1 from public.event_participants ep
      where ep.event_id = v_session.event_id and ep.student_id = v_student_id and ep.participant_status <> 'removed'
    ) then raise exception 'Student is not assigned to this event.' using errcode = '42501'; end if;

    insert into public.attendance_records(
      event_session_id, student_id, attendance_status, verification_method, time_in, time_out,
      checkout_verification_method, recorded_at, recorded_by, remarks, late_reason_category
    ) values (
      p_session_id, v_student_id, v_status, v_method, v_time_in, v_time_out,
      case when v_time_out is not null then v_method else null end, v_time_in, v_actor, v_remarks,
      case when v_status = 'late' then v_late_reason else null end
    )
    on conflict (event_session_id, student_id) where event_session_id is not null do update
    set attendance_status = excluded.attendance_status,
        verification_method = excluded.verification_method,
        time_in = excluded.time_in,
        time_out = excluded.time_out,
        checkout_verification_method = excluded.checkout_verification_method,
        recorded_at = excluded.recorded_at,
        recorded_by = excluded.recorded_by,
        remarks = excluded.remarks,
        late_reason_category = excluded.late_reason_category,
        updated_at = v_now;
  end loop;

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
  values (v_actor, 'attendance_session.finalized', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'draft_records', jsonb_array_length(p_attendance_records), 'automatically_absent', v_absent_count));
  return v_session;
end;
$$;

revoke all on function public.finalize_event_attendance_session(uuid, text, jsonb) from public, anon;
grant execute on function public.finalize_event_attendance_session(uuid, text, jsonb) to authenticated;

commit;
