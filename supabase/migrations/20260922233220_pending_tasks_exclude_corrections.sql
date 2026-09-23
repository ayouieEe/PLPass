-- Pending Tasks are attendance-completion work only. Correction decisions
-- remain in Request History and must not inflate the task badge or list.
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
    select count(*)::integer as count
    from public.attendance_requests request
    join current_student s on s.id = request.student_id
    where request.request_status = 'rejected'
  ),
  task_json as (
    select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'attendanceRecordId', attendance_record_id,
      'eventId', event_id, 'title', title, 'code', event_code, 'category', category_name,
      'status', attendance_status, 'startsAt', scheduled_start, 'dueAt', due_at) order by due_at asc) as items
    from actionable_tasks
  )
  select jsonb_build_object(
    'totalCount', rc.total_count, 'presentCount', rc.present_count, 'lateCount', rc.late_count,
    'absentCount', rc.absent_count, 'attendedCount', rc.present_count + rc.late_count,
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
