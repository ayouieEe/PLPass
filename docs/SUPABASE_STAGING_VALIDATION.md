# Supabase staging validation

Run this checklist before deploying application code or database changes to staging or production.

## Safe validation order

1. Run `npm run check:supabase` locally and in CI.
2. Run `npm run check:supabase:linked` while authenticated to the intended staging project.
3. If migration history differs, stop. Do not run `db push`, `db pull`, migration repair, or a linked reset until the differences are reviewed.
4. Capture remote-only migrations in the repository using the Supabase migration workflow, review the generated SQL, and test the complete chain on a disposable local database.
5. Rebase any local-only migration so its timestamp and assumptions follow the recovered remote migrations. Do not edit a migration that has already run in another shared environment.
6. Run a local reset, database lint, automated tests, and the linked readiness check again.
7. Regenerate `src/lib/supabase/database.types.ts` only after the schema histories agree.
8. Review the Supabase Security and Performance Advisors, then test organizer and student accounts against the staging project.

## Required multi-account authorization checks

- A student can read and update only their own profile, attendance requests, credentials, notifications, and biometric enrollment data.
- A student cannot create or modify events, organizer settings, another student's records, or audit logs.
- An organizer can manage only events and attendance data allowed by the ownership rules.
- One organizer cannot modify another organizer's events unless the product explicitly grants that role.
- Anonymous requests cannot read protected tables or storage objects.
- Storage proof uploads require the expected insert/read/delete permissions and cannot overwrite another user's object.
- Privileged functions reject unauthorized callers and use a fixed search path.

Record the test accounts, date, project reference, migration head, advisor result, and pass/fail evidence in the release record. Never store passwords, access tokens, facial descriptors, or service-role keys in that record.

## Current reconciliation status (2026-08-25)

The three remote-only migrations (`20260820120000`, `20260820123000`, and `20260820124500`) have been recovered from linked migration history and added locally without changing their SQL. The former out-of-order local security migration was recreated as `20260825050601`, after the remote migration head, and extended to harden the recovered privileged email functions. This pending migration must pass a complete local reset and advisor review before a reviewed staging push. Generated types must then be refreshed from the reconciled schema.

The linked advisors also show live database state that is absent from fetched migration history, including `event_email_outbox_update_organizer`. Capture and review a complete migrations-to-linked schema diff before pushing. Docker Desktop must be running for the local shadow database and full reset steps.
