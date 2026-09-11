# Staging lease-expiry recovery test

This is test-only and may run only against `fgbmbzdnrfjdudevmdcu`. Production
`ouwyhaozkqvhjalqdsvc` is rejected by the renderer guard; packaged apps reject
the five-second local lease before the SQLite database opens.

## Claim phase

Launch the explicit `staging-lease-expiry` build with automatic sync disabled,
forced-local attendance enabled, `PLPASS_STAGING_TEST_SCENARIO=lease-expiry`,
and `PLPASS_STAGING_TEST_LEASE_MS=5000`. Set
`VITE_PLPASS_STAGING_LEASE_EXPIRY_ENABLED=true` and
`VITE_PLPASS_STAGING_LEASE_EXPIRY_PHASE=claim` for this build only.
The normal desktop build excludes the test IPC implementation and this special
preload; only the explicit staging build copies them into its output.

Copy `lease-expiry.env.example` to the ignored repository-root file
`.env.staging-lease-expiry.local` and replace only its staging public URL and
publishable-key placeholders. It must not contain a database password,
service-role key, or production value. Set the two process-only claim controls
and the normal Electron controls in the PowerShell session that starts the
app; they are deliberately not stored in the local environment file:

```powershell
$env:PLPASS_AUTO_SYNC_ENABLED = 'false'
$env:PLPASS_FORCE_LOCAL_ATTENDANCE = 'true'
$env:PLPASS_STAGING_TEST_SCENARIO = 'lease-expiry'
$env:PLPASS_STAGING_TEST_LEASE_MS = '5000'
npm run desktop:staging-lease-expiry
```

The fixture creates one server-issued, already-active session so this test does
not also exercise session lifecycle behavior. After exactly one local record
exists, invoke Retry Sync once. The app claims one row and exits before an
attendance RPC. Verify central count remains zero.

## Recovery phase

Wait at least six seconds. Relaunch with the same staging configuration but
without `PLPASS_STAGING_TEST_SCENARIO` or `PLPASS_STAGING_TEST_LEASE_MS`, and
set `VITE_PLPASS_STAGING_LEASE_EXPIRY_PHASE=recover`. The normal database
startup path recovers only the expired lease. Retry Sync exactly once, then
verify one central record, zero local pending records, and the safe recovery
console message. Before running the recovery build, change the local file's
phase value to `recover`, then use a fresh PowerShell session or remove the two
claim variables before launch:

```powershell
$env:PLPASS_AUTO_SYNC_ENABLED = 'false'
$env:PLPASS_FORCE_LOCAL_ATTENDANCE = 'true'
Remove-Item Env:PLPASS_STAGING_TEST_SCENARIO -ErrorAction SilentlyContinue
Remove-Item Env:PLPASS_STAGING_TEST_LEASE_MS -ErrorAction SilentlyContinue
npm run desktop:staging-lease-expiry
```

Run the exact cleanup SQL after recording evidence.
