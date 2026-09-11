# Staging lost-response fault test

This harness is test-only, disabled by default, and compiled only by the explicit
`staging-fault` desktop build. It must never be used with production.

## Safety gates

- Target project must be exactly `fgbmbzdnrfjdudevmdcu`.
- Protected production project `ouwyhaozkqvhjalqdsvc` is rejected.
- `PLPASS_AUTO_SYNC_ENABLED` must be `false`.
- `VITE_PLPASS_STAGING_FAULT_LOST_RESPONSE_ONCE` must be exactly `true`.
- The synchronizer claims at most one local row.
- The successful RPC response is replaced once, after server success.
- The next request is the normal UUID recovery lookup.
- A session marker prevents a second injection after renderer reload.
- Stop if the RPC or recovery lookup occurs more than once.

## Expected request sequence

1. One authenticated connectivity check.
2. One `sync_offline_event_attendance` RPC.
3. One `attendance_records` UUID recovery lookup.

Record only counts and the two safe harness messages. Never record credentials,
tokens, headers, request bodies, or user data.

## Fixture and cleanup

Create the two named synthetic staging Auth users, then run
`lost-response-fixture.sql` in the staging SQL editor. Use the desktop app to
prepare and start the synthetic event, force one local attendance record, and
invoke Retry Sync once. After evidence is captured, run
`lost-response-cleanup.sql` and verify no rows remain for the exact synthetic
event code, student ID, employee ID, emails, category, section, program, or
department.
