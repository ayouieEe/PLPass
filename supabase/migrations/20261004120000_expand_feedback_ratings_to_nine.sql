-- Keep the student-facing feedback scale and the authoritative database contract
-- aligned at 1 through 9.
alter table public.event_feedback_ratings
  drop constraint if exists event_feedback_ratings_value_valid;

alter table public.event_feedback_ratings
  add constraint event_feedback_ratings_value_valid check (rating between 1 and 9);

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
  if exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer) where rating.rating not between 1 and 9)
     or exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer) group by rating.objective_id having count(*) <> 1)
     or exists (select 1 from jsonb_to_recordset(p_ratings) as rating(objective_id uuid, rating integer)
       where not exists (select 1 from public.event_feedback_task_objectives assigned where assigned.task_id = v_task.id and assigned.objective_id = rating.objective_id)) then
    raise exception 'Feedback ratings must match every assigned objective and use values from 1 to 9.' using errcode = '22023';
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
