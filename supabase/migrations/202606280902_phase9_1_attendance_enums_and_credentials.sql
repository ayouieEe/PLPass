-- Phase 9.1 review migration: additive attendance and credential enum/column support.
-- Do not apply until reviewed. No existing enum values or records are removed.
-- Generated database.types.ts confirms both attendance_records.verification_method
-- and attendance_logs.method use public.verification_method.

alter type public.verification_method add value if not exists 'manual';
alter type public.verification_method add value if not exists 'online';

alter type public.nfc_status add value if not exists 'lost';
alter type public.nfc_status add value if not exists 'blocked';

alter table public.nfc_credentials
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz,
  add column if not exists last_successful_check_in_at timestamptz;

create index if not exists nfc_credentials_issued_by_idx
  on public.nfc_credentials (issued_by);

create index if not exists nfc_credentials_student_status_idx
  on public.nfc_credentials (student_id, nfc_status);

create unique index if not exists nfc_credentials_one_active_per_student
  on public.nfc_credentials (student_id)
  where nfc_status = 'activated';

comment on column public.nfc_credentials.hash_token is
  'Sensitive NFC hash. Do not expose through browser reads or broad RLS policies.';
