begin;

create or replace function public.admin_list_credential_statuses()
returns table (
  student_id uuid,
  qr_id uuid,
  qr_credential_status text,
  qr_issued_at timestamptz,
  qr_expires_at timestamptz,
  qr_revoked_at timestamptz,
  qr_last_successful_check_in_at timestamptz,
  qr_created_at timestamptz,
  qr_updated_at timestamptz,
  facial_id uuid,
  facial_status text,
  facial_enrolled_at timestamptz,
  facial_last_verified_at timestamptz,
  facial_consent_recorded_at timestamptz,
  facial_created_at timestamptz,
  facial_updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    ids.student_id,
    qr.id,
    qr.credential_status,
    qr.issued_at,
    qr.expires_at,
    qr.revoked_at,
    qr.last_successful_check_in_at,
    qr.created_at,
    qr.updated_at,
    facial.id,
    facial.facial_status,
    facial.enrolled_at,
    facial.last_verified_at,
    facial.consent_recorded_at,
    facial.created_at,
    facial.updated_at
  from (
    select student_id from public.qr_credentials
    union
    select student_id from public.facial_profiles
  ) ids
  left join lateral (
    select q.*
    from public.qr_credentials q
    where q.student_id = ids.student_id
    order by q.issued_at desc nulls last, q.created_at desc
    limit 1
  ) qr on true
  left join public.facial_profiles facial on facial.student_id = ids.student_id
  where (select private.is_active_admin());
$$;

revoke all on function public.admin_list_credential_statuses() from public, anon, authenticated;
grant execute on function public.admin_list_credential_statuses() to authenticated;

commit;
