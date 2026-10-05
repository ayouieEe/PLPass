begin;

-- Attendance exceptions are no longer a student notification category. Keep
-- historical rows recoverable but prevent them from remaining actionable.
update public.notifications n
set notification_status = 'archived', read_at = coalesce(read_at, now())
from public.profiles p
where p.id = n.recipient_id
  and p.role = 'student'
  and n.notification_code like 'attendance.exception%'
  and n.notification_status <> 'archived';

update public.notification_preferences
set preferences = preferences - 'attendanceExceptions', updated_at = now()
where preferences ? 'attendanceExceptions';

-- Trusted writers may still attempt to emit a legacy exception code. Suppress
-- only the student audience while preserving organizer/admin workflows.
create or replace function private.suppress_student_attendance_exception()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.notification_code like 'attendance.exception%'
    and exists (
      select 1 from public.profiles
      where id = new.recipient_id and role = 'student'
    ) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.suppress_student_attendance_exception() from public, anon, authenticated;

drop trigger if exists suppress_student_attendance_exception on public.notifications;
create trigger suppress_student_attendance_exception
before insert on public.notifications
for each row execute function private.suppress_student_attendance_exception();

commit;
