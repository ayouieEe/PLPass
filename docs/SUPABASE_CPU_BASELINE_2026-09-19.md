# Supabase CPU Stabilization Baseline

Captured from the linked PLPass Current project on 2026-09-19 (UTC). These
values are cumulative PostgreSQL statistics unless explicitly marked as a
window or rate.

## Baseline

- Database size: 26 MB.
- Shared/table cache hit rates: 1.00 / 1.00.
- Statistics reset: 2026-09-12 06:03:14 UTC.
- Active Realtime subscriptions: 0 at 11:43:42 UTC.
- Realtime publication tables: `attendance_records`, `attendance_requests`,
  `audit_logs`, `credential_requests`, `facial_profiles`, `notifications`.
- `realtime.list_changes`: 530,636 calls, 4,122,039.7 ms total,
  912,254,366 shared-buffer hits, 0 reads.
- Unscoped attendance query: 11,204 calls, 133,887.1 ms total.
- Email worker function: 10,420 calls, 85,772.7 ms total.
- Offline sync RPC: 8 recorded calls, 298.0 ms total in the current statistics.
- Last-24-hour `net._http_response` rows: 360; 344 were HTTP 403, 2 were
  HTTP 500, 1 was HTTP 401, and 13 timed out.
- Current cron jobs: email worker every minute; feedback cleanup every 15
  minutes; both had zero non-successful runs in the last 24 hours.

## Live rollback observation

`xact_rollback` increased from 329,713,729 at 11:32:36 UTC to 329,779,643
at 11:33:28 UTC, an observed rate of approximately 1,268 rollbacks/sec.
Active PostgREST sessions were executing `sync_offline_event_attendance`.

The local Vite server was stopped during the investigation and the rollback
rate did not change, so the local dev server was not the sole source.

## Migration state

Remote-only migration versions must be reconciled before applying new schema
changes:

- 20260919090000
- 20260919103000
- 20260919140000
- 20260919150000

No remote schema mutation was performed while capturing this baseline.
