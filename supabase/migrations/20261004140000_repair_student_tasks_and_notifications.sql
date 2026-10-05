begin;

-- Keep the dashboard task list consistent with the task rows shown in Event
-- Records. A pending feedback task is actionable unless the same attendance
-- record still has an unsubmitted late reason.
create or replace function public.get_student_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with current_student as (select private.current_student_id() as id),
  record_counts as (
    select count(*)::integer as total_count,
      count(*) filter (where ar.attendance_status = 'present')::integer as present_count,
      count(*) filter (where ar.attendance_status = 'late')::integer as late_count,
      count(*) filter (where ar.attendance_status = 'absent')::integer as absent_count
    from public.attendance_records ar
    join current_student s on s.id = ar.student_id
    where ar.finalized_at is not null
  ),
  actionable_tasks as (
    select 'feedback'::text as kind, task.id, task.attendance_record_id, task.event_id,
      event.title, event.event_code, category.category_name,
      case when session.late_cutoff_at is not null and ar.time_in > session.late_cutoff_at then 'late' else 'present' end,
      session.scheduled_start, task.due_at
    from public.event_feedback_tasks task
    join current_student s on s.id = task.student_id
    join public.attendance_records ar on ar.id = task.attendance_record_id
    join public.event_sessions session on session.id = ar.event_session_id
    join public.events event on event.id = task.event_id
    join public.event_categories category on category.id = event.category_id
    where task.task_status = 'pending'
      and task.due_at > now()
      and ar.time_in is not null
      and ar.time_out is not null
      and ar.finalized_at is null
      and not (
        session.late_cutoff_at is not null
        and ar.time_in > session.late_cutoff_at
        and (ar.late_reason_option_id is null or ar.late_reason_submitted_at <= ar.time_out)
      )
    union all
    select 'late_reason'::text, ar.id, ar.id, session.event_id,
      event.title, event.event_code, category.category_name, 'late'::text,
      session.scheduled_start,
      coalesce(task.due_at, coalesce(session.actual_end, session.scheduled_end) + interval '24 hours')
    from public.attendance_records ar
    join current_student s on s.id = ar.student_id
    join public.event_sessions session on session.id = ar.event_session_id
    join public.events event on event.id = session.event_id
    join public.event_categories category on category.id = event.category_id
    left join public.event_feedback_tasks task on task.attendance_record_id = ar.id
    where ar.time_in is not null
      and ar.time_out is not null
      and ar.finalized_at is null
      and session.session_status <> 'cancelled'
      and session.late_cutoff_at is not null
      and ar.time_in > session.late_cutoff_at
      and (ar.late_reason_option_id is null or ar.late_reason_submitted_at <= ar.time_out)
      and (session.session_status <> 'completed' or (session.actual_end is not null and session.actual_end + interval '24 hours' > now()))
      and (task.id is null or (task.task_status = 'pending' and task.due_at > now()))
  ),
  rejected_corrections as (
    select count(*)::integer as count
    from public.attendance_requests request
    join current_student s on s.id = request.student_id
    where request.request_status = 'rejected'
  ),
  task_json as (
    select jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'attendanceRecordId', attendance_record_id,
      'eventId', event_id, 'title', title, 'code', event_code,
      'category', category_name, 'status', case when kind = 'late_reason' then 'late' else 'pending' end,
      'startsAt', scheduled_start, 'dueAt', due_at
    ) order by due_at asc) as items
    from actionable_tasks
  )
  select jsonb_build_object(
    'totalCount', rc.total_count,
    'presentCount', rc.present_count,
    'lateCount', rc.late_count,
    'absentCount', rc.absent_count,
    'attendedCount', rc.present_count + rc.late_count,
    'attendanceRate', case when rc.total_count = 0 then 0 else round(((rc.present_count + rc.late_count)::numeric / rc.total_count) * 100)::integer end,
    'lateReasonTaskCount', (select count(*)::integer from actionable_tasks where kind = 'late_reason'),
    'feedbackTaskCount', (select count(*)::integer from actionable_tasks where kind = 'feedback'),
    'rejectedCorrectionCount', (select count from rejected_corrections),
    'pendingTaskCount', (select count(*)::integer from actionable_tasks),
    'tasks', coalesce((select items from task_json), '[]'::jsonb)
  ) from record_counts rc;
$$;

revoke all on function public.get_student_dashboard_summary() from public, anon;
grant execute on function public.get_student_dashboard_summary() to authenticated;

-- The notification triggers write these rows directly (rather than through
-- the role helper) because they are created as part of trusted attendance
-- workflows. Make both the server and browser policies recognize those codes.
create or replace function private.notify_feedback_task_created()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_profile_id uuid;
  v_title text;
begin
  select s.profile_id, e.title into v_profile_id, v_title
  from public.students s
  join public.events e on e.id = new.event_id
  where s.id = new.student_id;
  if v_profile_id is not null then
    insert into public.notifications (
      recipient_id, notification_type, title, message, notification_status,
      action_url, reference_id, notification_code, severity, requires_action,
      related_type, dedupe_key
    ) values (
      v_profile_id, 'attendance', 'Event feedback required',
      format('Complete the required feedback for %s before the deadline.', coalesce(v_title, 'your event')),
      'unread', '/student/events/' || new.event_id::text, new.event_id,
      'attendance.feedback_required', 'info', true, 'event_feedback_task', new.id,
      'feedback-task:' || new.id::text
    )
    on conflict (dedupe_key) where dedupe_key is not null do update
      set notification_status = 'unread', read_at = null, requires_action = true;
  end if;
  return new;
end;
$$;

create or replace function private.notify_attendance_finalization()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_profile_id uuid;
  v_event_id uuid;
  v_title text;
begin
  if new.attendance_status not in ('present', 'late', 'absent')
    or (new.attendance_status is not distinct from old.attendance_status and new.finalized_at is not distinct from old.finalized_at) then
    return new;
  end if;
  select s.profile_id, es.event_id, e.title into v_profile_id, v_event_id, v_title
  from public.students s
  join public.event_sessions es on es.id = new.event_session_id
  join public.events e on e.id = es.event_id
  where s.id = new.student_id;
  if v_profile_id is not null then
    insert into public.notifications (
      recipient_id, notification_type, title, message, notification_status,
      action_url, reference_id, notification_code, severity, requires_action,
      related_type, dedupe_key
    ) values (
      v_profile_id, 'attendance', 'Attendance finalized',
      format('%s attendance for %s.', initcap(new.attendance_status), coalesce(v_title, 'your event')),
      'unread', '/student/attendance', v_event_id, 'attendance.finalized',
      case when new.attendance_status = 'absent' then 'warning' else 'info' end,
      false, 'event', 'attendance-finalized:' || new.id::text || ':' || new.attendance_status || ':' || coalesce(new.finalized_at::text, new.updated_at::text)
    )
    on conflict (dedupe_key) where dedupe_key is not null do update
      set notification_status = 'unread', read_at = null;
  end if;
  return new;
end;
$$;

-- Classify older rows written before notification_code was explicit so the
-- existing history becomes visible without fabricating new notifications.
update public.notifications
set notification_code = case
  when lower(coalesce(title, '') || ' ' || coalesce(message, '')) like '%feedback required%' then 'attendance.feedback_required'
  when lower(coalesce(title, '') || ' ' || coalesce(message, '')) like '%attendance finalized%' then 'attendance.finalized'
  else notification_code
end
where notification_type = 'attendance'
  and (notification_code is null or notification_code in ('legacy.attendance', 'attendance.updated'));

commit;
