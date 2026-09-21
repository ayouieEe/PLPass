-- Department admins may review credential status for students in their own
-- department. This is intentionally read-only; credential mutations remain
-- restricted to the existing organizer/admin RPC paths.

drop policy if exists department_admin_read_qr_credentials on public.qr_credentials;
create policy department_admin_read_qr_credentials
on public.qr_credentials
for select to authenticated
using (
  (select private.is_active_department_admin())
  and exists (
    select 1
    from public.students student
    where student.id = qr_credentials.student_id
      and student.department_id = (select private.current_department_id())
  )
);

drop policy if exists department_admin_read_facial_profiles on public.facial_profiles;
create policy department_admin_read_facial_profiles
on public.facial_profiles
for select to authenticated
using (
  (select private.is_active_department_admin())
  and exists (
    select 1
    from public.students student
    where student.id = facial_profiles.student_id
      and student.department_id = (select private.current_department_id())
  )
);
