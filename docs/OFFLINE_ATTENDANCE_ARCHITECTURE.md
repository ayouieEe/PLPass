# PLPass offline attendance architecture

## Scope and source of truth

Supabase remains PLPass's permanent centralized database and the authority for authentication, enrollment, event management, historical reporting, and analytics. SQLite is temporary operational storage used only by the Electron desktop app for a prepared event and attendance awaiting confirmation.

The browser build remains supported for normal online operation. Offline preparation and attendance require the desktop runtime because a normal browser must not receive native database or filesystem access.

## Runtime and data boundary

Electron was selected because PLPass already uses React, Vite, TypeScript, Node tooling, and a browser-local Human face model. The React UI is unchanged except for focused offline controls. Electron's bundled `node:sqlite` runtime runs only in the main process and avoids a separate native compiler dependency. A context-isolated, sandboxed preload exposes named operations; it never exposes SQL, filesystem paths, Node, or arbitrary IPC.

The database is stored as `plpass-offline.sqlite3` inside Electron's per-user application-data directory. It contains:

- prepared event metadata and sessions;
- only participants assigned to that event;
- active QR credential identifiers (not reusable plaintext secrets);
- ArcFace embeddings for eligible participants, without original photos;
- central attendance state used for duplicate prevention;
- complete pending attendance until Supabase confirms it.

## Workflow

```mermaid
sequenceDiagram
  actor Organizer
  participant UI as PLPass desktop
  participant SQLite as Local event cache
  participant Sync as Sync service
  participant Supabase as Permanent Supabase database
  Organizer->>UI: Prepare event
  UI->>Supabase: Organizer-scoped package request
  Supabase-->>SQLite: Event, sessions, eligible participants, QR IDs, embeddings, attendance state
  SQLite-->>UI: Package READY
  Organizer->>UI: Offline QR / face / manual attendance
  UI->>SQLite: Shared eligibility, session, rule, duplicate validation
  SQLite->>SQLite: Save PENDING_SYNC and update duplicate state
  Sync->>Supabase: Connectivity restored; idempotent bounded upload
  Supabase-->>Sync: UUID-matched persistence confirmation
  Sync->>SQLite: Delete confirmed temporary attendance
  Organizer->>UI: Complete event and request cleanup
  UI->>Supabase: Verify connectivity and zero unresolved records
  UI->>SQLite: Verified post-event cache cleanup
```

## Organizer operation

1. Sign in online in the desktop app and open an approved scheduled/ongoing event.
2. Select **Prepare for Offline Use**. A package is marked ready only after required event, session, and participant identity data is present.
3. During an outage, use QR first, local facial matching second, and exact Student ID/name last. Every method calls the same local attendance validator.
4. A local success explicitly says synchronization is pending. Keep the app open when connectivity returns; it probes Supabase authentication rather than trusting `navigator.onLine` and synchronizes automatically in bounded batches. **Retry Sync** is also available.
5. Resolve conflicts before cleanup. After the event is completed and the status says all attendance is synchronized, select **Clean up offline package**.

## Phone scanner stations

The desktop app can open up to five temporary QR scanner stations for a prepared, ongoing session. The laptop remains the only device with the event package and SQLite database; phones never write attendance directly to Supabase or retain an offline attendance queue.

1. In the active attendance session, select **Start scanner stations** and enable the laptop's Windows hotspot.
2. Each phone joins that hotspot, scans the certificate-setup QR, and follows the device prompt to trust the event's temporary certificate.
3. The organizer generates one short-lived invitation QR per phone. The phone scans it, permits camera access, and becomes a scanner station.
4. Every QR scan travels over the hotspot to the laptop's HTTPS coordinator. The coordinator applies the same local eligibility, duplicate, time-in, and time-out transaction used by the laptop interface.
5. If a phone loses the hotspot connection, it must reconnect before another scan can be accepted. It does not queue attendance locally.

`localhost` means the device currently using it. Scanner phones therefore use the laptop's displayed hotspot address (for example `https://192.168.x.x:PORT`), never `localhost`. Windows may ask the organizer to allow the desktop app through its private-network firewall when scanner stations first start; that permission is required for phones on the hotspot to reach the coordinator.

## Synchronization and idempotency

Local records use a generated `local_attendance_uuid` and lifecycle states `PENDING_SYNC`, `SYNCING`, `RETRY`, `CONFLICT`, and transient `CONFIRMED`. Interrupted `SYNCING` records become `RETRY` at startup. A failed record does not stop later records.

`sync_offline_event_attendance` validates the authenticated organizer, event ownership, participant eligibility, method, timestamps, and status. Postgres uniquely enforces both the local UUID and the existing `(event_session_id, student_id)` attendance identity. If an upload response is lost, the client queries by UUID; deletion occurs only after the returned or queried row has the same UUID. Connectivity by itself never deletes data.

## Cleanup and biometric handling

The event cache is retained across temporary reconnections. Cleanup is blocked until the event is completed, pending/retry/syncing/conflict count is zero, and Supabase connectivity has been positively confirmed. Cleanup cascades through local sessions, participants, QR identifiers, attendance state, and embeddings only; it never deletes a Supabase event or history.

SQLite `secure_delete` is enabled and the WAL is truncated during cleanup. Secure deletion cannot be guaranteed on SSDs because wear leveling may preserve old physical pages. This implementation mitigates exposure through minimum-data caching, the per-user application directory, short event retention, no raw-photo caching, no biometric logging, and verified cleanup. Database encryption/key destruction is a recommended future hardening step if the defense environment requires stronger at-rest guarantees.

## Run and test

```powershell
npm install
npm run desktop
```

The Supabase migration must be applied before preparation or synchronization. To test offline mode, prepare an event while online, open an ongoing session, disconnect networking, record QR/face/manual attendance, reconnect, and observe the waiting count reach zero only after confirmation.

Focused automated coverage is in `tests/offline-local-database.test.ts` and `tests/offline-sync-service.test.ts`.

## Recovery and known limitations

- If sync fails, reconnect, sign in again if needed, and select **Retry Sync**. Do not delete the local database.
- `CONFLICT` records are intentionally retained. Review the corresponding central student/session record before an operator-approved resolution workflow is added.
- Authentication remains online. An already prepared package can run after connectivity loss, but package creation/refresh and sync require a valid Supabase session.
- The desktop package is not code-signed or installer-packaged yet; the current command demonstrates it on Windows.
- Local face matching uses cached ArcFace vectors with the existing renderer model. The central enrollment workflow and server-side anti-spoofing pipeline remain unchanged; additional offline liveness hardening is recommended for production deployment.
