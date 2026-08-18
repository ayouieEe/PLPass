begin;

-- Add column to track the verification method used for check-out
-- This allows the system to record different check-in and check-out methods
-- (e.g., QR code for check-in, facial recognition for check-out)
alter table public.attendance_records
  add column checkout_verification_method text,
  add constraint attendance_records_checkout_method_valid
    check (
      checkout_verification_method is null
      or checkout_verification_method in ('qr', 'facial', 'manual')
    );

-- Ensure that if checkout_verification_method is set, time_out must also be set
alter table public.attendance_records
  add constraint attendance_records_checkout_requires_time_out
    check (checkout_verification_method is null or time_out is not null);

commit;
