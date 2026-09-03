# PLPass

PLPass is a capstone-ready event attendance information system with dedicated organizer and student workspaces. It supports event management, attendance sessions, QR and facial backup workflows, corrections, feedback, reporting, analytics, audit logs, and responsive access.

## Requirements

- Node.js 20 or newer
- npm
- Python 3.11 (recommended for the DeepFace/FastAPI service)
- A Supabase project for real-data operation
- Docker Desktop only when running the isolated local Supabase stack

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Replace the placeholders with the project URL and publishable browser key. Never place a service-role or secret key in frontend environment variables.
3. Install dependencies with `npm ci`.
4. Start the app with `npm run dev`.

## Facial-recognition service

QR remains the primary attendance method. The organizer can open the supervised live facial station as a fallback; DeepFace then performs anti-spoofing and identifies one student at a time only from the active event's enrolled participants.

1. Create a Python 3.11 virtual environment and install `api/requirements.txt`.
2. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the server environment. Never use a service-role key for this flow.
3. Apply the latest Supabase migrations.
4. Start the service with `uvicorn api.main:app --reload --port 8000`.
5. Start the web app and open an active event attendance session.

The first DeepFace request downloads its selected model and can take longer than later scans. The default model is SFace, the default detector is OpenCV, and `VITE_API_BASE_URL` controls the browser-facing service URL.

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
