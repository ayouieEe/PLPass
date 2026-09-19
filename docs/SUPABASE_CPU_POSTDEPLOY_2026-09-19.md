# Supabase CPU Stabilization Post-Deployment Checkpoint

Captured from the linked PLPass project at 2026-09-19 12:09 UTC, shortly
after the first staged deployment.

## Verified

- Remote migration history contains the reconciled prior versions and the
  deployed CPU-stabilization versions through
  `20260919121500_remove_duplicate_attendance_uuid_index`.
- `private.dispatch_event_email_worker()` sends both the Bearer authorization
  header and the API key from Vault, and retains the pending-outbox guard.
- `public.sync_offline_event_attendance()` contains the per-actor advisory
  lock and 100 ms rate guard.
- The email-worker cron runs were successful in the two-hour sample.
- No new `net._http_response` rows were recorded in the 30-minute sample
  after deployment.
- Active Realtime subscriptions: 0.
- The duplicate partial unique index was removed; the remaining
  `attendance_records_local_uuid_unique_idx` preserves idempotency.

## Observation status

The required 24-hour observation gate is not complete. This checkpoint is
only an early post-deployment sample and must not be interpreted as proof of
sustained CPU stability. The next audit must compare CPU, rollback rate,
Realtime calls/subscriptions, worker HTTP statuses, queue depth, and long
transactions against `SUPABASE_CPU_BASELINE_2026-09-19.md`.

## Advisor follow-up

The advisor still reports broader pre-existing warnings, including multiple
permissive policies and exposed SECURITY DEFINER functions. Those are outside
the approved first stabilization deployment and require separate authorization
and role-by-role regression tests before changing them.

## Incident checkpoint

At approximately 2026-09-19 12:19 UTC, a live diagnostic found a stale
PostgREST connection `idle in transaction (aborted)` while executing the
offline-sync RPC. The rollback counter was still rising rapidly. The server
throttle was changed to use `pg_try_advisory_xact_lock` and return `NULL` for
rate-limited calls instead of raising an exception; the client now treats that
response as a bounded retry without issuing a follow-up attendance query.

The stale aborted backend was terminated individually during the active
incident. The rollback counter remained unchanged across subsequent 10-second
samples, and no replacement aborted session was observed. This is strong
evidence that the immediate rollback storm was caused by the stale aborted
offline-sync connection, but the required longer CPU observation remains
necessary before declaring sustained stability.
