# Phase 0 containment report

**Date:** 2026-09-11
**Branch:** `codex/phase-0-containment`
**Scope:** local desktop containment and persistence validation only
**Production database changes:** none

## Operational containment status

Phase 0's controlled Electron test was completed by the project owner. The application was launched with:

```powershell
$env:PLPASS_AUTO_SYNC_ENABLED = "false"
$env:PLPASS_FORCE_LOCAL_ATTENDANCE = "true"
npm run desktop
```

`PLPASS_AUTO_SYNC_ENABLED=false` pauses the 15-second automatic synchronization timer. It does **not** by itself route attendance into SQLite. `PLPASS_FORCE_LOCAL_ATTENDANCE=true` is a separate, deliberate desktop test switch that deterministically selects the prepared local attendance path before an initial remote attendance write.

The owner observed the following in the running Electron application:

- The UI showed automatic synchronization as paused.
- A Today's event was automatically prepared for offline use.
- After an online-confirmed **Start Session**, the matching SQLite session became active with the same authoritative event and session IDs.
- Forced-local attendance was recorded successfully and remained visible after leaving and reopening the session.
- In the latest 60-minute Supabase Unified Logs view, Postgres showed `0` events; no continuing SQLSTATE `40001` conflict storm was visible.
- Ordinary visible API requests returned HTTP `200`.

These are user-observed operational results, not independent Codex measurements. The Supabase resource-exhaustion warning remained visible and may need time to clear after the request storm.

## Working containment behavior

1. Attendance selected for forced-local or unavailable-network operation is committed to SQLite's `pending_attendance` before success is shown. It has a stable local UUID and starts as `PENDING_SYNC`.
2. The local read model rebuilds visible attendance from durable pending rows as well as cached server attendance. Pending rows survive navigation and offline-package refresh, and merge by session and student identity without duplicates.
3. The retained-record count is derived from the SQLite-backed pending-record state rather than temporary React state.
4. An authorized online Start Session promotes the already-prepared scheduled SQLite session to `ongoing` using its authoritative IDs and server-returned attendance-window and late-cutoff timestamps. It does not immediately replace the package afterward.
5. Reopening an already-active session through its live-session route performs the same local promotion before enabling local recording.
6. `PLPASS_AUTO_SYNC_ENABLED=false` leaves automatic synchronization paused. It does not enable forced-local behavior by implication.

## Local queue observation

A read-only local SQLite count after the controlled verification found **0** non-confirmed pending attendance records. No record contents, student data, biometric data, credentials, or local file paths were collected for this report. This count is time-sensitive and is not evidence that no attendance was recorded during the earlier controlled test.

## Validation completed

- Focused regression tests passed: 5 files, 34 tests.
- Type check passed: `npx tsc -b --pretty false`.
- Desktop build passed: `npm run build:desktop`.
- The existing bundle-size warning remains unrelated to Phase 0.

Covered regressions include forced-local SQLite persistence, initial `PENDING_SYNC` status, no initial remote attendance write in forced-local mode, visible records after navigation/restart/package refresh, duplicate-free local/server merging, session isolation, explicit auto-sync versus forced-local switches, scheduled-session promotion using the existing session ID, and removal only after confirmed synchronization.

## Intentional limits and operator guidance

- **Do not use Retry Sync** until Phase 1 synchronization safety is complete.
- The organizer must currently log in, prepare the event, and start the session online.
- Offline Start, End, and Extend are intentionally not implemented in Phase 0. A durable session-operation outbox is required before that work can proceed; `pending_attendance` must not be repurposed for session commands.
- Phase 0 does not provide durable process-wide single-flight coordination, leases, exponential backoff with jitter, maximum attempts, automatic conflict resolution, or safe retry orchestration.
- The project owner should continue to monitor the resource warning and only treat it as cleared when the platform reports recovery.

## Safety and rollback

No Supabase data, migrations, policies, migration history, or production configuration was changed. No local pending attendance records were deleted, and no Retry Sync operation was invoked.

To leave controlled local-recording mode, remove `PLPASS_FORCE_LOCAL_ATTENDANCE=true` and restart the desktop application. To resume timer-driven synchronization later, remove `PLPASS_AUTO_SYNC_ENABLED=false` only after Phase 1 review and approval. Neither setting performs cleanup or deletes pending SQLite records.

## Phase 1 deferred work

Phase 1 remains approval-gated: durable single-flight/lease ownership, bounded retry backoff and attempt limits, terminal conflict handling, a session-lifecycle operation outbox, safe reconciliation, and a controlled synchronization rollout. No Phase 1 work is included in this change.
