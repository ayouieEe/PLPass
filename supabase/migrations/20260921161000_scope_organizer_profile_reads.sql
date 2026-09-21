-- Limit direct organizer table reads and provide the existing cross-department
-- invitation flow a minimal, explicitly authorized student directory projection.
-- No rows or credentials are changed by this migration.
begin;

create or replace function public.organizer_list_invitation_students(
  p_limit integer default 20,
  p_offset integer default 0,
  p_student_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 1000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not (select private.is_active_organizer()) then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  with eligible as (
    select
      s.id,
      s.profile_id,
      s.student_id,
      s.program_id,
      s.department_id,
      s.section_id,
      s.year_level,
      s.student_status,
      s.created_at,
      jsonb_build_object(
        'first_name', p.first_name,
        'middle_name', p.middle_name,
        'last_name', p.last_name,
        'name_extension', p.name_extension,
        'email', p.email,
        'account_status', p.account_status
      ) as profiles,
      jsonb_build_object(
        'section_name', sec.section_name,
        'year_level', sec.year_level
      ) as sections,
      jsonb_build_object(
        'program_code', prog.program_code,
        'program_name', prog.program_name
      ) as programs
    from public.students s
    join public.profiles p on p.id = s.profile_id and p.role = 'student'
    left join public.sections sec on sec.id = s.section_id
    left join public.programs prog on prog.id = s.program_id
    where p_student_ids is null or s.id = any (p_student_ids)
  ),
  page_rows as (
    select * from eligible
    order by student_id, id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from eligible),
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.organizer_list_invitation_students(integer, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.organizer_list_invitation_students(integer, integer, uuid[]) to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
for select to authenticated
using (
  (
    id = (select auth.uid())
    and (select private.is_active_user())
  )
  or (select private.is_active_admin())
  or exists (
    select 1
    from public.students s
    where s.profile_id = profiles.id
      and (select private.organizer_can_access_student(s.id))
  )
);

drop policy if exists organizers_read on public.organizers;
create policy organizers_read on public.organizers
for select to authenticated
using (
  (
    profile_id = (select auth.uid())
    and (select private.is_active_user())
  )
  or (select private.is_active_admin())
  or (
    (select private.is_active_department_admin())
    and department_id = (select private.current_department_id())
  )
);

-- An inactive account may still hold an unexpired JWT. Do not let that token
-- read its own student row; the admin read policy and department-admin scope
-- remain separate, additive policies.
drop policy if exists students_read on public.students;
create policy students_read on public.students
for select to authenticated
using (
  (
    profile_id = (select auth.uid())
    and (select private.is_active_user())
  )
  or (select private.organizer_can_access_student(id))
  or (
    (select private.is_active_department_admin())
    and department_id = (select private.current_department_id())
  )
);

commit;
