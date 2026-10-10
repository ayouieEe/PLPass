-- Provision the QR credential when the student record is created so every
-- account-creation path has the same behavior as the student workspace.
begin;

create or replace function private.issue_initial_student_qr_credential()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential_id uuid;
begin
  -- Keep this idempotent for retries or imports that already provisioned QR.
  if exists (
    select 1
    from public.qr_credentials
    where student_id = new.id
  ) then
    return new;
  end if;

  insert into public.qr_credentials (student_id, token_hash, credential_status, issued_at, expires_at)
  values (
    new.id,
    encode(extensions.digest(gen_random_uuid()::text || new.id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'activated',
    now(),
    now() + interval '1 year'
  )
  returning id into v_credential_id;

  insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
  values (
    null,
    'credential.qr_issued',
    'qr_credential',
    v_credential_id,
    jsonb_build_object('student_id', new.id, 'source', 'student_account_creation')
  );

  return new;
end;
$$;

revoke all on function private.issue_initial_student_qr_credential() from public, anon, authenticated;

drop trigger if exists issue_initial_student_qr_credential on public.students;
create trigger issue_initial_student_qr_credential
  after insert on public.students
  for each row
  execute function private.issue_initial_student_qr_credential();

-- Repair active accounts created before this migration without replacing any
-- existing credential or changing inactive, dropped, or archived accounts.
with inserted_credentials as (
  insert into public.qr_credentials (student_id, token_hash, credential_status, issued_at, expires_at)
  select
    s.id,
    encode(extensions.digest(gen_random_uuid()::text || s.id::text || clock_timestamp()::text, 'sha256'), 'hex'),
    'activated',
    now(),
    now() + interval '1 year'
  from public.students s
  join public.profiles p on p.id = s.profile_id
  where p.role = 'student'
    and p.account_status = 'active'
    and s.student_status in ('enrolled', 'loa')
    and not exists (
      select 1
      from public.qr_credentials q
      where q.student_id = s.id
    )
  returning id, student_id
)
insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
select
  null,
  'credential.qr_issued',
  'qr_credential',
  id,
  jsonb_build_object('student_id', student_id, 'source', 'qr_credential_backfill')
from inserted_credentials;

commit;
