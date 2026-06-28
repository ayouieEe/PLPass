-- Phase 9.1 review migration: attendance integrity constraints and indexes.
-- Do not apply until existing duplicate/null data has been checked.

create unique index if not exists attendance_records_one_per_student_class_session
  on public.attendance_records (student_id, class_session_id)
  where class_session_id is not null;

create unique index if not exists attendance_records_one_per_student_event_session
  on public.attendance_records (student_id, event_session_id)
  where event_session_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attendance_records_exactly_one_session'
      and conrelid = 'public.attendance_records'::regclass
  ) then
    alter table public.attendance_records
      add constraint attendance_records_exactly_one_session
      check (
        (
          attendance_type = 'class'
          and class_session_id is not null
          and event_session_id is null
        )
        or
        (
          attendance_type = 'event'
          and event_session_id is not null
          and class_session_id is null
        )
      ) not valid;
  end if;
end $$;

create unique index if not exists class_enrollments_one_student_per_class
  on public.class_enrollments (class_id, student_id);

create unique index if not exists event_participants_one_student_per_event
  on public.event_participants (event_id, student_id);

create index if not exists attendance_records_student_id_idx
  on public.attendance_records (student_id);

create index if not exists attendance_records_class_session_id_idx
  on public.attendance_records (class_session_id);

create index if not exists attendance_records_event_session_id_idx
  on public.attendance_records (event_session_id);
