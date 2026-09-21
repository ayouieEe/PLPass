-- Qualify the QR status column in the department-scoped issue RPC. Its
-- RETURNS TABLE output variable has the same name as the underlying column.
create or replace function public.department_admin_issue_qr_credential(
  p_student_id uuid,
  p_expires_at timestamptz default null
)
returns table (
  credential_id uuid,
  credential_status text,
  issued_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential_id uuid;
  v_credential_status text;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
begin
  if not (select private.is_active_department_admin())
    or not exists (
      select 1 from public.students s
      where s.id = p_student_id
        and s.department_id = (select private.current_department_id())
    ) then
    raise exception 'You can only reissue QR credentials for students in your department.' using errcode = '42501';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Credential expiry must be in the future.' using errcode = '22023';
  end if;

  update public.qr_credentials as q
  set credential_status = 'inactive', revoked_at = now(), updated_at = now()
  where q.student_id = p_student_id and q.credential_status = 'activated';

  insert into public.qr_credentials (student_id, token_hash, credential_status, issued_at, expires_at)
  values (
    p_student_id,
    encode(extensions.digest(gen_random_uuid()::text || p_student_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'activated', now(), coalesce(p_expires_at, now() + interval '1 year')
  )
  returning id, qr_credentials.credential_status, qr_credentials.issued_at, qr_credentials.expires_at
    into v_credential_id, v_credential_status, v_issued_at, v_expires_at;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'credential.qr_issued', 'qr_credential', v_credential_id,
    jsonb_build_object('student_id', p_student_id));

  credential_id := v_credential_id;
  credential_status := v_credential_status;
  issued_at := v_issued_at;
  expires_at := v_expires_at;
  return next;
end;
$$;
