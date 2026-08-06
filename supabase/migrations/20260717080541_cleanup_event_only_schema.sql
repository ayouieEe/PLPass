begin;
-- PLPass now manages event attendance only. Refuse to discard any legacy
-- classroom data silently; such data must be reviewed or exported first.
do $$
begin
  if exists (select 1 from public.attendance_records where class_session_id is not null)
    or exists (select 1 from public.verification_attempts where class_session_id is not null)
    or exists (select 1 from public.class_sessions)
    or exists (select 1 from public.class_enrollments)
    or exists (select 1 from public.class_schedules)
    or exists (select 1 from public.classes)
    or exists (select 1 from public.rooms)
    or exists (select 1 from public.subjects)
    or exists (select 1 from public.verification_devices)
    or exists (select 1 from public.system_settings)
  then
    raise exception using
      errcode = 'P0001',
      message = 'Legacy classroom data exists. Export or review it before applying the event-only cleanup migration.';
  end if;
end
$$;
-- Verification attempts now always belong to an event session and no longer
-- depend on managed scanner/camera inventory.
alter table public.verification_attempts
  drop constraint verification_attempts_one_session,
  drop column class_session_id,
  drop column device_id,
  alter column event_session_id set not null;
-- Attendance records now always belong to an event session.
alter table public.attendance_records
  drop constraint attendance_records_one_session,
  drop column class_session_id,
  alter column event_session_id set not null;
-- ML results may target a student, an event, or both, but never a class.
alter table public.ml_predictions
  drop constraint ml_predictions_scope_present,
  drop column class_id,
  add constraint ml_predictions_scope_present
    check (student_id is not null or event_id is not null);
-- Drop tables that only supported the previous classroom attendance plan.
drop table public.system_settings;
drop table public.verification_devices;
drop table public.class_sessions;
drop table public.class_enrollments;
drop table public.class_schedules;
drop table public.classes;
drop table public.rooms;
drop table public.subjects;
commit;
