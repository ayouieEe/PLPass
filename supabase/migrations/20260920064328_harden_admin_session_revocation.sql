-- This migration is intentionally local and un-applied.  The manage-users Edge
-- Function is the only caller; browser roles receive no EXECUTE privilege.
begin;

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
      and p.role = 'admin'
      and p.account_status = 'active'
  ) then
    raise exception 'Only an active administrator can revoke user sessions.' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = p_target_user_id) then
    raise exception 'The target user was not found.' using errcode = 'P0002';
  end if;

  delete from auth.sessions where user_id = p_target_user_id;
  get diagnostics v_revoked_count = row_count;

  insert into public.audit_logs (
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_actor_user_id,
    'user.sessions_revoked',
    'user',
    p_target_user_id,
    jsonb_build_object(
      'reason', v_reason,
      'revoked_session_count', v_revoked_count
    )
  );

  return v_revoked_count;
end;
$$;

revoke all on function public.admin_revoke_user_sessions(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid, uuid, text) to service_role;

commit;
