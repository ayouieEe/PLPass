# Staging bounded-retry test

Use only the staging project. Create a fresh synthetic organizer, student, active
event/session, and one forced-local attendance record for `STG-BOUNDED-RETRY`.
Copy `.env.staging-bounded-retry.example` to the ignored
`.env.staging-bounded-retry.local` file, fill it with the same staging public values
used by the previous staging test, and start the explicit `staging-bounded-retry`
build with automatic sync disabled.

Press **Retry Sync** once. The app must retain the one local record and show the
first simulated transient failure; no central attendance row may exist. Wait three
seconds, press **Retry Sync** once again, and verify the same retained record plus
the second simulated failure and still no central row. Wait three seconds, press
**Retry Sync** a third and final time. The ordinary synchronization path must create
exactly one central row and remove the confirmed local record. Verify no repeated
requests in the console, then remove only the exact synthetic fixture. Do not use
production.
