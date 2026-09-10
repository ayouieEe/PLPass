# Phase 0 containment report

**Date:** 2026-09-10
**Branch:** `codex/phase-0-containment`
**Scope:** incident evidence capture and local emergency containment only
**Production database changes:** none

## Current incident status

The incident remains active. During a read-only Supabase Unified Logs check, the latest moving 60-minute window reported approximately **292,500 PostgreSQL events**, all categorized as **5xx errors** except 26 successful events. The visible newest rows at `2026-09-10 22:51:09` contained at least 50 simultaneous SQLSTATE `40001` errors.

The known exact error is `The central attendance record conflicts with the offline record.` The repository's sole occurrence is the explicit `40001` branch in `public.sync_offline_event_attendance` at [20260905083415_add_offline_attendance_idempotency.sql:82-87](../supabase/migrations/20260905083415_add_offline_attendance_idempotency.sql#L82). This confirms the database error emitter, but the dashboard inspection did not expose sufficient caller metadata to identify a specific Electron process, app version, or client address. The active caller is therefore narrowed to a client invoking that RPC, but not yet uniquely identified.

## Evidence preserved

| Item | Result |
| --- | --- |
| Project | `ouwyhaozkqvhjalqdsvc` |
| Repository commit before Phase 0 | `65d4227325907d91abe9557e8c4f70e09493287d` — 2026-09-10 20:27:07 +0800 |
| Application version | `0.0.0` from `package.json` |
| Linked project reference | `ouwyhaozkqvhjalqdsvc` |
| Generated types | `src/lib/supabase/database.types.ts` retained unchanged |
| Local database state | Not opened or queried, so no attendance/biometric data was accessed |
| Production schema/migration state | Not modified. Linked migration history was read through the Supabase CLI; five local migration versions are absent remotely: `20260907070704`, `20260907074339`, `20260907080418`, `20260909041227`, and `20260909113720`. |
| Current error-window evidence | About 292.5k Postgres errors in the moving 60-minute window; visible error code `40001` |
| Live routine verification | The live `public.sync_offline_event_attendance(uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text)` definition contains both the observed conflict message and `40001`. |
| Connection attribution | Aggregated activity showed PostgREST 14.5 connections (3 active, 4 aborted-idle, 4 idle/idle-in-transaction) plus platform services. It does not identify a desktop device, version, or source IP. |
| Remaining attribution gap | Need log-detail request metadata, a safe deployed-client inventory, or a time-bounded application version rollout record to uniquely identify the surviving caller. |

## Phase 0 implementation

The following local-only containment behavior was added:

1. Electron reads `PLPASS_AUTO_SYNC_ENABLED` at launch. It defaults to enabled; setting it exactly to `false` disables only the timer-driven background sync.
2. The renderer receives the setting through a narrowly scoped IPC method. No Node APIs, credentials, SQLite access, or unrestricted configuration are exposed.
3. The offline status panel states that automatic synchronization is paused and that queued records are retained locally.
4. A per-hook in-flight promise guard prevents repeated manual Retry Sync clicks and timer/manual overlap within one rendered screen.
5. Browser pages without the Electron offline bridge no longer start the 15-second sync timer.

This is deliberately **not** a Phase 1 process-wide coordinator. It does not provide cross-window locking, durable leases, retry backoff, maximum attempts, or SQLite schema changes.

## Validation completed

- `npm test -- tests/phase-zero-auto-sync.test.ts tests/offline-sync-service.test.ts tests/offline-local-database.test.ts` passed: 3 files, 18 tests.
- `npx tsc -b --pretty false` passed.
- `npm run build:desktop` passed. The existing bundle-size warning remains; it is unrelated to the containment switch.
- Linked migration history is **not aligned** with the checkout. This includes `20260907074339_align_schema.sql`, the migration that introduces the competing `attendance_sessions` contract. Phase 0 makes no attempt to repair history or apply missing migrations.
- The only production SQL executed was two bounded metadata checks: live routine fingerprinting and aggregated `pg_stat_activity` application/state counts. Neither queried attendance, biometric, or user rows.

## Safe containment procedure for the currently deployed client

1. Identify the active PLPass device/process using log-detail metadata or the bounded read-only activity query in the audit report.
2. Preserve the log window, app version, approximate process count, and local queue counts. Do not copy attendance or biometric payloads.
3. Stop only the confirmed responsible PLPass application instance, or start the repaired desktop build with `PLPASS_AUTO_SYNC_ENABLED=false`.
4. Confirm automatic `40001` events drop toward zero while local attendance recording remains available.
5. Do not delete queued SQLite rows, truncate logs/WAL, restart Supabase, or alter attendance records.

## Files changed

- `electron/main.ts` — launch-time containment flag and read-only renderer IPC response.
- `electron/preload.ts`, `electron/preload.cjs`, `src/features/offline/types.ts` — narrow typed configuration bridge.
- `src/features/offline/useOfflineEvent.ts` — timer gating and per-screen manual-sync guard.
- `src/features/offline/OfflineStatusPanel.tsx` and organizer pages — visible paused state.
- `.env.example`, `README.md` — operator instructions.
- `docs/PLPASS_DATABASE_AUDIT.md` — prior audit retained.
- This report.

## Rollback

Remove `PLPASS_AUTO_SYNC_ENABLED=false` and restart the desktop application. No pending attendance records, central records, migrations, policies, or production resources are modified by this Phase 0 switch.

## Approval gate

Phase 0 is complete in the repository and validated by focused tests, type checking, and a desktop build. It is **not deployed**, so it cannot stop traffic from an already-running older client. Production caller identity is narrowed to the PostgREST/RPC path but remains unproven at the individual desktop-process level. Do not start Phase 1 before the owner decides how to distribute or operate the Phase 0 containment build and reviews this report.
