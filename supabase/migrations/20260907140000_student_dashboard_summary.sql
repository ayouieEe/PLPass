begin;

create index if not exists attendance_records_student_status_idx on public.attendance_records(student_id, attendance_status);
create index if not exists attendance_requests_student_status_idx on public.attendance_requests(student_id, request_status);

create or replace function public.get_student_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with current_student as (
    select private.current_student_id() as id
  ), record_counts as (
    select
      count(*)::integer as total_count,
      count(*) filter (where ar.attendance_status = 'present')::integer as present_count,
      count(*) filter (where ar.attendance_status = 'late')::integer as late_count,
      count(*) filter (where ar.attendance_status = 'absent')::integer as absent_count,
      count(*) filter (where ar.attendance_status = 'excused')::integer as excused_count
    from public.attendance_records ar
    join current_student s on s.id = ar.student_id
  ), actionable_tasks as (
    select
      case when ar.attendance_status = 'late' and ar.late_reason is null then 'late_reason' else 'feedback' end as kind,
      task.id,
      task.attendance_record_id,
      task.event_id,
      event.title,
      event.event_code,
      category.category_name,
      ar.attendance_status,
      session.scheduled_start,
      task.due_at
    from public.event_feedback_tasks task
    join current_student s on s.id = task.student_id
    join public.attendance_records ar on ar.id = task.attendance_record_id
    join public.event_sessions session on session.id = ar.event_session_id
    join public.events event on event.id = task.event_id
    join public.event_categories category on category.id = event.category_id
    where task.task_status = 'pending'
      and task.due_at > now()
      and (ar.attendance_status = 'present' or (ar.attendance_status = 'late' and ar.late_reason is not null) or (ar.attendance_status = 'late' and ar.late_reason is null))
  ), rejected_corrections as (
    select request.id, request.attendance_record_id, session.event_id, request.request_status
    from public.attendance_requests request
    join current_student s on s.id = request.student_id
    join public.attendance_records ar on ar.id = request.attendance_record_id
    left join public.event_sessions session on session.id = ar.event_session_id
    where request.request_status = 'rejected'
  ), task_json as (
    select jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'attendanceRecordId', attendance_record_id, 'eventId', event_id,
      'title', title, 'code', event_code, 'category', category_name, 'status', attendance_status,
      'startsAt', scheduled_start, 'dueAt', due_at
    ) order by due_at asc) as items
    from actionable_tasks
  ), correction_json as (
    select jsonb_agg(jsonb_build_object(
      'id', id, 'kind', 'correction', 'attendanceRecordId', attendance_record_id, 'eventId', event_id,
      'title', 'Rejected correction request', 'status', request_status
    )) as items
    from rejected_corrections
  )
  select jsonb_build_object(
    'totalCount', rc.total_count,
    'presentCount', rc.present_count,
    'lateCount', rc.late_count,
    'absentCount', rc.absent_count,
    'excusedCount', rc.excused_count,
    'attendedCount', rc.present_count + rc.late_count,
    'attendanceRate', case when rc.total_count = 0 then 0 else round(((rc.present_count + rc.late_count)::numeric / rc.total_count) * 100)::integer end,
    'lateReasonTaskCount', (select count(*)::integer from actionable_tasks where kind = 'late_reason'),
    'feedbackTaskCount', (select count(*)::integer from actionable_tasks where kind = 'feedback'),
    'rejectedCorrectionCount', (select count(*)::integer from rejected_corrections),
    'pendingTaskCount', (select count(*)::integer from actionable_tasks) + (select count(*)::integer from rejected_corrections),
    'tasks', coalesce((select items from task_json), '[]'::jsonb) || coalesce((select items from correction_json), '[]'::jsonb)
  )
  from record_counts rc;
$$;

revoke all on function public.get_student_dashboard_summary() from public, anon;
grant execute on function public.get_student_dashboard_summary() to authenticated;

commit;
