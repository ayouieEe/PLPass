begin;

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
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = v_uid
      and role = 'admin'
      and account_status = 'active'
  ) into v_is_admin;

  if not v_is_admin and not (select private.is_active_organizer()) then
    raise exception 'Unauthorized: Only active admins or organizers can manually log actions.' using errcode = '42501';
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

drop policy if exists audit_logs_read_organizer on public.audit_logs;
create policy audit_logs_read_admin_or_organizer on public.audit_logs for select to authenticated
  using (
    (select private.is_active_organizer())
    or exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
        and profiles.account_status = 'active'
    )
  );

commit;
