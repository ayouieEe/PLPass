# PLPass Deployment Runbook

## Before deployment

1. Create a release branch from the reviewed commit.
2. Confirm both GitHub quality jobs pass.
3. Confirm `npm ci`, build, lint, 80 unit/integration tests, bundle budget, dependency audit, and 63 browser tests pass.
4. Back up the staging database and record the currently deployed migration version.
5. Apply pending migrations to staging, including the guarded facial-recognition decommission migration.
6. Run Supabase database lint and Security Advisor.
7. Execute the database authorization checks listed in Phase 5.
8. Complete organizer and student UAT and record names, date, environment, browser/device, result, and unresolved limitations.

## Environment

- Use an HTTPS Supabase project URL and publishable browser key only.
- Do not expose service-role, secret, database, SMTP, or provider credentials in browser variables.
- Ensure `VITE_DATA_SOURCE` is absent or not `mock`.
- Set Auth site URL and reset-password redirects to the deployed HTTPS domain.
- Configure allowed origins, Storage limits, email provider settings, monitoring, and backup retention.
- Run `node scripts/release-preflight.mjs --production` in the hosting build environment. It fails closed unless the Supabase CLI is authenticated to the configured project and linked migration parity, schema lint, and generated-type parity all pass. Do not bypass this check; reconcile and apply reviewed migrations first, then rerun it.

## Student Vercel deployment

- Use a separate Vercel project for the student web app and keep the desktop build target unchanged.
- The project uses `npm run build:student`, publishes `dist`, and relies on `vercel.json` to rewrite deep links to `student.html`.
- Configure only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (or their `NEXT_PUBLIC_` equivalents) in both Preview and Production. Never add service-role, database, SMTP, ML, or private API credentials to browser-visible variables.
- Set Supabase Auth Site URL to the final HTTPS student domain. Allow exact production `/reset-password` and `/accept-invitation` redirects, the approved localhost redirect, and a narrowly scoped Vercel Preview wildcard only while Preview QA is active.
- Keep `/accept-invitation` public for staff invitation links. Staff completion must retain the `plpass://open` Desktop handoff; student invitation onboarding is not part of this release.
- Before promotion, run `npm run build:student`, `npm run check:bundle:student`, and `npm run check:release:student -- --production` against the intended linked project. Promote the verified immutable Preview deployment; do not deploy the desktop `index.html` or `scanner.html` artifact to this project.
- Verify student login, refresh, password reset, legal review, dashboard, events, attendance, requests, notifications, logout, mobile accessibility, and staff-account denial on Preview. Roll back by promoting the previous immutable Vercel deployment; do not reverse database migrations for a frontend rollback.

## Release order

1. Apply backward-compatible database migrations to the intended project.
2. Verify linked migration parity and RPC signatures; regenerate database types if needed.
3. Run the production release preflight against the same project. It must pass before the frontend artifact is deployed.
4. Smoke-test login, organizer dashboard/events/session, student dashboard/attendance/methods, corrections, reports, notifications, and logout.
5. Verify audit records and application logs contain no secrets or removed biometric data.
6. Announce availability only after acceptance criteria pass.

## Rollback

1. Disable new traffic or switch the site to maintenance mode.
2. Roll back the frontend to the previous immutable artifact.
3. Avoid reversing a database migration until its data-loss and compatibility impact is reviewed.
4. For a security incident, revoke affected sessions/keys, preserve audit evidence, and follow the incident response process.
5. Record the reason, timestamps, affected users, actions, verification, and follow-up owner.
