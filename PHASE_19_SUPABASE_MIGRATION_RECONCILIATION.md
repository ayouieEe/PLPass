# Phase 19 — Supabase migration reconciliation

## Outcome

The three remote-only migration files were recovered from the linked Supabase migration history and added to the repository unchanged. The local-only security migration was safely recreated after the remote migration head and expanded to harden the newly recovered email functions. No remote changes were applied.

## Implemented

- Recovered migrations `20260820120000`, `20260820123000`, and `20260820124500` using `supabase migration fetch` in an isolated temporary work directory.
- Confirmed their normalized contents exactly match the linked migration history.
- Replaced out-of-order migration `20260820010633` with CLI-created migration `20260825050601`.
- Preserved biometric descriptor scoping and audit protections.
- Added deterministic search paths and explicit execute revocations for private event-email `SECURITY DEFINER` functions.
- Updated security regression tests, release preflight, and staging documentation.

## Verification

- Linked push dry run: only `20260825050601_harden_biometric_and_event_email_functions.sql` would be applied.
- Offline Supabase readiness: passed with 26 unique migrations and RLS enabled for all 38 tracked public tables.
- Supabase schema lint previously reported no public-schema errors.
- Repository lint: passed.

## Advisor findings requiring review

- Nine authenticated `SECURITY DEFINER` RPC warnings. Some are intentional application endpoints with internal authorization checks, but each must be tested with student, organizer-owner, organizer-non-owner, and anonymous identities.
- Leaked-password protection is disabled in Supabase Auth.
- The live `event_email_outbox_update_organizer` policy has an unoptimized auth call.
- Duplicate permissive SELECT policies exist on `profiles` and `students`.
- The live email-outbox policy is not present in fetched migration history, proving additional schema drift beyond migration versions.

## Remaining blocker

Docker Desktop is not running, so a complete `supabase db reset`, migrations-to-linked schema diff, local advisors, and pgTAP authorization tests could not be executed. Do not push the pending migration until those checks pass and the untracked live schema changes are captured in a reviewed migration.
