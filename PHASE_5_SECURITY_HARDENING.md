# Phase 5 — Security Hardening

## Delivered

- Restricted facial descriptor retrieval to an organizer-owned, ongoing event session.
- Required the selected student to remain a registered participant in that event.
- Added an audit record for every permitted facial descriptor lookup, including the session and whether a descriptor was found.
- Updated the organizer attendance client and generated database types to pass the event session ID.
- Hardened request-email trigger functions with deterministic empty search paths.
- Hardened the client audit RPC with an empty search path, active-organizer authorization, bounded text inputs, object-only metadata, and a 16 KiB metadata limit.
- Added migration regression tests for the biometric authorization and privileged-function safeguards.
- Revoked function execution by default for future functions created by `postgres` in both `public` and `private`; every callable RPC must now receive an explicit role grant.
- Added regression coverage for the complete intentional authenticated `SECURITY DEFINER` RPC allowlist, including organizer-role checks, student self-scoping, anonymous denial, and explicit grants.

## Verification

- Production build: passed (2,723 modules transformed).
- Lint: passed with zero reported errors or warnings.
- Unit and integration suite: 80/80 passed across 9 files.
- Organizer and student browser journeys: 8/8 passed.
- Mobile and role-isolation browser checks: passed.

## Deployment gate

The migration was intentionally not applied to the linked project. The local Supabase database could not be started because Docker was unavailable. Before deployment:

1. Start an isolated local Supabase stack or use staging.
2. Apply the migration and run database lint/security advisors.
3. Verify that the owning organizer can retrieve a descriptor for a registered student during an ongoing session.
4. Verify denial for another organizer, a removed/unregistered student, a scheduled/completed session, anonymous access, and a student account.
5. Confirm the descriptor access audit row is created without storing the descriptor itself.
6. Regenerate database types from the verified database and confirm there is no unexpected diff.

## UI impact

There is no intentional visual change. Facial attendance uses the same controls, but unauthorized or invalid session lookups are now rejected by the database instead of relying on the interface.

## Current Phase 5 status (2026-08-25)

All repository-side security hardening is complete. The linked advisor's authenticated `SECURITY DEFINER` warnings are documented intentional RPC endpoints with internal authorization checks; they still require identity-based staging tests before acceptance. Leaked-password protection must also be enabled in the Supabase Auth dashboard. The pending migration remains intentionally unapplied until the full local migration replay and staging authorization matrix pass.
