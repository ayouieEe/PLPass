begin;

-- Attendance outcomes remain one of three values. A NULL finalized_at means
-- the record is still in the required check-in / check-out / feedback flow.
alter table public.attendance_records
  add column if not exists finalized_at timestamptz,
  add column if not exists late_reason_submitted_at timestamptz;

-- Preserve evidence, but correct historical outcomes that never met the new
-- completion rule. Event records only; class attendance keeps its own flow.
update public.attendance_records ar
set attendance_status = 'absent'
where ar.attendance_status = 'excused'
   or (ar.event_session_id is not null and ar.attendance_status in ('present', 'late') and (
      ar.time_in is null
      or ar.time_out is null
      or not exists (
        select 1 from public.event_feedback_tasks task
        join public.event_feedback feedback on feedback.attendance_record_id = ar.id
        where task.attendance_record_id = ar.id and task.task_status = 'completed'
          and not exists (select 1 from public.event_feedback_task_objectives assigned
            where assigned.task_id = task.id and not exists (select 1 from public.event_feedback_ratings rating
              where rating.feedback_id = feedback.id and rating.objective_id = assigned.objective_id))
          and not exists (select 1 from public.event_feedback_ratings rating
            where rating.feedback_id = feedback.id and not exists (select 1 from public.event_feedback_task_objectives assigned
              where assigned.task_id = task.id and assigned.objective_id = rating.objective_id))
          and not exists (select 1 from public.event_feedback_ratings rating
            where rating.feedback_id = feedback.id group by rating.objective_id having count(*) <> 1)
      )
      or (ar.attendance_status = 'late' and (ar.time_in is null or ar.time_out is null or ar.late_reason_option_id is null
          or ar.late_reason_submitted_at is null or ar.late_reason_submitted_at <= ar.time_out))
    ));

-- Historical records are finalized at migration time. Future check-ins are
-- explicitly written with finalized_at = NULL by the guard below.
update public.attendance_records set finalized_at = coalesce(updated_at, recorded_at, now()) where finalized_at is null;
update public.attendance_requests set requested_status = 'absent' where requested_status = 'excused';

alter table public.attendance_records drop constraint if exists attendance_records_status_valid;
alter table public.attendance_records add constraint attendance_records_status_valid
  check (attendance_status in ('present', 'late', 'absent'));
alter table public.attendance_requests drop constraint if exists attendance_requests_status_valid;
alter table public.attendance_requests add constraint attendance_requests_status_valid
  check (requested_status in ('present', 'late', 'absent'));

create or replace function private.require_finalized_attendance_for_correction()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.requested_status not in ('present', 'late', 'absent') then
    raise exception 'Correction target must be Present, Late, or Absent.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.attendance_records ar where ar.id = new.attendance_record_id and ar.finalized_at is not null) then
    raise exception 'Attendance corrections are available only after workflow finalization.' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists require_finalized_attendance_for_correction on public.attendance_requests;
create trigger require_finalized_attendance_for_correction
before insert or update of attendance_record_id, requested_status on public.attendance_requests
for each row execute function private.require_finalized_attendance_for_correction();

create or replace function private.enforce_event_attendance_completion()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_late_cutoff timestamptz;
  v_complete_feedback boolean;
begin
  if new.attendance_status not in ('present', 'late', 'absent') then
    raise exception 'Attendance status must be Present, Late, or Absent.' using errcode = '23514';
  end if;
  if new.time_out is not null and (new.time_in is null or new.time_out < new.time_in) then
    raise exception 'Time Out must be recorded after Time In.' using errcode = '22023';
  end if;
  if new.event_session_id is null then
    if new.finalized_at is null then new.finalized_at := now(); end if;
    return new;
  end if;

  select es.late_cutoff_at into v_late_cutoff
  from public.event_sessions es where es.id = new.event_session_id;

  v_complete_feedback := new.time_in is not null and new.time_out is not null and exists (
    select 1 from public.event_feedback_tasks task
    join public.event_feedback feedback on feedback.attendance_record_id = task.attendance_record_id
    where task.attendance_record_id = new.id and task.task_status = 'completed'
      and not exists (select 1 from public.event_feedback_task_objectives assigned
        where assigned.task_id = task.id and not exists (select 1 from public.event_feedback_ratings rating
          where rating.feedback_id = feedback.id and rating.objective_id = assigned.objective_id))
      and not exists (select 1 from public.event_feedback_ratings rating
        where rating.feedback_id = feedback.id and not exists (select 1 from public.event_feedback_task_objectives assigned
          where assigned.task_id = task.id and assigned.objective_id = rating.objective_id))
      and not exists (select 1 from public.event_feedback_ratings rating
        where rating.feedback_id = feedback.id group by rating.objective_id having count(*) <> 1)
  );

  if new.attendance_status in ('present', 'late') then
    if not v_complete_feedback
       or (v_late_cutoff is not null and new.time_in > v_late_cutoff
           and (new.time_out is null or new.late_reason_option_id is null or new.late_reason_submitted_at is null
             or new.late_reason_submitted_at <= new.time_out)) then
      new.attendance_status := 'absent';
      new.finalized_at := null;
    else
      new.attendance_status := case when v_late_cutoff is not null and new.time_in > v_late_cutoff then 'late' else 'present' end;
      new.finalized_at := coalesce(new.finalized_at, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_event_attendance_completion on public.attendance_records;
create trigger enforce_event_attendance_completion
before insert or update of attendance_status, event_session_id, time_in, time_out, late_reason_option_id, late_reason_submitted_at, finalized_at
on public.attendance_records for each row execute function private.enforce_event_attendance_completion();

-- Offline or delayed synchronization can arrive after the session-close
-- trigger has already created feedback tasks. Ensure complete time pairs
-- arriving late still get the same 24-hour feedback window.
create or replace function private.ensure_feedback_task_for_completed_session()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_session public.event_sessions;
begin
  if new.event_session_id is not null and new.time_in is not null and new.time_out is not null and new.finalized_at is null then
    select * into v_session from public.event_sessions where id = new.event_session_id;
    if found and v_session.session_status = 'completed' then
      perform private.create_feedback_tasks_for_session(v_session.id, coalesce(v_session.updated_at, now()) + interval '24 hours');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists ensure_feedback_task_for_completed_session on public.attendance_records;
create trigger ensure_feedback_task_for_completed_session
after insert or update of time_in, time_out on public.attendance_records
for each row execute function private.ensure_feedback_task_for_completed_session();

create or replace function private.finalize_incomplete_event_attendance_after_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.session_status = 'completed' and old.session_status is distinct from 'completed' then
    update public.attendance_records set attendance_status = 'absent', finalized_at = coalesce(finalized_at, now()),
      remarks = concat_ws(E'\n', remarks, 'Attendance finalized absent: Time In or Time Out was not completed before session close.'), updated_at = now()
    where event_session_id = new.id and finalized_at is null and (time_in is null or time_out is null);
    insert into public.attendance_records(event_session_id, student_id, attendance_status, verification_method,
      recorded_at, recorded_by, remarks, finalized_at)
    select new.id, participant.student_id, 'absent', 'manual', coalesce(new.actual_end, now()), auth.uid(),
      'Automatically marked absent when session ended: no attendance was recorded.', coalesce(new.actual_end, now())
    from public.event_participants participant
    where participant.event_id = new.event_id and participant.participant_status <> 'removed'
      and not exists (select 1 from public.attendance_records record
        where record.event_session_id = new.id and record.student_id = participant.student_id)
    on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists finalize_incomplete_event_attendance_after_session on public.event_sessions;
create trigger finalize_incomplete_event_attendance_after_session
after update of session_status on public.event_sessions for each row
execute function private.finalize_incomplete_event_attendance_after_session();

-- A student submits a configured late reason after Time Out and before
-- feedback. Check-in/out records are created by attendance capture; this
-- function never creates a placeholder that can bypass that order.
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
  where id = p_event_session_id and session_status in ('ongoing','completed') for update;
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

-- Manual capture records provisional Time In/Time Out without requiring a
-- late reason up front. The student submits that reason after checkout.
create or replace function public.record_manual_event_attendance(
  p_session_id uuid, p_student_id uuid, p_status text, p_reason text,
  p_remarks text default null, p_late_reason text default null, p_occurred_at timestamptz default now()
) returns public.attendance_records
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_session public.event_sessions;
  v_record public.attendance_records;
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  select es.* into v_session from public.event_sessions es join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id() for update of es;
  if not found or v_session.session_status <> 'ongoing' then raise exception 'An owned active session is required.' using errcode = '42501'; end if;
  if not exists (select 1 from public.event_participants ep where ep.event_id = v_session.event_id and ep.student_id = p_student_id and ep.participant_status <> 'removed') then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;
  select * into v_record from public.attendance_records where event_session_id = p_session_id and student_id = p_student_id for update;
  if found and v_record.time_in is not null and v_record.time_out is not null then
    raise exception 'Student has already checked in and out.' using errcode = '23505';
  elsif found and v_record.time_in is not null then
    update public.attendance_records set time_out = p_occurred_at, checkout_verification_method = 'manual',
      recorded_by = v_actor, updated_at = now()
    where id = v_record.id returning * into v_record;
  else
    if p_status not in ('present', 'late') then raise exception 'Manual attendance must be present or late.' using errcode = '22023'; end if;
    if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'A manual attendance reason of at least 5 characters is required.' using errcode = '22023'; end if;
    if found then
      update public.attendance_records set attendance_status = 'absent', verification_method = 'manual',
        time_in = p_occurred_at, recorded_at = p_occurred_at, recorded_by = v_actor,
        remarks = concat_ws(': ', 'Manual override - ' || btrim(p_reason), nullif(btrim(coalesce(p_remarks, '')), '')),
        finalized_at = null, updated_at = now()
      where id = v_record.id returning * into v_record;
    else
      insert into public.attendance_records(event_session_id, student_id, attendance_status, verification_method, time_in, recorded_at, recorded_by, remarks, finalized_at)
      values (p_session_id, p_student_id, 'absent', 'manual', p_occurred_at, p_occurred_at, v_actor,
        concat_ws(': ', 'Manual entry - ' || btrim(p_reason), nullif(btrim(coalesce(p_remarks, '')), '')), null)
      returning * into v_record;
    end if;
  end if;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance.manual_recorded', 'attendance_record', v_record.id,
    jsonb_build_object('session_id', p_session_id, 'student_id', p_student_id, 'status', v_record.attendance_status, 'reason', btrim(coalesce(p_reason, ''))));
  return v_record;
end;
$$;
revoke all on function public.record_manual_event_attendance(uuid, uuid, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.record_manual_event_attendance(uuid, uuid, text, text, text, text, timestamptz) to authenticated;

-- Feedback can only be assigned after a complete time-in/time-out pair. The
-- provisional status remains Absent until the task is completed.
create or replace function private.create_feedback_tasks_for_session(p_session_id uuid, p_due_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_feedback_tasks(attendance_record_id, event_id, student_id, due_at)
  select ar.id, es.event_id, ar.student_id, p_due_at
  from public.attendance_records ar join public.event_sessions es on es.id = ar.event_session_id
  where ar.event_session_id = p_session_id and ar.time_in is not null and ar.time_out is not null
    and ar.finalized_at is null
    and not exists (select 1 from public.event_feedback ef where ef.attendance_record_id = ar.id)
  on conflict (attendance_record_id) do nothing;

  insert into public.event_feedback_task_objectives(task_id, objective_id, objective_order, objective_text)
  select task.id, objective.id, objective.objective_order, objective.objective_text
  from public.event_feedback_tasks task join public.event_objectives objective on objective.event_id = task.event_id
  where task.attendance_record_id in (select id from public.attendance_records where event_session_id = p_session_id)
  on conflict (task_id, objective_id) do nothing;
end;
$$;

create or replace function public.expire_overdue_feedback_tasks()
returns integer language plpgsql security definer set search_path = '' as $$
declare expired_count integer := 0;
begin
  with expired as (
    update public.event_feedback_tasks set task_status = 'expired', expired_at = now(), updated_at = now()
    where task_status = 'pending' and due_at <= now() returning attendance_record_id
  ), updated as (
    update public.attendance_records ar set attendance_status = 'absent', finalized_at = now(),
      remarks = concat_ws(E'\n', ar.remarks, 'Attendance finalized absent: required feedback was not submitted within 24 hours.'), updated_at = now()
    from expired where ar.id = expired.attendance_record_id returning ar.id
  ) select count(*) into expired_count from updated;
  return expired_count;
end;
$$;

create or replace function public.submit_feedback_task(
  p_task_id uuid, p_comment text, p_ratings jsonb,
  p_sentiment_label text default null, p_sentiment_score numeric default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_task public.event_feedback_tasks;
  v_record public.attendance_records;
  v_feedback_id uuid;
  v_expected_count integer;
  v_received_count integer;
begin
  perform public.expire_overdue_feedback_tasks();
  select * into v_task from public.event_feedback_tasks where id = p_task_id for update;
  if not found or v_task.student_id <> private.current_student_id() then raise exception 'Feedback task was not found.' using errcode = '42501'; end if;
  if v_task.task_status <> 'pending' or v_task.due_at <= now() then raise exception 'This feedback task is no longer available.' using errcode = '22023'; end if;
  select * into v_record from public.attendance_records where id = v_task.attendance_record_id for update;
  if not found or v_record.time_in is null or v_record.time_out is null then raise exception 'Time In and Time Out must be completed before feedback.' using errcode = '22023'; end if;
  select count(*) into v_expected_count from public.event_feedback_task_objectives where task_id = v_task.id;
  select count(*) into v_received_count from jsonb_array_elements(coalesce(p_ratings, '[]'::jsonb));
  if v_received_count <> v_expected_count then raise exception 'Rate every assigned event objective before submitting feedback.' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer) where rating.rating not between 1 and 5)
     or exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer) group by rating.objective_id having count(*) <> 1)
     or exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer)
       where not exists (select 1 from public.event_feedback_task_objectives assigned where assigned.task_id = v_task.id and assigned.objective_id = rating.objective_id)) then
    raise exception 'Feedback ratings must match every assigned objective and use values from 1 to 5.' using errcode = '22023';
  end if;
  if v_record.time_in > (select late_cutoff_at from public.event_sessions where id = v_record.event_session_id)
     and (v_record.late_reason_option_id is null or v_record.late_reason_submitted_at is null
       or v_record.late_reason_submitted_at <= v_record.time_out) then
    raise exception 'Submit your late reason after Time Out and before event feedback.' using errcode = '22023';
  end if;
  insert into public.event_feedback(event_id, student_id, attendance_record_id, comment, sentiment_label, sentiment_score)
  values (v_task.event_id, v_task.student_id, v_task.attendance_record_id, nullif(btrim(coalesce(p_comment, '')), ''), p_sentiment_label, p_sentiment_score)
  on conflict (attendance_record_id) do update set comment = excluded.comment, sentiment_label = excluded.sentiment_label,
    sentiment_score = excluded.sentiment_score, updated_at = now() returning id into v_feedback_id;
  delete from public.event_feedback_ratings where feedback_id = v_feedback_id;
  insert into public.event_feedback_ratings(feedback_id, objective_id, rating)
  select v_feedback_id, rating.objective_id, rating.rating from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer);
  update public.event_feedback_tasks set task_status = 'completed', completed_at = now(), updated_at = now() where id = v_task.id;
  update public.attendance_records set attendance_status = case
      when time_in > (select late_cutoff_at from public.event_sessions where id = event_session_id) then 'late' else 'present' end,
    finalized_at = now(), updated_at = now()
  where id = v_record.id;
  return v_feedback_id;
end;
$$;

-- Session close finalizes anyone who did not complete both capture steps as
-- absent; complete time pairs receive their existing 24-hour feedback task.
create or replace function public.end_event_attendance_session(p_session_id uuid, p_reason text)
returns public.event_sessions language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_session public.event_sessions; v_now timestamptz := now(); v_absent_count integer;
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'An ending reason of at least 5 characters is required.' using errcode = '22023'; end if;
  select es.* into v_session from public.event_sessions es join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id() for update of es;
  if not found or v_session.session_status <> 'ongoing' then raise exception 'Only an active owned session can be ended.' using errcode = '22023'; end if;

  update public.attendance_records set attendance_status = 'absent', finalized_at = v_now,
    remarks = concat_ws(E'\n', remarks, 'Attendance finalized absent: Time In or Time Out was not completed before session close.'), updated_at = v_now
  where event_session_id = v_session.id and finalized_at is null and (time_in is null or time_out is null);

  insert into public.attendance_records(event_session_id, student_id, attendance_status, verification_method, recorded_at, recorded_by, remarks, finalized_at)
  select v_session.id, ep.student_id, 'absent', 'manual', v_now, v_actor,
    'Automatically marked absent when session ended: ' || btrim(p_reason), v_now
  from public.event_participants ep where ep.event_id = v_session.event_id and ep.participant_status <> 'removed'
    and not exists (select 1 from public.attendance_records ar where ar.event_session_id = v_session.id and ar.student_id = ep.student_id)
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;
  update public.event_sessions set session_status = 'completed', actual_end = v_now, ended_reason = btrim(p_reason), updated_at = v_now
  where id = p_session_id returning * into v_session;
  update public.events set event_status = 'completed', updated_at = v_now where id = v_session.event_id;
  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'attendance_session.ended', 'event_session', p_session_id,
    jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'automatically_absent', v_absent_count));
  return v_session;
end;
$$;

revoke all on function public.end_event_attendance_session(uuid, text) from public, anon;
grant execute on function public.end_event_attendance_session(uuid, text) to authenticated;

-- Do not trust the legacy client-supplied final status payload. Online scans
-- and manual capture already persist records; session close only closes the
-- session and lets the database finalize absences / create feedback tasks.
create or replace function public.finalize_event_attendance_session(
  p_session_id uuid, p_reason text, p_attendance_records jsonb default '[]'::jsonb
) returns public.event_sessions
language plpgsql security definer set search_path = '' as $$
begin
  return public.end_event_attendance_session(p_session_id, p_reason);
end;
$$;
revoke all on function public.finalize_event_attendance_session(uuid, text, jsonb) from public, anon;
grant execute on function public.finalize_event_attendance_session(uuid, text, jsonb) to authenticated;

-- Offline sync may create/update provisional check-in and checkout records;
-- the student submits any required late reason after the sync, before feedback.
create or replace function public.sync_offline_event_attendance(
  p_local_attendance_uuid uuid, p_session_id uuid, p_student_id uuid,
  p_identification_method text, p_attendance_status text, p_time_in timestamptz,
  p_time_out timestamptz default null, p_checkout_identification_method text default null,
  p_remarks text default null, p_late_reason text default null
) returns public.attendance_records
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_last_request_at timestamptz;
  v_session public.event_sessions;
  v_record public.attendance_records;
begin
  if not private.is_active_organizer() then raise exception 'An active organizer account is required.' using errcode = '42501'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended(v_actor::text, 0)) then return null; end if;
  select last_request_at into v_last_request_at from private.offline_sync_rate_limits where actor_id = v_actor;
  if v_last_request_at is not null and v_last_request_at > clock_timestamp() - interval '100 milliseconds' then return null; end if;
  insert into private.offline_sync_rate_limits(actor_id, last_request_at) values (v_actor, clock_timestamp())
    on conflict (actor_id) do update set last_request_at = excluded.last_request_at;
  if p_local_attendance_uuid is null or p_time_in is null or (p_time_out is not null and p_time_out < p_time_in) then
    raise exception 'Offline attendance identity and ordered time values are required.' using errcode = '22023';
  end if;
  if p_identification_method not in ('qr','facial','manual') or (p_checkout_identification_method is not null and p_checkout_identification_method not in ('qr','facial','manual')) then
    raise exception 'Unsupported attendance identification method.' using errcode = '22023';
  end if;
  select * into v_record from public.attendance_records where local_attendance_uuid = p_local_attendance_uuid;
  if found then return v_record; end if;
  select es.* into v_session from public.event_sessions es join public.events e on e.id = es.event_id
  where es.id = p_session_id and e.organizer_id = private.current_organizer_id();
  if not found or v_session.session_status not in ('ongoing','completed') then raise exception 'An owned event session is required.' using errcode = '42501'; end if;
  if v_session.actual_end is not null and (p_time_in > v_session.actual_end or p_time_out > v_session.actual_end) then
    raise exception 'Offline attendance timestamps cannot be later than the session end.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.event_participants ep where ep.event_id = v_session.event_id and ep.student_id = p_student_id and ep.participant_status <> 'removed') then
    raise exception 'Student is not assigned to this event.' using errcode = '42501';
  end if;
  select * into v_record from public.attendance_records where local_attendance_uuid = p_local_attendance_uuid for update;
  if found then
    if v_record.event_session_id is distinct from p_session_id or v_record.student_id is distinct from p_student_id then
      raise exception 'Offline attendance identity conflicts with its existing record.' using errcode = '23505';
    end if;
    if v_record.time_in is distinct from p_time_in or (v_record.time_out is not null and p_time_out is not null and v_record.time_out is distinct from p_time_out) then
      raise exception 'The central attendance record conflicts with the offline time values.' using errcode = '40001';
    end if;
    if v_record.time_out is null and p_time_out is not null then
      update public.attendance_records set time_out = p_time_out,
        checkout_verification_method = p_checkout_identification_method,
        attendance_status = 'absent',
        finalized_at = case when v_session.session_status = 'completed'
          and (v_session.actual_end is null or v_session.actual_end + interval '24 hours' <= now()) then now() else null end,
        recorded_by = v_actor, updated_at = now()
      where id = v_record.id returning * into v_record;
    end if;
    perform public.expire_overdue_feedback_tasks();
    return v_record;
  end if;
  select * into v_record from public.attendance_records where event_session_id = p_session_id and student_id = p_student_id for update;
  if found and v_record.time_in is not null and v_record.time_in is distinct from p_time_in then
    raise exception 'The central attendance record conflicts with the offline Time In.' using errcode = '40001';
  elsif found then
    update public.attendance_records set local_attendance_uuid = p_local_attendance_uuid,
      attendance_status = 'absent', finalized_at = case when v_session.session_status = 'completed'
        and (coalesce(time_out, p_time_out) is null or v_session.actual_end is null or v_session.actual_end + interval '24 hours' <= now()) then now() else null end,
      verification_method = p_identification_method,
      time_in = p_time_in, time_out = coalesce(time_out, p_time_out),
      checkout_verification_method = coalesce(checkout_verification_method, p_checkout_identification_method),
      recorded_at = p_time_in, recorded_by = v_actor, updated_at = now()
    where id = v_record.id returning * into v_record;
  else
    insert into public.attendance_records(local_attendance_uuid,event_session_id,student_id,attendance_status,verification_method,
      time_in,time_out,checkout_verification_method,recorded_at,recorded_by,remarks,finalized_at)
    values (p_local_attendance_uuid,p_session_id,p_student_id,'absent',p_identification_method,p_time_in,p_time_out,
      p_checkout_identification_method,p_time_in,v_actor,nullif(btrim(coalesce(p_remarks,'')),''),
      case when v_session.session_status = 'completed'
        and (p_time_out is null or v_session.actual_end is null or v_session.actual_end + interval '24 hours' <= now()) then now() else null end)
    returning * into v_record;
  end if;
  perform public.expire_overdue_feedback_tasks();
  return v_record;
end;
$$;
revoke all on function public.sync_offline_event_attendance(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,text) from public, anon;
grant execute on function public.sync_offline_event_attendance(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,text) to authenticated;

-- Student dashboard totals include final outcomes only. Pending feedback stays
-- actionable but cannot inflate attendance/absence counts or the rate.
create or replace function public.get_student_dashboard_summary()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with current_student as (select private.current_student_id() as id),
  record_counts as (
    select count(*)::integer as total_count,
      count(*) filter (where ar.attendance_status = 'present')::integer as present_count,
      count(*) filter (where ar.attendance_status = 'late')::integer as late_count,
      count(*) filter (where ar.attendance_status = 'absent')::integer as absent_count
    from public.attendance_records ar join current_student s on s.id = ar.student_id
    where ar.finalized_at is not null
  ),
  actionable_tasks as (
    select 'feedback'::text as kind, task.id, task.attendance_record_id, task.event_id,
      event.title, event.event_code, category.category_name,
      case when ar.time_in > session.late_cutoff_at then 'late' else 'present' end as attendance_status,
      session.scheduled_start, task.due_at
    from public.event_feedback_tasks task
    join current_student s on s.id = task.student_id
    join public.attendance_records ar on ar.id = task.attendance_record_id
    join public.event_sessions session on session.id = ar.event_session_id
    join public.events event on event.id = task.event_id
    join public.event_categories category on category.id = event.category_id
    where task.task_status = 'pending' and task.due_at > now()
      and ar.time_in is not null and ar.time_out is not null and ar.finalized_at is null
      and (session.late_cutoff_at is null or ar.time_in <= session.late_cutoff_at
        or (ar.late_reason_option_id is not null and ar.late_reason_submitted_at > ar.time_out))
    union all
    select 'late_reason'::text as kind, ar.id, ar.id, session.event_id,
      event.title, event.event_code, category.category_name, 'late'::text as attendance_status,
      session.scheduled_start, coalesce(task.due_at, coalesce(session.actual_end, session.scheduled_end) + interval '24 hours') as due_at
    from public.attendance_records ar
    join current_student s on s.id = ar.student_id
    join public.event_sessions session on session.id = ar.event_session_id
    join public.events event on event.id = session.event_id
    join public.event_categories category on category.id = event.category_id
    left join public.event_feedback_tasks task on task.attendance_record_id = ar.id
    where ar.time_in is not null and ar.time_out is not null and ar.finalized_at is null
      and session.late_cutoff_at is not null and ar.time_in > session.late_cutoff_at
      and (ar.late_reason_option_id is null or ar.late_reason_submitted_at <= ar.time_out)
      and (session.session_status <> 'completed' or (session.actual_end is not null and session.actual_end + interval '24 hours' > now()))
      and (task.id is null or (task.task_status = 'pending' and task.due_at > now()))
  ),
  rejected_corrections as (
    select request.id, request.attendance_record_id, session.event_id, request.request_status
    from public.attendance_requests request join current_student s on s.id = request.student_id
    join public.attendance_records ar on ar.id = request.attendance_record_id
    left join public.event_sessions session on session.id = ar.event_session_id
    where request.request_status = 'rejected'
  ),
  task_json as (
    select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'attendanceRecordId', attendance_record_id,
      'eventId', event_id, 'title', title, 'code', event_code, 'category', category_name,
      'status', attendance_status, 'startsAt', scheduled_start, 'dueAt', due_at) order by due_at asc) as items
    from actionable_tasks
  ),
  correction_json as (
    select jsonb_agg(jsonb_build_object('id', id, 'kind', 'correction', 'attendanceRecordId', attendance_record_id,
      'eventId', event_id, 'title', 'Rejected correction request', 'status', request_status)) as items
    from rejected_corrections
  )
  select jsonb_build_object(
    'totalCount', rc.total_count, 'presentCount', rc.present_count, 'lateCount', rc.late_count,
    'absentCount', rc.absent_count, 'attendedCount', rc.present_count + rc.late_count,
    'attendanceRate', case when rc.total_count = 0 then 0 else round(((rc.present_count + rc.late_count)::numeric / rc.total_count) * 100)::integer end,
    'lateReasonTaskCount', (select count(*)::integer from actionable_tasks where kind = 'late_reason'),
    'feedbackTaskCount', (select count(*)::integer from actionable_tasks where kind = 'feedback'),
    'rejectedCorrectionCount', (select count(*)::integer from rejected_corrections),
    'pendingTaskCount', (select count(*)::integer from actionable_tasks) + (select count(*)::integer from rejected_corrections),
    'tasks', coalesce((select items from task_json), '[]'::jsonb) || coalesce((select items from correction_json), '[]'::jsonb)
  ) from record_counts rc;
$$;
revoke all on function public.get_student_dashboard_summary() from public, anon;
grant execute on function public.get_student_dashboard_summary() to authenticated;

commit;
