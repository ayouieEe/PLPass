-- Run only after the empty package for STG-TERMINAL-CONFLICT has been refreshed
-- in the desktop app. This makes a central record that conflicts with the
-- controlled local UUID generated only by the explicit test build.
with target as (
  select es.id as session_id, st.id as student_id, ou.id as organizer_id
  from public.events e
  join public.event_sessions es on es.event_id=e.id
  cross join public.students st
  cross join public.profiles ou
  where e.event_code='STG-TERMINAL-CONFLICT'
    and st.student_id='STG-TC-1'
    and ou.email='plpass-terminal-conflict-organizer@staging.invalid'
)
insert into public.attendance_records(local_attendance_uuid,event_session_id,student_id,attendance_status,verification_method,time_in,recorded_at,recorded_by)
select '22222222-2222-4222-8222-222222222222'::uuid, target.session_id, target.student_id, 'present', 'manual', now(), now(), target.organizer_id
from target
where not exists (
  select 1 from public.attendance_records ar
  where ar.event_session_id=target.session_id and ar.student_id=target.student_id
);
