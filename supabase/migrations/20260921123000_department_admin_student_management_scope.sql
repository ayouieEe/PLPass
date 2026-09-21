begin;

-- Department administrators may read only students, profiles, programs, and
-- sections belonging to their assigned department. The Edge Function remains
-- the mutation boundary; these policies protect direct Data API access.
drop policy if exists profiles_read_department_admin_students on public.profiles;
create policy profiles_read_department_admin_students on public.profiles
for select to authenticated
using (
  (select private.is_active_department_admin())
  and exists (
    select 1 from public.students s
    where s.profile_id = profiles.id
      and s.department_id = (select private.current_department_id())
  )
);

drop policy if exists programs_read_department_admin on public.programs;
create policy programs_read_department_admin on public.programs
for select to authenticated
using (
  (select private.is_active_department_admin())
  and department_id = (select private.current_department_id())
);

drop policy if exists sections_read_department_admin on public.sections;
create policy sections_read_department_admin on public.sections
for select to authenticated
using (
  (select private.is_active_department_admin())
  and exists (
    select 1 from public.programs p
    where p.id = sections.program_id
      and p.department_id = (select private.current_department_id())
  )
);

-- Keep the existing student policy and make the department scope explicit in
-- the policy definition used by Current.
drop policy if exists students_read on public.students;
create policy students_read on public.students
for select to authenticated
using (
  profile_id = (select auth.uid())
  or (select private.is_active_organizer())
  or ((select private.is_active_department_admin()) and department_id = (select private.current_department_id()))
);

create or replace function public.admin_revoke_user_sessions(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked_count integer := 0;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_actor_user_id is null or p_target_user_id is null then
    raise exception 'An actor and target user are required.' using errcode = '22023';
  end if;
  if p_actor_user_id = p_target_user_id then
    raise exception 'Administrators cannot revoke their own sessions.' using errcode = '42501';
  end if;
  if v_reason = '' then
    raise exception 'A reason is required to revoke user sessions.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.admin_profiles ap
    join public.profiles actor on actor.id = ap.profile_id
    where ap.profile_id = p_actor_user_id
      and actor.account_status = 'active'
      and (
        actor.role = 'admin'
        or (
          actor.role = 'department_admin'
          and (
            exists (select 1 from public.organizers o where o.profile_id = p_target_user_id and o.department_id = ap.department_id)
            or exists (select 1 from public.students s where s.profile_id = p_target_user_id and s.department_id = ap.department_id)
          )
        )
      )
  ) then
    raise exception 'The administrator is not authorized for this target.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_target_user_id) then
    raise exception 'The target user was not found.' using errcode = 'P0002';
  end if;
  delete from auth.sessions where user_id = p_target_user_id;
  get diagnostics v_revoked_count = row_count;
  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (p_actor_user_id, 'user.sessions_revoked', 'user', p_target_user_id,
    jsonb_build_object('reason', v_reason, 'revoked_session_count', v_revoked_count));
  return v_revoked_count;
end;
$$;

revoke all on function public.admin_revoke_user_sessions(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid, uuid, text) to service_role;

commit;
