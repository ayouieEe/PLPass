begin;

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
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
  v_record public.attendance_records;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  select es.* into v_session
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id()
  for update of es;

  if not found or v_session.session_status <> 'ongoing' then
    raise exception 'An owned active session is required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.event_participants ep
    where ep.event_id = v_session.event_id
      and ep.student_id = p_student_id
      and ep.participant_status <> 'removed'
  ) then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;

  select * into v_record
  from public.attendance_records
  where event_session_id = p_session_id
    and student_id = p_student_id
  for update;

  -- A second scan is checkout. Preserve the original status and late reason.
  if found and v_record.time_in is not null and v_record.time_out is not null then
    raise exception 'Student has already checked in and out.' using errcode = '23505';
  elsif found and v_record.time_in is not null then
    update public.attendance_records
    set time_out = p_occurred_at,
        checkout_verification_method = 'manual',
        recorded_by = v_actor,
        remarks = concat_ws(': ', nullif(remarks, ''), 'Manual checkout - ' || btrim(coalesce(p_reason, '')),
          nullif(btrim(coalesce(p_remarks, '')), '')),
        updated_at = now()
    where id = v_record.id
    returning * into v_record;
  else
    if p_status not in ('present', 'late') then
      raise exception 'Manual attendance must be present or late.' using errcode = '22023';
    end if;
    if p_reason is null or length(btrim(p_reason)) < 5 then
      raise exception 'A manual attendance reason of at least 5 characters is required.' using errcode = '22023';
    end if;
    if p_status = 'late' and nullif(btrim(p_late_reason), '') is null then
      raise exception 'A late reason is required.' using errcode = '22023';
    end if;

    if found then
      update public.attendance_records
      set attendance_status = p_status,
          verification_method = 'manual',
          time_in = p_occurred_at,
          recorded_at = p_occurred_at,
          recorded_by = v_actor,
          remarks = concat_ws(': ', 'Manual override - ' || btrim(p_reason), nullif(btrim(coalesce(p_remarks, '')), '')),
          late_reason_category = case when p_status = 'late' then btrim(p_late_reason) else null end,
          updated_at = now()
      where id = v_record.id
      returning * into v_record;
    else
      insert into public.attendance_records(
        event_session_id, student_id, attendance_status, verification_method,
        time_in, recorded_at, recorded_by, remarks, late_reason_category
      )
      values (
        p_session_id, p_student_id, p_status, 'manual', p_occurred_at, p_occurred_at,
        v_actor, concat_ws(': ', 'Manual entry - ' || btrim(p_reason), nullif(btrim(coalesce(p_remarks, '')), '')),
        case when p_status = 'late' then btrim(p_late_reason) else null end
      )
      returning * into v_record;
    end if;
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'attendance.manual_recorded',
    'attendance_record',
    v_record.id,
    jsonb_build_object('session_id', p_session_id, 'student_id', p_student_id, 'status', v_record.attendance_status, 'reason', btrim(coalesce(p_reason, '')))
  );
  return v_record;
end;
$$;

revoke all on function public.record_manual_event_attendance(uuid, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.record_manual_event_attendance(uuid, uuid, text, text, text, text, timestamptz) to authenticated;

commit;
