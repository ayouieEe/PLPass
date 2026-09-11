# Staging terminal-conflict test

Use only the staging project. Create the synthetic organizer and student, run the
empty fixture, and launch the explicit `staging-terminal-conflict` build with
automatic sync disabled and the required process flags. Refresh the offline package
while it has no attendance. Then run the seed script to add one central attendance
row after the package is cached. Record forced-local attendance for `STG-TC-1` and
press Retry Sync once. The server must return its duplicate-attendance conflict;
the local row stays retained with a conflict status and must not be retried. Verify
one central row, one local conflict, and the console diagnostic. Remove only the
exact fixture after evidence is captured. Do not use production.
