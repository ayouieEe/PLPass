# PLPass Offline Session Lifecycle Design

## 1. Goals and non-goals

This document specifies a future capability for a previously authenticated organizer to manage an already prepared event session when connectivity is unavailable. It covers durable offline `START`, `EXTEND`, and `END` operations and their safe reconciliation with Supabase.

The canonical session identity remains `public.event_sessions.id`. A prepared package already contains this server-issued ID; offline work must never create another session identifier.

This phase does not implement the design, change SQLite, modify Supabase, create migrations, change production or staging, or alter the completed UI Performance Phase 2. First-time offline login, administrator offline authority, and unrelated page redesign are also out of scope.

## 2. Current limitations and foundation

PLPass currently prepares event packages online, including a stable scheduled `event_sessions` row. Online Start Session promotes that row and mirrors its authoritative active window into SQLite. Phase 1 supplies `pending_attendance`, process-wide synchronization, atomic claims, expiring leases, bounded retry, conflict preservation, and UUID idempotency.

There is no durable session-lifecycle outbox. SQLite has no organizer/package authorization binding, no offline Start/Extend/End commands, and no server RPC for idempotently reconciling them. Consequently, offline attendance is valid only after a session has first been started online.

## 3. Architecture and local authority

### Package authority

A future prepared package must carry the server-issued event ID, session ID, preparing organizer profile ID, package version, prepared timestamp, offline-authority expiry, and a server-verifiable package proof. The desktop generates a per-installation device secret, stored only through Electron/Windows secure storage. The package proof is bound to the organizer, device identifier, event, session, version, and expiry.

Offline lifecycle actions are available only when all conditions hold:

- The desktop package is READY and belongs to the currently cached organizer identity.
- Windows secure storage is available and can read the matching device secret. Otherwise lifecycle controls are disabled.
- The event is owned by that organizer in the prepared authorization snapshot.
- The event and session are not locally known to be cancelled, completed, archived, or superseded.
- The current clock is no later than the cached event end plus 60 minutes. This is the offline-authority expiry.
- The requested transition is locally valid.

The server remains authoritative when connectivity returns. It revalidates the active organizer, event ownership, session state, package proof, and device binding. A future administrator role does not gain offline authority through this design; its policy requires separate approval.

### Local transitions

| Local state | Allowed action | Result |
| --- | --- | --- |
| Prepared scheduled | START | Set cached session to locally ongoing and enqueue START. |
| Locally ongoing | EXTEND | Increase cached end/window end by 1–60 minutes and enqueue EXTEND. |
| Locally ongoing | END | Mark cached session locally ended and enqueue END. |
| Locally ended | none | Block attendance and lifecycle actions while awaiting confirmation. |
| Any unresolved START conflict | none dependent | Block attendance and later lifecycle commands. |
| Any unresolved EXTEND conflict | attendance past prior end blocked | Permit only work within the last confirmed/local valid window. |

Each action and its cached-session update occur in one SQLite transaction. A failed transaction presents failure to the organizer and changes no UI success state.

## 4. SQLite lifecycle outbox

Future local migration v3 creates `pending_session_operations`; it never reuses or rebuilds `pending_attendance`.

| Column | Purpose |
| --- | --- |
| `operation_uuid` | Immutable UUID primary key and server idempotency key. |
| `event_id`, `session_id`, `organizer_id` | Existing server identifiers and authority scope. |
| `operation_type` | `START`, `EXTEND`, or `END`. |
| `requested_at`, `effective_at` | Device-requested time and locally applied time. |
| `requested_end_at`, `extension_minutes`, `reason` | Extension/end detail; only applicable fields are populated. |
| `expected_state`, `expected_version` | Server state/version observed at preparation or the preceding accepted local operation. |
| `package_version`, `package_proof`, `device_id` | Reconciliation and device-binding evidence; never a service credential. |
| `sync_status` | `PENDING_SYNC`, `SYNCING`, `RETRY`, `CONFLICT`, `FAILED`, or `CONFIRMED`. |
| `sync_attempts`, `next_attempt_at`, `last_sync_attempt_at` | Bounded retry scheduling. |
| `lease_owner`, `lease_expires_at` | Atomic ownership for synchronization. |
| `last_error_code`, `last_error_message`, `conflict_json` | Sanitized operator-visible outcome. |
| `server_operation_id`, `server_confirmed_at` | Positive server confirmation. |
| `created_at`, `updated_at` | Durable audit timestamps. |

Indexes cover `(session_id, created_at)`, `(event_id, sync_status, next_attempt_at, created_at)`, and expired `SYNCING` leases. A session operation has a monotonically increasing local sequence number; `START` is sequence zero and later operations reference their direct predecessor.

`pending_attendance` gains only future nullable dependency metadata: `required_operation_uuid` and `required_session_version`. Attendance created after local START depends on that Start operation. Attendance whose timestamp depends on a local extension depends on that Extend operation. Existing rows remain valid with null dependency metadata.

### State machine

`PENDING_SYNC` and due `RETRY` rows may be atomically claimed as `SYNCING`. Only `SYNCING` rows owned by the current lease holder may finish. A positive matching server confirmation produces `CONFIRMED`; a durable confirmation record is retained until ordinary safe cleanup. A transport or temporary server failure produces `RETRY`; its next attempt uses Phase 1's capped exponential backoff with deterministic jitter and a maximum of five attempts. An expired lease becomes `RETRY`; an active lease is never reclaimed.

State/version/ownership/package failures become `CONFLICT` or `FAILED`, are terminal, are never automatically requeued, and retain their evidence for review. Local cleanup is blocked by every non-confirmed lifecycle operation.

## 5. Synchronization ordering and server contract

The lifecycle coordinator uses the Electron-main process single-flight guard and independent atomic claims. It considers all outbox rows for a session in sequence order.

1. Confirm START before uploading attendance that depends on it.
2. Upload eligible attendance through the existing idempotent attendance RPC.
3. Confirm each EXTEND in chronological/sequence order before uploading attendance that needs the extended window.
4. Confirm END only after all preceding lifecycle operations and all session attendance are confirmed or terminally reviewed.

`CONFLICT` or `FAILED` blocks all dependent work. A lost response is recovered by querying the server operation ledger with `operation_uuid` before retrying. No local lifecycle or attendance row is deleted merely because an RPC was invoked.

The future server contract is one authenticated RPC, `sync_offline_event_session_operation`, with:

- `p_operation_uuid`, `p_event_id`, `p_session_id`, `p_operation_type`;
- `p_expected_state`, `p_expected_version`, requested/effective timestamps, optional resulting end time, and optional reason;
- package version/proof and device binding evidence.

Its structured response contains a disposition (`confirmed`, `retryable`, `conflict`, or `unauthorized`), operation ID, server session version/state, authoritative actual start/end/window timestamps, and a safe reason code. Equivalent UUID replays return the original confirmation. A reused UUID with different immutable payload is a terminal conflict.

Future server work requires an operation ledger with unique `operation_uuid`, immutable request fingerprint, session/version linkage, resulting session state, confirmation timestamp, and audit actor. The RPC must run with minimal necessary privileged access, a fixed empty search path, explicit schema qualification, `auth.uid()` organizer ownership checks, and explicit `EXECUTE` grants only to `authenticated`; revoke `PUBLIC` and `anon`. Electron receives only publishable/anon browser credentials, never service-role credentials.

## 6. UI and operator behavior

The existing offline event-status panel gains lifecycle counts and labels without redesigning other pages:

- **Started locally — awaiting confirmation**: local attendance is allowed only when START is eligible.
- **Extension pending / retry at time**: show the locally effective end time and scheduled retry.
- **Conflict requires review** or **Failed — operator review required**: show a safe message and block dependent actions.
- **Ended locally — awaiting confirmation**: block new attendance and cleanup.
- **Server confirmed**: show server-authoritative state and timestamps.
- **Automatic synchronization paused**: show that work is durable locally but will not automatically upload.

The UI must never represent local state as server confirmation. Refreshing a package merges server-cache data with local operations and never replaces a locally active/ended state while lifecycle work remains unresolved.

## 7. Migration, rollback, and recovery

The future SQLite v3 migration runs inside the existing `schema_migrations` transaction. It creates the lifecycle table, indexes, and nullable attendance dependency fields without deleting, moving, or rebuilding prepared packages or current attendance rows. A reopened upgraded database detects the recorded version and makes no further structural change.

An application version older than v3 must not be used to manage lifecycle operations once they exist; release notes and a minimum-version gate are required. Rollback is application rollback only before producing lifecycle operations. After operations exist, preserve the upgraded SQLite file and ship a compatible reader/recovery build; do not downgrade schema or delete queued rows. Server deployment is separately reversible through additive schema/RPC migration design and retained operation-ledger evidence.

## 8. Test matrix and staging validation

| Layer | Required coverage |
| --- | --- |
| SQLite/unit | Operation creation, UUID stability, every transition, five-attempt limit, jitter, active/expired leases, restart, refresh merge, and no deletion before confirmation. |
| IPC/coordinator | Main-process single flight, atomic claiming, ownership checks, dependency ordering, lost response recovery, and multiple renderer windows. |
| Database/RPC/RLS | Ownership, active organizer, package/device proof, state/version conflicts, replay, fixed search path, grants, anonymous denial, and audit trail. |
| Integration/E2E | Offline Start/Extend/End, restart after each, wrong organizer, expiry, cancellation/completion, dependent attendance, pending End, and reconnection. |
| Staging faults | Network loss/lost response, lease expiry, duplicate invocation, concurrent windows, retry exhaustion, conflict, and exact cleanup. |

Current staging evidence is preserved:

| Check | Status | Notes |
| --- | --- | --- |
| Core local durability, manual sync, automatic sync, duplicate prevention | Complete | Synthetic A and B each produced exactly one central record. |
| Lost response | Pending | Phase 1 staging test. |
| Lease expiry | Pending | Phase 1 staging test. |
| Concurrent window | Pending | Phase 1 staging test. |
| Bounded retry | Pending | Phase 1 staging test. |
| Terminal conflict | Pending | Phase 1 staging test. |
| Lifecycle-specific staging faults | Not yet possible | Requires future lifecycle outbox and server RPC. |
| Exact synthetic-data cleanup | Pending | Wait until evidence is documented and advanced tests are completed or explicitly deferred. |

Recommended Phase 1 staging order is: lost response, lease expiry, concurrent window, bounded retry, terminal conflict, evidence review, then exact synthetic cleanup. No staging action is authorized by this document.

## 9. Phased implementation and acceptance criteria

Future implementation requires separate approvals in this order:

1. Local SQLite schema/types/IPC and unit tests, with no remote change.
2. Local lifecycle state, dependency-aware attendance coordinator, and narrow UI states.
3. Additive Supabase production-forward design, canonical baseline changes, RPC/RLS/audit tests, and clean local replay.
4. Isolated staging migration and controlled fault-injection validation.
5. A separate production-forward proposal; production remains disabled until approved.

Acceptance requires a prepared organizer to manage only an owned session offline within the authority window; Start/Extend/End and dependent attendance survive navigation, refresh, restart, and crash; no operation duplicates server effect; no local work is removed before matching confirmation; conflicts remain visible and block dependency violations; and fresh/upgraded SQLite databases preserve all existing attendance data.

