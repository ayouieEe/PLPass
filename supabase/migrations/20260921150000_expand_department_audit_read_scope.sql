-- Extend department-admin audit visibility to activity performed by organizers
-- in the same department and to student/credential/attendance targets owned by
-- that department. RLS remains the authority; this policy grants read only.
begin;

drop policy if exists audit_logs_read_department_admin on public.audit_logs;
create policy audit_logs_read_department_admin on public.audit_logs
for select to authenticated
using (
  (select private.is_active_department_admin())
  and (
    -- Actions performed by an organizer assigned to this department.
    exists (
      select 1
      from public.organizers o
      where o.profile_id = audit_logs.actor_user_id
        and o.department_id = (select private.current_department_id())
    )
    -- Department branding and event-level actions.
    or (target_type = 'department' and target_id = (select private.current_department_id()))
    or (target_type = 'event' and exists (
      select 1 from public.events e
      where e.id = audit_logs.target_id
        and e.department_id = (select private.current_department_id())
    ))
    -- Both names have existed in client audit records; scope either to its event.
    or (target_type in ('event_session', 'attendance_session') and exists (
      select 1
      from public.event_sessions es
      join public.events e on e.id = es.event_id
      where es.id = audit_logs.target_id
        and e.department_id = (select private.current_department_id())
    ))
    or (target_type = 'attendance_record' and exists (
      select 1
      from public.attendance_records ar
      join public.event_sessions es on es.id = ar.event_session_id
      join public.events e on e.id = es.event_id
      where ar.id = audit_logs.target_id
        and e.department_id = (select private.current_department_id())
    ))
    or (target_type = 'event_participant' and exists (
      select 1
      from public.event_participants ep
      join public.events e on e.id = ep.event_id
      where ep.id = audit_logs.target_id
        and e.department_id = (select private.current_department_id())
    ))
    -- Student/account and credential actions are visible only for students in
    -- this department. target_id may identify the student or their profile.
    or (target_type in ('student', 'student_profile', 'student_account', 'user', 'qr_credential', 'facial_profile') and exists (
      select 1
      from public.students s
      where s.department_id = (select private.current_department_id())
        and (
          s.id = audit_logs.target_id
          or s.profile_id = audit_logs.target_id
          or exists (select 1 from public.qr_credentials q where q.student_id = s.id and q.id = audit_logs.target_id)
          or exists (select 1 from public.facial_profiles f where f.student_id = s.id and f.id = audit_logs.target_id)
        )
    ))
    -- Organizer account changes may target either the organizer row or profile.
    or (target_type in ('organizer', 'organizer_profile', 'user') and exists (
      select 1
      from public.organizers o
      where o.department_id = (select private.current_department_id())
        and (o.id = audit_logs.target_id or o.profile_id = audit_logs.target_id)
    ))
  )
);

commit;
