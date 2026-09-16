begin;

create or replace function private.sync_qr_credential_last_used()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr_credential_id uuid;
begin
  if not (
    (tg_op = 'INSERT' and new.verification_method = 'qr')
    or (tg_op = 'UPDATE' and new.time_out is distinct from old.time_out and (
      new.verification_method = 'qr' or new.checkout_verification_method = 'qr'
    ))
  ) then
    return new;
  end if;

  select va.qr_credential_id
    into v_qr_credential_id
  from public.verification_attempts va
  where va.id = new.verification_attempt_id
    and va.accepted = true
    and va.qr_credential_id is not null
  limit 1;

  update public.qr_credentials qc
  set last_successful_check_in_at = coalesce(new.time_out, new.time_in),
      updated_at = now()
  where qc.id = coalesce(
    v_qr_credential_id,
    (
      select candidate.id
      from public.qr_credentials candidate
      where candidate.student_id = new.student_id
        and candidate.credential_status = 'activated'
        and (candidate.expires_at is null or candidate.expires_at > coalesce(new.time_out, new.time_in))
      order by candidate.issued_at desc
      limit 1
    )
  );

  return new;
end;
$$;

revoke all on function private.sync_qr_credential_last_used() from public, anon, authenticated, service_role;

drop trigger if exists attendance_records_sync_qr_last_used on public.attendance_records;
create trigger attendance_records_sync_qr_last_used
after insert or update of time_out on public.attendance_records
for each row execute function private.sync_qr_credential_last_used();

commit;
