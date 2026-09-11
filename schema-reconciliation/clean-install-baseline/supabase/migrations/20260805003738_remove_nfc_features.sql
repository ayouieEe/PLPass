begin;

-- The linked PLPass schema was created with QR and facial verification only.
-- Keep it NFC-free while enabling the production methods used by the application.
drop table if exists public.nfc_credentials;

alter table public.attendance_records
  drop constraint if exists attendance_records_method_valid;

alter table public.attendance_records
  add constraint attendance_records_method_valid
  check (verification_method in ('qr', 'facial', 'manual', 'online'));

commit;
