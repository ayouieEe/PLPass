# PLPass

PLPass is a capstone-ready event attendance information system with dedicated organizer and student workspaces. It supports event management, attendance sessions, QR and facial backup workflows, corrections, feedback, reporting, analytics, audit logs, and responsive access.

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project for real-data operation
- Docker Desktop only when running the isolated local Supabase stack

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholders with the project URL and publishable browser key. Never place a service-role or secret key in frontend environment variables.
3. Install dependencies with `npm ci`.
4. Start the app with `npm run dev`.

## Quality commands

- `npm run lint` — source quality checks
- `npm test` — unit and integration tests
- `npm run build` — production TypeScript/Vite build
- `npm run check:bundle` — initial JavaScript regression budget
- `npm run test:e2e` — Chromium, Firefox, and WebKit functional/accessibility/recovery tests
- `npm audit --audit-level=high` — dependency advisory gate
- `npm run check:release` — repository and build release preflight

For a configured deployment environment, run `node scripts/release-preflight.mjs --production` with the production public variables injected by the hosting platform.

## Release documentation

- [Deployment runbook](docs/DEPLOYMENT_RUNBOOK.md)
- [Organizer and student UAT checklist](docs/UAT_CHECKLIST.md)
- [Biometric privacy checklist](docs/BIOMETRIC_PRIVACY_CHECKLIST.md)
- [Phase 4 capstone QA report](PHASE_4_CAPSTONE_QA.md)

The Supabase security migration introduced in Phase 5 must be applied and verified in staging before production. The mock Playwright environment is for deterministic browser testing and must not be enabled in production.
