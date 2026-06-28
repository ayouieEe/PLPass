# Phase 10 NFC Credential Security Design Note

Phase 9.1 must not expose `nfc_credentials.hash_token` through browser-readable table policies.

Recommended Phase 10 design:

1. Move secret material into a private server-only table:
   - `credential_secrets(id uuid primary key default gen_random_uuid())`
   - `credential_id uuid not null references public.nfc_credentials(id) on delete cascade`
   - `hash_token text not null`
   - `created_at timestamptz not null default now()`
   - `rotated_at timestamptz`
   - no browser RLS policies

2. Keep `public.nfc_credentials` as metadata only:
   - `id`
   - `student_id`
   - `nfc_status`
   - `issued_at`
   - `issued_by`
   - `updated_at`
   - `last_successful_check_in_at`

3. Process live NFC taps only through a server-side endpoint:
   - Supabase Edge Function or trusted backend route
   - receives raw NFC reader value
   - hashes/normalizes server-side
   - compares against `credential_secrets.hash_token`
   - writes attendance and audit logs server-side

4. Browser clients should receive only safe result metadata:
   - accepted/rejected status
   - masked credential identifier if needed
   - student display metadata allowed by role
   - no raw NFC value and no hash token

Alternative if the table is not split immediately:

- expose credential metadata through a security-definer RPC or view that excludes `hash_token`;
- do not create direct browser `select` policies on `public.nfc_credentials`;
- block all browser writes to credential secret material.
