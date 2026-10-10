# PLPass

For the Windows offline-event runtime, synchronization lifecycle, security boundary, and recovery steps, see [Offline attendance architecture](docs/OFFLINE_ATTENDANCE_ARCHITECTURE.md).

PLPass is a capstone-ready event attendance information system with dedicated organizer and student workspaces. It supports event management, QR/manual attendance sessions, corrections, feedback, reporting, analytics, audit logs, and responsive access.

## Requirements

- Node.js 20 or newer
- npm
- Python 3.11 (recommended for the optional FastAPI prediction service)
- A Supabase project for real-data operation
- Docker Desktop only when running the isolated local Supabase stack

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholders with the project URL and publishable browser key. Never place a service-role or secret key in frontend environment variables.
3. Install dependencies with `npm ci`.
4. Start the app with `npm run dev`.

## Optional prediction service

The FastAPI service is used only for automatic attendance-risk forecasts. It does not process camera frames or biometric data. Set `VITE_API_BASE_URL` or the desktop `PLPASS_API_URL` only when forecast generation is enabled.

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
- [Phase 4 capstone QA report](PHASE_4_CAPSTONE_QA.md)

Apply and verify the guarded facial-recognition decommission migration in staging before production. It stops without deleting data when biometric-linked rows or storage objects remain. The mock Playwright environment is for deterministic browser testing and must not be enabled in production.
