# Phase 4 — Capstone QA and Readiness

## Delivered

- Replaced the outdated student-only browser test with eight current critical-journey tests.
- Covered student dashboard tasks, attendance details, all primary student workspaces, and organizer-route denial.
- Covered organizer dashboard, event management, analytics, event validation, report credentials, and correction controls.
- Added mobile navigation, horizontal-overflow, landmark, single-page-heading, and duplicate-ID smoke checks for both roles.
- Made the Playwright preview build explicitly use the mock repository so browser tests are deterministic and do not require production credentials.

## Verification result

- Production build: passed (2,723 modules transformed).
- Lint: passed with zero reported errors or warnings.
- Unit/integration suite: 78/78 tests passed across 8 files.
- Browser journeys: 8/8 passed in Chromium.
- Desktop student and organizer journeys passed.
- Student-to-organizer route isolation passed.
- Student and organizer 390 × 844 mobile smoke checks passed.

## Read-only Supabase security review

The migration history consistently enables row-level security on application tables, scopes policies by the authenticated student or organizer, limits sensitive facial descriptor columns at table level, and revokes anonymous/public execution from exposed security-definer functions. Storage policies also scope proof and enrollment files by bucket and authenticated ownership.

### Remaining security work

1. **Resolved in Phase 5 — Restrict facial descriptor lookup to an active owned event/session.**
   The RPC now requires an organizer-owned ongoing session, checks event participation, and logs every permitted lookup. Applying and testing the migration against local or staging Supabase remains a deployment gate.
2. **Resolved in Phase 5 — Harden two security-definer trigger functions.**
   Both request-email trigger functions now use an empty search path with schema-qualified application objects.
3. **Resolved in Phase 5 — Harden the client audit function search path and input model.**
   The function now uses an empty search path and validates actor role, text lengths, metadata type, and metadata size.
4. **Medium — Validate the deployed project, not only migration files.**
   Run Supabase Security Advisor and database lint against staging, confirm every migration is applied, verify grants separately from RLS, and exercise policies with two students and two organizers. This review did not modify or connect to the live database.
5. **Medium — Add automated database authorization tests.**
   Test cross-student reads, cross-organizer event/session access, storage object ownership, facial descriptor access, and direct RPC calls in CI against an isolated Supabase instance.
6. **Low — Review biometric retention and consent.**
   Document consent, purpose, retention/deletion, breach handling, and who can perform facial matching. A numerical descriptor is still biometric personal data.

## Remaining capstone work

1. Test the same critical journeys against a staging Supabase project with realistic accounts and seeded data.
2. **Resolved in Phase 6:** Firefox and WebKit projects now run the same critical journeys as Chromium; 24/24 cross-browser journeys pass.
3. **Improved in Phase 7:** automated WCAG 2.1 AA scans now pass on representative desktop/mobile organizer and student pages across three browser engines. Manual assistive-technology evaluation remains required.
4. **Resolved:** Chromium visual regression now protects student dashboard and organizer event management on desktop plus both role dashboards at 390 × 844. The baselines run in a dedicated Windows CI job to avoid cross-platform font-rendering noise.
5. **Improved in Phase 9:** browser coverage now verifies missing/legacy sessions, organizer scope denial, unknown-route recovery, invalid student submissions, and denied camera permission. Real network errors, invalid QR, duplicate check-in, and concurrent database actions remain staging tasks.
6. **Improved in Phase 8:** CI now runs lint, unit tests, production build, dependency audit, bundle budget, and three-engine browser journeys on every pull request and push to main. Database policy tests remain pending an isolated CI Supabase environment.
7. **Improved in Phase 6:** the organizer dashboard is deferred and stable dependencies are cacheable vendor chunks. Large optional facial-recognition and AG Grid feature chunks remain and should be monitored with a CI bundle budget.
8. Complete user-acceptance testing with organizers and students, then record sign-off and known limitations.

## UI impact

Phase 4 does not intentionally change the visible design. It adds test coverage and test configuration only. Future accessibility fixes or error/loading-state improvements may make small visible changes, while database security hardening should not alter the normal UI flow.

## Current Phase 4 status (2026-08-25)

All repository-only Phase 4 work is complete. Visual baselines now cover four high-risk desktop/mobile views and are enforced by CI. Remaining validation requires resources outside the repository:

1. A running isolated Supabase environment (Docker or dedicated staging) for database authorization, invalid QR, duplicate check-in, real network failure, and concurrency tests.
2. Realistic staging accounts for two students and two organizers, with reviewed seed data and no production personal data.
3. Manual assistive-technology and physical-device evaluation.
4. Organizer, student, adviser/product-owner, and development-lead UAT execution and sign-off.
5. Institutional approval of the biometric consent and retention checklist.

These items cannot be truthfully marked passed using mock browser data. Use `docs/UAT_CHECKLIST.md`, `docs/SUPABASE_STAGING_VALIDATION.md`, and `docs/BIOMETRIC_PRIVACY_CHECKLIST.md` to collect the remaining evidence.
