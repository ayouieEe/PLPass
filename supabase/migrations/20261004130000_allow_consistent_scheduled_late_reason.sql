-- Preserve valid attendance pairs created by legacy/offline paths when the
-- session lifecycle row was not advanced from scheduled. The student still
-- needs a real Time In/Time Out pair and a pending feedback task.
create or replace function public.submit_event_late_reason(
  p_event_session_id uuid,
  p_late_reason_option_id uuid,
  p_late_reason text default null
) returns public.attendance_records
language plpgsql security definer set search_path = '' as $$
declare
  v_student_id uuid := private.current_student_id();
  v_session public.event_sessions;
  v_option public.attendance_late_reason_options;
  v_record public.attendance_records;
  v_now timestamptz := now();
begin
  if v_student_id is null then raise exception 'Authenticated student profile is required.' using errcode = '42501'; end if;

  select * into v_session from public.event_sessions
  where id = p_event_session_id
    and session_status in ('scheduled', 'ongoing', 'completed')
  for update;
  if not found or v_session.late_cutoff_at is null then
    raise exception 'The event session does not accept late reasons.' using errcode = '22023';
  end if;
  if v_session.session_status = 'completed' and (v_session.actual_end is null or v_now > v_session.actual_end + interval '24 hours') then
    raise exception 'The late-reason deadline has passed.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event_participants ep where ep.event_id = v_session.event_id
      and ep.student_id = v_student_id and ep.participant_status <> 'removed') then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;
  select * into v_option from public.attendance_late_reason_options where id = p_late_reason_option_id and is_active;
  if not found then raise exception 'Invalid or inactive late reason option.' using errcode = '22023'; end if;
  if v_option.code = 'other' and nullif(btrim(coalesce(p_late_reason, '')), '') is null then
    raise exception 'A custom late reason is required for Other.' using errcode = '22023';
  end if;
  select * into v_record from public.attendance_records
  where event_session_id = p_event_session_id and student_id = v_student_id for update;
  if not found or v_record.time_in is null or v_record.time_out is null then
    raise exception 'Complete Time In and Time Out before submitting a late reason.' using errcode = '22023';
  end if;
  if v_record.time_in <= v_session.late_cutoff_at then
    raise exception 'A late reason is only required when Time In is after the late cutoff.' using errcode = '22023';
  end if;
  if v_now <= v_record.time_out then
    raise exception 'Submit your late reason after Time Out.' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_feedback where attendance_record_id = v_record.id)
     or exists (select 1 from public.event_feedback_tasks where attendance_record_id = v_record.id and task_status = 'completed') then
    raise exception 'The late reason must be submitted before event feedback.' using errcode = '22023';
  end if;
  if v_record.late_reason_option_id is not null and v_record.late_reason_submitted_at > v_record.time_out then
    raise exception 'A late reason has already been submitted for this attendance record.' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_feedback_tasks where attendance_record_id = v_record.id and (task_status <> 'pending' or due_at <= v_now)) then
    raise exception 'The feedback deadline has passed.' using errcode = '22023';
  end if;
  update public.attendance_records set late_reason_option_id = v_option.id,
      late_reason_category = v_option.default_label,
      late_reason = case when v_option.code = 'other' then btrim(p_late_reason) else null end,
      late_reason_submitted_at = v_now, finalized_at = null, updated_at = v_now
  where id = v_record.id returning * into v_record;
  return v_record;
end;
$$;

revoke all on function public.submit_event_late_reason(uuid, uuid, text) from public, anon;
grant execute on function public.submit_event_late_reason(uuid, uuid, text) to authenticated;
