-- Allow active department admins to view only organizers and profiles in their
-- own department. Mutation authorization remains in manage-users and is
-- repeated there with the service-role client.
begin;

drop policy if exists organizers_read on public.organizers;
create policy organizers_read on public.organizers
for select to authenticated
using (
  profile_id = (select auth.uid())
  or (select private.is_active_organizer())
  or (select private.is_active_admin())
  or (
    (select private.is_active_department_admin())
    and department_id = (select private.current_department_id())
  )
);

drop policy if exists profiles_read_department_admin on public.profiles;
create policy profiles_read_department_admin on public.profiles
for select to authenticated
using (
  (select private.is_active_department_admin())
  and exists (
    select 1
    from public.organizers o
    where o.profile_id = profiles.id
      and o.department_id = (select private.current_department_id())
  )
);

-- Keep the RPC aligned with the Edge Function scope. The Edge Function calls
-- this with service-role credentials, so the actor UUID is checked explicitly.
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
    join public.profiles p on p.id = ap.profile_id
    where ap.profile_id = p_actor_user_id
      and p.account_status = 'active'
      and (
        p.role = 'admin'
        or (
          p.role = 'department_admin'
          and exists (
            select 1
            from public.organizers target_o
            where target_o.profile_id = p_target_user_id
              and target_o.department_id = ap.department_id
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
