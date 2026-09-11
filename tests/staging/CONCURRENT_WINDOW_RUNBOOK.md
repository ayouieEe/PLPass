# Staging concurrent-window test

Use only the staging project. Create a fresh synthetic organizer, student, active
event/session, and one forced-local attendance record for `STG-CONCURRENT-WINDOW`.
Start the explicit `staging-concurrent-window` build with automatic sync disabled
and `PLPASS_STAGING_TEST_SCENARIO=concurrent-window` plus
`PLPASS_STAGING_TEST_CONCURRENT_WINDOW=true`. The first Retry Sync opens a paired
window and waits; navigate that window to the same event and press Retry Sync once.
Both reach the barrier, but only one may claim and upload the record. Verify central
count is exactly one, both windows show zero retained records, then remove the exact
synthetic fixture. Do not use production.
