# PLPass Deployment Runbook

## Before deployment

1. Create a release branch from the reviewed commit.
2. Confirm both GitHub quality jobs pass.
3. Confirm `npm ci`, build, lint, 80 unit/integration tests, bundle budget, dependency audit, and 63 browser tests pass.
4. Back up the staging database and record the currently deployed migration version.
5. Apply pending migrations to staging, including biometric/RPC hardening.
6. Run Supabase database lint and Security Advisor.
7. Execute the database authorization checks listed in Phase 5.
8. Complete organizer and student UAT and record names, date, environment, browser/device, result, and unresolved limitations.

## Environment

- Use an HTTPS Supabase project URL and publishable browser key only.
- Do not expose service-role, secret, database, SMTP, or provider credentials in browser variables.
- Ensure `VITE_DATA_SOURCE` is absent or not `mock`.
- Set Auth site URL and reset-password redirects to the deployed HTTPS domain.
- Configure allowed origins, Storage limits, email provider settings, monitoring, and backup retention.
- Run `node scripts/release-preflight.mjs --production` in the hosting build environment.

## Release order

1. Apply backward-compatible database migrations.
2. Verify staging RPC signatures and regenerate database types if needed.
3. Deploy the frontend artifact.
4. Smoke-test login, organizer dashboard/events/session, student dashboard/attendance/methods, corrections, reports, notifications, and logout.
5. Verify audit records and application logs contain no secrets or biometric descriptors.
6. Announce availability only after acceptance criteria pass.

## Rollback

1. Disable new traffic or switch the site to maintenance mode.
2. Roll back the frontend to the previous immutable artifact.
3. Avoid reversing a database migration until its data-loss and compatibility impact is reviewed.
4. For a security incident, revoke affected sessions/keys, preserve audit evidence, and follow the incident response process.
5. Record the reason, timestamps, affected users, actions, verification, and follow-up owner.
