begin;

create or replace function public.list_student_finalized_event_years()
returns table(event_year integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct extract(year from coalesce(session.scheduled_start, event.starts_at, record.recorded_at) at time zone 'Asia/Manila')::integer
  from public.attendance_records record
  join public.event_sessions session on session.id = record.event_session_id
  join public.events event on event.id = session.event_id
  left join public.event_feedback_tasks task on task.attendance_record_id = record.id
  where record.student_id = private.current_student_id()
    and (
      record.attendance_status in ('absent', 'excused')
      or (record.attendance_status in ('present', 'late') and task.task_status = 'completed')
    )
  order by 1 desc;
$$;

revoke all on function public.list_student_finalized_event_years() from public, anon;
grant execute on function public.list_student_finalized_event_years() to authenticated;

commit;
