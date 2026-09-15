-- Students may generate or regenerate only their own QR credential.
-- The function deliberately derives the student from auth.uid() instead of
-- trusting a client-supplied student id.
create or replace function public.generate_student_qr_credential()
returns public.qr_credentials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := private.current_student_id();
  v_credential public.qr_credentials;
begin
  if auth.uid() is null or v_student_id is null then
    raise exception 'An authenticated student account is required.' using errcode = '42501';
  end if;

  update public.qr_credentials
  set credential_status = 'inactive', revoked_at = now(), updated_at = now()
  where student_id = v_student_id and credential_status = 'activated';

  insert into public.qr_credentials (
    student_id, token_hash, credential_status, issued_at, expires_at
  ) values (
    v_student_id,
    encode(extensions.digest(gen_random_uuid()::text || v_student_id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'activated', now(), now() + interval '1 year'
  ) returning * into v_credential;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'credential.qr_generated_by_student', 'qr_credential', v_credential.id,
    jsonb_build_object('student_id', v_student_id));

  return v_credential;
end;
$$;

revoke all on function public.generate_student_qr_credential() from public, anon;
grant execute on function public.generate_student_qr_credential() to authenticated;
