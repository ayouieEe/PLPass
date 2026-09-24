-- Department administrators may record their own report exports. This does
-- not broaden what they can read: audit-log RLS continues to enforce the
-- department-local actor scope.
create or replace function public.log_client_action(
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_privileged boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = v_uid
      and role in ('admin', 'department_admin', 'organizer')
      and account_status = 'active'
  ) into v_is_privileged;

  if not v_is_privileged then
    raise exception 'Unauthorized: Only active administrators or organizers can manually log actions.' using errcode = '42501';
  end if;

  if p_action is null or btrim(p_action) = '' or length(p_action) > 120 then
    raise exception 'A valid action of at most 120 characters is required.' using errcode = '22023';
  end if;
  if p_target_type is null or btrim(p_target_type) = '' or length(p_target_type) > 80 then
    raise exception 'A valid target type of at most 80 characters is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 16384 then
    raise exception 'Audit metadata must be an object no larger than 16 KiB.' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_uid, btrim(p_action), btrim(p_target_type), p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.log_client_action(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_client_action(text, text, uuid, jsonb) to authenticated;
