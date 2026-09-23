begin;

-- Keep the existing organizer and department-admin scope, while allowing the
-- institution-wide admin Event Records view to read the same durable walk-in
-- rows. This is read-only access; no walk-in data is changed.
drop policy if exists unverified_walkin_attendance_read on public.unverified_walkin_attendance;

create policy unverified_walkin_attendance_read on public.unverified_walkin_attendance
for select to authenticated using (
  (select private.is_active_admin())
  or exists (
    select 1 from public.events e
    where e.id = unverified_walkin_attendance.event_id
      and (
        e.organizer_id = (select private.current_organizer_id())
        or ((select private.is_active_department_admin()) and e.department_id = (select private.current_department_id()))
      )
  )
);

commit;
