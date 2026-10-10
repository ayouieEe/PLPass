-- Restore the shared QR status authorization that was narrowed accidentally
-- when the facial-only branch was removed. The existing helper preserves the
-- university-admin, department-admin, and authorized-organizer scopes.
begin;

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
  if not private.can_manage_student_credentials(p_student_id) then
    raise exception 'You can only manage credentials for an authorized student.' using errcode = '42501';
  end if;
  if p_credential_type is null
    or p_credential_type <> 'qr'
    or p_status is null
    or p_status not in ('activated', 'inactive', 'blocked') then
    raise exception 'Invalid QR credential status operation.' using errcode = '22023';
  end if;

  update public.qr_credentials
  set credential_status = p_status,
      revoked_at = case when p_status = 'activated' then null else now() end,
      updated_at = now()
  where id = (
    select q.id
    from public.qr_credentials q
    where q.student_id = p_student_id
    order by q.issued_at desc nulls last, q.created_at desc
    limit 1
  );

  if not found then
    raise exception 'QR credential was not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor,
    'credential.status_changed',
    'qr_credential',
    p_student_id,
    jsonb_build_object('status', p_status)
  );
end;
$$;

revoke all on function public.set_student_credential_status(uuid, text, text) from public, anon;
grant execute on function public.set_student_credential_status(uuid, text, text) to authenticated;

commit;
