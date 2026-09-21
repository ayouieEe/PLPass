begin;

-- Older policies used is_active_user(), which includes department admins and
-- therefore combined with the new scoped policies to expose every catalog row.
-- Keep full catalog reads for university admins/organizers, while leaving
-- department admins to the department-scoped policies.
drop policy if exists programs_read on public.programs;
drop policy if exists programs_settings_read on public.programs;
create policy programs_read on public.programs
for select to authenticated
using (
  (select private.is_active_user())
  and not (select private.is_active_department_admin())
);

drop policy if exists sections_read on public.sections;
drop policy if exists sections_settings_read on public.sections;
create policy sections_read on public.sections
for select to authenticated
using (
  (select private.is_active_user())
  and not (select private.is_active_department_admin())
);

commit;
