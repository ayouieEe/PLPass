begin;

create or replace function public.admin_run_data_consistency_check()
returns table (
  id text,
  severity text,
  message text,
  reference_id text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;

  return query
    select 'event-without-organizer:' || e.id::text, 'critical', 'Event has no valid organizer record.', e.id::text, now()
    from public.events e left join public.organizers o on o.id = e.organizer_id where o.id is null;

  return query
    select 'session-without-event:' || s.id::text, 'critical', 'Attendance session has no valid event record.', s.id::text, now()
    from public.event_sessions s left join public.events e on e.id = s.event_id where e.id is null;

  return query
    select 'attendance-without-session:' || a.id::text, 'critical', 'Attendance record has no valid session record.', a.id::text, now()
    from public.attendance_records a
    left join public.event_sessions es on es.id = a.event_session_id
    where a.event_session_id is null or es.id is null;

  return query
    select 'organizer-without-profile:' || o.id::text, 'critical', 'Organizer has no valid profile record.', o.id::text, now()
    from public.organizers o left join public.profiles p on p.id = o.profile_id where p.id is null;

  return query
    select 'student-without-relationship:' || s.id::text, 'critical', 'Student is missing a profile or academic relationship.', s.id::text, now()
    from public.students s
    left join public.profiles p on p.id = s.profile_id
    left join public.programs pr on pr.id = s.program_id
    left join public.departments d on d.id = s.department_id
    left join public.sections sec on sec.id = s.section_id
    where p.id is null or pr.id is null or d.id is null or sec.id is null;

  return query
    select 'duplicate-attendance:' || a.event_session_id::text || ':' || a.student_id::text, 'critical', 'Duplicate attendance records were found for a session and student.', a.event_session_id::text, now()
    from public.attendance_records a
    where a.event_session_id is not null
    group by a.event_session_id, a.student_id
    having count(*) > 1;

  return query
    select 'event-state-mismatch:' || e.id::text, 'warning', 'Event is marked completed while an attendance session is still ongoing.', e.id::text, now()
    from public.events e
    where e.event_status = 'completed'
      and exists (select 1 from public.event_sessions s where s.event_id = e.id and s.session_status = 'ongoing');

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'system.data_consistency_check', 'system', null, jsonb_build_object('scope', 'operational_records'));
end;
$$;

revoke all on function public.admin_run_data_consistency_check() from public, anon;
grant execute on function public.admin_run_data_consistency_check() to authenticated;

commit;
