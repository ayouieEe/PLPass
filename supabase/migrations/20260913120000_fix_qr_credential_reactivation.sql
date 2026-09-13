create or replace function public.set_student_credential_status(
  p_student_id uuid,
  p_credential_type text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;
  if p_credential_type not in ('qr', 'facial') or p_status not in ('activated', 'inactive', 'blocked') then
    raise exception 'Invalid credential status operation.' using errcode = '22023';
  end if;

  if p_credential_type = 'qr' then
    update public.qr_credentials
    set credential_status = p_status,
        revoked_at = case when p_status = 'activated' then null else now() end,
        updated_at = now()
    where id = (
      select id
      from public.qr_credentials
      where student_id = p_student_id
      order by issued_at desc, created_at desc
      limit 1
    );
  else
    update public.facial_profiles
    set facial_status = p_status, updated_at = now()
    where student_id = p_student_id;
  end if;

  if not found then
    raise exception 'Credential was not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'credential.status_changed', p_credential_type || '_credential', p_student_id,
    jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.set_student_credential_status(uuid, text, text) from public, anon;
grant execute on function public.set_student_credential_status(uuid, text, text) to authenticated;
