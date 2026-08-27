# Phase 18 — Supabase staging readiness

## Outcome

The repository now has offline and linked-project Supabase readiness gates. The audit found a real staging blocker: migration history and generated TypeScript database types are out of sync with the linked project.

## Implemented

- Added `npm run check:supabase` for migration naming, RLS coverage, PostgreSQL version, metadata authorization, and frontend secret checks.
- Added `npm run check:supabase:linked` for remote migration parity, public-schema linting, and generated-type parity.
- Added the offline Supabase check to the continuous quality workflow.
- Corrected the database-type generation command to the current CLI syntax.
- Added a safe staging reconciliation and multi-account authorization checklist.

## Verified situation on 2026-08-25

- Supabase CLI: 2.108.0 (2.115.0 available).
- Local configuration: PostgreSQL 17 and a linked project are present.
- Linked public-schema lint: no schema errors.
- Migration drift: one local-only migration and three remote-only migrations.
- Generated database types: stale compared with the linked public schema.

## Remaining external work

1. Recover and review the three remote-only migrations without overwriting local work.
2. Reconcile the local-only security migration after the remote migration head.
3. Rebuild and validate the full migration chain on a disposable local database.
4. Regenerate database types and confirm the linked readiness gate passes.
5. Run Security and Performance Advisors and resolve material findings.
6. Execute the organizer/student multi-account authorization matrix on staging.
7. Record evidence and obtain biometric/privacy approval before production use.

No remote schema changes were applied during this phase.
