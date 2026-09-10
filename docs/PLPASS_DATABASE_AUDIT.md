# PLPass database health and design audit

**Audit date:** 2026-09-10
**Scope:** repository review and read-only Supabase dashboard inspection for project `ouwyhaozkqvhjalqdsvc`
**Production changes:** none
**Overall health:** **Critical — active request-error amplification and host-resource pressure**

## Executive summary

PLPass is currently experiencing an active PostgreSQL error storm. A live dashboard snapshot showed roughly 329k requests during one moving 60-minute window, with roughly 328.6k PostgreSQL requests and roughly 328.6k errors. Earlier evidence showed the same pattern at roughly 354k total requests. The changing totals are expected because the incident was still active while observed.

The exact error is confirmed: PostgreSQL SQLSTATE `40001`, **“The central attendance record conflicts with the offline record.”** The error text is raised only by `public.sync_offline_event_attendance` in [20260905083415_add_offline_attendance_idempotency.sql](../supabase/migrations/20260905083415_add_offline_attendance_idempotency.sql#L33). The live log stream showed repeated copies of this error at the same second, and the dashboard classified nearly all current PostgreSQL log events as 5xx errors.

The production dashboard also showed 95–100% CPU, 24/60 database connections, and critical `DatabaseStorageCapacityExhausted`, `HostDiskWillFillIn24Hours`, and `HostOutOfDiskSpace` alerts. The reported database size was only about 0.03 GB of a 2 GB allocation. Therefore table data is not an adequate explanation for host-root disk pressure. The most plausible explanation is incident by-product data such as PostgreSQL logs, WAL, temporary files, or platform-level runtime files; that specific allocation was not exposed by the read-only dashboard and is not asserted as fact.

The current repository has a credible client-side amplification defect: each mounted offline hook calls synchronization every 15 seconds without a single-flight guard, while every synchronization run resets **all** local `SYNCING` records to `RETRY` before claiming the next batch. A second overlapping run can therefore reclaim records that are still being sent by the first run. The code does mark a completed `40001` attempt as `CONFLICT`, which normally stops future claims. Consequently, a single normal run of the current checkout cannot by itself explain hundreds of thousands of errors. The continuing volume indicates at least one of: overlapping work, multiple Electron processes/windows, a background/deployed build differing from this checkout, or another caller issuing the same RPC. The log error identifies the database operation; client/process attribution remains the highest-priority containment check.

No application code, database schema, policy, data, configuration, plan, or production setting was changed for this audit.

## Evidence quality and investigation boundaries

| Evidence | What it establishes | Limitation |
| --- | --- | --- |
| Supabase project overview and Unified Logs, inspected read-only | Active high-volume PostgreSQL failures, exact SQLSTATE/message, CPU and infrastructure alerts, object-size snapshot | Dashboard does not expose host filesystem, full request payloads, or a definitive desktop-process identity in this review |
| Query Performance dashboard | Cumulative hot statements: `realtime.list_changes` consumed 65.3% / 2h30m16s across 721,437 calls; PostgREST request context setup was called 114,916,531 times | This screen is cumulative `pg_stat_statements` data, not a one-hour incident-only timeline; failed statements may not be represented as normal successful executions |
| Repository code, migrations, seed data, generated types, and tests | Exact current source paths and intended database contract | Repository/migration history is known to diverge from linked state; it cannot prove the deployed Electron build or live catalog without further read-only catalog export |
| Security/Performance Advisors | Security Advisor: 0 errors, 30 warnings, 1 info item; Performance Advisor: 0 errors, 5 warnings, 30 suggestions | Warning details were not exported in this read-only session; “0 errors” does not demonstrate a secure design |

All conclusions below are marked **confirmed**, **high-confidence**, or **hypothesis**. A hypothesis is not a production root-cause claim.

## Immediate incident assessment

### Incident timeline and observed state

| Observation | Read-only evidence | Interpretation |
| --- | --- | --- |
| Repeating error | Unified Logs displayed 325.8k PostgreSQL 5xx events in the selected 60 minutes. Rows at `2026-09-10 22:15:32` repeatedly reported `40001` and “The central attendance record conflicts with the offline record.” | **Confirmed** error family and rate. |
| Database function | The only repository occurrence of the message is the explicit `raise exception ... errcode = '40001'` at [20260905083415...sql:86](../supabase/migrations/20260905083415_add_offline_attendance_idempotency.sql#L86). A bounded read-only live definition check confirmed that `public.sync_offline_event_attendance(...)` contains both the message and `40001`. | **Confirmed** database emitter. |
| CPU/resource pressure | Dashboard showed approximately 94.98% database CPU, about 408 MB memory used, 24/60 connections, and critical root-disk alerts. | CPU and host pressure are active symptoms; they may worsen retries and log generation. |
| Ordinary database size | Dashboard reported about 0.03 GB database size / 2 GB provisioned. Largest displayed objects were `cron.job_run_details` (~880 KB), `net._http_response` (~720 KB), `event_email_outbox` (~464 KB), and `audit_logs` (~320 KB). | The user-table footprint is small. Do not treat a compute upgrade or table cleanup as a diagnosis. |
| Other product traffic | Same 60-minute dashboard snapshot: Edge Functions 62 requests, Auth 26, Realtime 15–21, Storage 3–6, API Gateway about 225–230. | These totals do not resemble the 325k PostgreSQL error rate. They do not rule out direct/PostgREST/RPC traffic. |

### Traceability map: offline attendance

```text
Organizer attendance/event screen
  -> useOfflineEvent(eventId, sessionId)
  -> 15-second setInterval invokes sync()
  -> synchronizePendingAttendance()
  -> auth.getUser() connectivity check
  -> SQLite recoverInterruptedSync()  [resets every SYNCING row]
  -> SQLite beginSync(20)             [claims PENDING_SYNC / RETRY rows]
  -> RPC sync_offline_event_attendance(...)
  -> public.attendance_records lookup/lock by session + student
  -> conflict branch: SQLSTATE 40001 if authoritative time/status differs
  -> client fallback SELECT by local_attendance_uuid
  -> SQLite failSync(CONFLICT) or failSync(RETRY)
```

Related realtime path:

```text
any public table change
  -> one session-scoped channel subscribes to 10 tables with event: "*"
  -> React Query invalidates one or more query keys
  -> active query observers refetch their data
```

Source traceability:

| Layer | Source | Behavior |
| --- | --- | --- |
| UI hook | [src/features/offline/useOfflineEvent.ts:7-13](../src/features/offline/useOfflineEvent.ts#L7) | Starts a 15-second timer; `sync()` has no in-flight/single-flight guard. Used by Event Details and Event Attendance. |
| Sync service | [src/features/offline/offlineService.ts:58-80](../src/features/offline/offlineService.ts#L58) | Runs connectivity check, recovery, batch claim, RPC, fallback lookup, and status update. |
| Local claim/recovery | [electron/localDatabase.ts:114-117](../electron/localDatabase.ts#L114) | Claims pending/retry rows; unconditionally converts all `SYNCING` rows to `RETRY`. |
| Server idempotency/conflict | [20260905083415...sql:63-101](../supabase/migrations/20260905083415_add_offline_attendance_idempotency.sql#L63) | Reuses matching UUID, locks existing attendance row, and raises `40001` when time/status differs. |
| Local durable state | [electron/migrations.ts:31-47](../electron/migrations.ts#L31) | Uses a stable UUID primary key and unique `(session_id, student_id)` in the SQLite outbox. |
| Tests | [tests/offline-sync-service.test.ts:10-13](../tests/offline-sync-service.test.ts#L10) | Covers success, lost response, network failure, and one conflict; does not cover concurrent sync calls, lease age, repeated timers, or backoff. |

### Root-cause ranking

| Rank | Finding | Confidence | Why it is ranked here |
| --- | --- | --- | --- |
| 1 | Repeated calls to `sync_offline_event_attendance` are producing `40001` attendance-conflict errors. | **Confirmed** | Exact live error text and SQLSTATE match the explicit function branch. |
| 2 | Offline synchronization can amplify concurrent work by reclaiming active `SYNCING` records and by starting every 15 seconds without a single-flight lock. | **High** | The code path is explicit. It can cause duplicate in-flight RPCs before either run changes the record to `CONFLICT`. |
| 3 | Another active process/window or a deployed client version may be continuing the storm after the originally observed client was closed. | **High** | The current client marks a completed `40001` as `CONFLICT`, which `beginSync` does not reclaim. Sustained volume therefore requires overlapping work or another caller. |
| 4 | Broad Realtime subscriptions and invalidations add high database load but do not explain the exact `40001` error. | **Medium** | Ten `event: "*"` subscriptions are registered per session; cumulative `realtime.list_changes` is the largest observed query workload. |
| 5 | The email outbox cron worker is the incident source. | **Low** | It runs once/minute and has bounded batches, leases, `SKIP LOCKED`, and a five-attempt ceiling. The observed 62 Edge Function calls are consistent with schedule frequency, not the error storm. |
| 6 | Feedback rollup triggers recurse. | **Low** | The trigger updates summary/objective tables, not `event_feedback` or `event_feedback_ratings`, so direct self-recursion is not visible in source. |

### Immediate containment evidence to capture before any change

Run these as **read-only** operations in the Supabase SQL Editor or supported inspection tooling. Phase 0 executed only the live-routine fingerprint and aggregated `pg_stat_activity` application-state count; the broader catalog/log export below remains intentionally deferred.

```sql
-- Recent exact error volume and the callers recorded in logs.
-- Use Unified Logs filters: Postgres + Error 5xx + exact message/SQLSTATE 40001.
-- Export only metadata needed for source attribution; do not export PII or biometric payloads.

-- Current active statements and client application names, if dashboard permissions allow it.
select pid, usename, application_name, client_addr, state,
       wait_event_type, wait_event, query_start, left(query, 500) as query
from pg_stat_activity
where state <> 'idle'
order by query_start;

-- Confirm current function definition contains the observed error branch.
select pg_get_functiondef(
  'public.sync_offline_event_attendance(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,text)'::regprocedure
);

-- Identify only the attendance rows that are structurally eligible for conflict analysis.
-- Do not return names, biometrics, email, or other PII.
select event_session_id, student_id, attendance_status, time_in, time_out,
       local_attendance_uuid, updated_at
from public.attendance_records
where local_attendance_uuid is not null
order by updated_at desc
limit 100;
```

Do **not** use `pg_stat_statements_reset()`, delete logs, restart services, truncate cron/net tables, or raise compute size as incident “fixes” before identifying the surviving client/process and preserving an incident record.

## Detailed findings

| ID | Finding | Severity | Evidence | Root cause or symptom | Recommended action |
| --- | --- | --- | --- | --- | --- |
| C-01 | Offline attendance conflict RPC is repeatedly failing. | Critical | Live `40001` logs; [offline RPC conflict branch](../supabase/migrations/20260905083415_add_offline_attendance_idempotency.sql#L82) | Confirmed root error emitter | Attribute callers, stop the active caller safely, then make conflict terminal and observable. |
| C-02 | Sync work is not single-flight; recovery can steal an active lease. | Critical | [useOfflineEvent timer](../src/features/offline/useOfflineEvent.ts#L13), [recovery/claim implementation](../electron/localDatabase.ts#L114) | High-confidence request amplifier | Introduce process-wide mutex plus durable lease expiry; recover only expired leases. |
| C-03 | Retry behavior lacks backoff, jitter, due-time, and maximum-attempt controls. | Critical | [synchronizePendingAttendance](../src/features/offline/offlineService.ts#L58), SQLite schema | High-confidence amplifier during connectivity or service degradation | Add `next_attempt_at`, capped attempts, classified error policy, jitter, and operator-visible terminal state. |
| H-01 | Migration history attempts to rename `event_sessions` to `attendance_sessions`, while subsequent migrations, repository code, tests, seed data, and generated types still use `event_sessions`; generated types contain both tables. The linked migration history confirms that the alignment migration (`20260907074339`) is not recorded remotely, along with four other local versions. | High | [align migration](../supabase/migrations/20260907074339_align_schema.sql#L53), [schema consistency test](../tests/supabase-schema-consistency.test.ts#L7), linked read-only migration history | Confirmed migration-history divergence and schema-drift risk | Export the live catalog, decide one canonical session model, and reconcile only via reviewed forward migrations. |
| H-02 | Four `authenticated` read policies use `USING (true)` for classes, rosters, faculty profiles, and admin profiles. | High | [align migration policies](../supabase/migrations/20260907074339_align_schema.sql#L77) | Potential authorization/PII overexposure; active state must be verified live | Inventory effective live policies and replace broad reads with role/organization predicates where business rules require it. |
| H-03 | Raw face descriptors/embeddings appear in JSON fields and are copied into the local offline cache. | High | [generated types](../src/lib/supabase/database.types.ts#L1392), [SQLite cache schema](../electron/migrations.ts#L17) | Sensitive-data exposure/retention risk | Verify RLS, direct grants, storage/device encryption, retention, and access logging before any schema change. |
| H-04 | Privileged email-worker routines use `auth.role()` checks. | High | [email worker migration](../supabase/migrations/20260907111527_atomic_event_creation_and_email_outbox_worker.sql#L105) | Deprecated authorization pattern; service-role functions also require live grants review | Keep private dispatcher non-callable; use explicit grants and validate caller claims/role model in the final function definitions. |
| H-05 | Remote and repository migration state has previously diverged. | High | [staging validation status](SUPABASE_STAGING_VALIDATION.md) | Deployment safety risk | Stop on history differences, produce a reviewed diff, replay in a disposable database, regenerate types only after reconciliation. |
| M-01 | One Realtime channel subscribes to ten tables with wildcard events and invalidates several caches per event. | Medium | [DevelopmentSessionProvider.tsx:161-190](../src/app/providers/DevelopmentSessionProvider.tsx#L161) | Load multiplier, not confirmed error source | Limit tables/events/payloads, scope by user/event where possible, and measure refetch fan-out. |
| M-02 | Generic lists request exact counts and use offset ranges; attendance filtering issues separate session-ID reads. | Medium | [repositories.ts:166-205](../src/services/supabase/repositories.ts#L166), [attendance list](../src/services/supabase/repositories.ts#L885) | Scaling/performance risk | Keep small lists as-is; use cursor/keyset pagination and RPC/view consolidation only for observed expensive paths. |
| M-03 | Feedback trigger recalculates aggregates per row. | Medium | [feedback trigger](../supabase/migrations/20260905092000_add_feedback_aggregation_trigger.sql#L8) | May become costly at volume; no recursion evidence | Benchmark with realistic feedback volume; consider deferred/batched aggregation if it is observed hot. |
| M-04 | Database query performance is dominated by Realtime and request-context setup. | Medium | Live `pg_stat_statements` dashboard; 721,437 Realtime calls and 114,916,531 request-context calls, cumulative | Historical capacity signal | Measure active subscriptions/connections and reduce avoidable refetch/subscription churn before index changes. |
| L-01 | `classes` repeats subject, room, schedule, and department information rather than using the normalized foundation tables. | Low/High design risk | [foundation model](../supabase/migrations/20260717054004_create_plpass_foundation.sql#L167), [alignment model](../supabase/migrations/20260907074339_align_schema.sql#L4) | Harmful if both models coexist; may be intentional snapshot if canonical model is documented | Decide canonical academic model before normalizing; do not automatically deduplicate. |

## Schema and relationship inventory

### Catalog status

The generated `Database` type lists 35 public application tables and no generated public views. It is a useful inventory baseline, but it is **not authoritative** because the repository itself documents linked migration/state divergence and the types contain both `attendance_sessions` and `event_sessions`. Live catalog export is required before any migration is designed.

The table inventory below records every generated public table and its principal columns. `uuid` and `timestamptz` values are represented as `string` by generated TypeScript types; JSON values are represented as `Json`.

| Domain | Tables and principal columns |
| --- | --- |
| Identity and academic structure | `profiles(id, email, names, role, account_status, department_id, employee_id, student_id)`; `students(id, profile_id, student_id, program_id, department_id, section_id, year_level, status)`; `organizers(id, profile_id, employee_id, department_id, organization_name, position, status)`; `faculty_profiles(id, profile_id, department_id, employee_number, employment_status, title)`; `admin_profiles(id, profile_id, department_id, employee_number, office_name)`; `departments(id, department_code, department_name)`; `programs(id, department_id, program_code, program_name)`; `sections(id, program_id, section_name, year_level, academic_year, semester)`; `semesters(id, semester_name, academic_year, start_date, end_date, status)`; `classes(id, faculty_id, program_id, department_id, semester_id, subject_code, subject_title, room, section_id, year_level, schedule_label, status)`; `class_rosters(id, class_id, student_id, enrolled_at)`. |
| Events and attendance | `events(id, organizer_id, category_id, department_id, code, title, venue, starts_at, ends_at, status, approval, visibility, priority/impact fields)`; `event_participants(id, event_id, student_id, participant_status, registered_at)`; `event_sessions(id, event_id, name, venue, mode, schedule/actual/window timestamps, status)`; `attendance_sessions(id, event_id?, class_id?, session_type, name, venue, schedule/actual/window timestamps, status)`; `attendance_records(id, event_session_id, student_id, status, verification fields, time_in/out, local_attendance_uuid, late-reason fields)`; `attendance_requests(id, attendance_record_id, student_id, requested_status, request_status, review fields)`; `attendance_request_attachments(id, request_id, bucket/path, MIME/name/size)`; `attendance_late_reason_options` and `attendance_late_reason_option_translations` (generated types identify both lookup tables). |
| Credentials and verification | `qr_credentials(id, student_id, token_hash, credential_status, issued/expires/revoked timestamps)`; `credential_requests(id, student_id, request_type, credential_type, reason, status, review fields)`; `credential_request_attachments(id, request_id, bucket/path, MIME/name/size)`; `verification_attempts(id, event_session_id, student_id?, facial_profile_id?, qr_credential_id?, method, accepted, failure_code, message, attempted_at)`. |
| Biometrics | `facial_profiles(id, student_id, enrollment_reference, facial_status, consent_recorded_at, face_descriptor, descriptor_model)`; `student_face_embeddings(id, student_id, model_name, detector_backend, pose, embedding)`; `facial_enrollment_history(id, student_id, credential_request_id?, enrollment kind/status/reference, replaced_profile_id?)`. |
| Email, feedback, reporting, audit | `event_email_outbox(id, event_id, recipient profile/email, notification_type, status, attempts, lease fields)`; `request_email_outbox(id, request table/id/status, recipient, status, provider id)`; `event_feedback(id, event_id, attendance_record_id, student_id, comment, sentiment)`; `event_feedback_ratings(id, feedback_id, objective_id, rating)`; `event_objectives(id, event_id, objective text/order, average_rating)`; `event_summary_snapshots(id, event_id, attendance/sentiment counts and rates, source)`; `event_resources(id, event_id, title, URL or storage location)`; `generated_reports(id, generated_by, name, format, scope, status, storage location)`; `ml_predictions(id, event_id?, student_id?, prediction, score, risk, explanation)`; `notifications(id, recipient_id, title/message, type/status, reference/action URL)`; `audit_logs(id, actor_user_id?, action, target type/id, metadata, created_at)`. |

### Relationship map

```text
auth.users 1—1 profiles
profiles 1—0/1 students | organizers | faculty_profiles | admin_profiles
departments 1—N programs, profiles, students, organizers, faculty/admin profiles
programs 1—N sections, students, classes
sections 1—N students and classes
semesters 1—N classes
classes N—N students through class_rosters (legacy foundation also defines class_enrollments)

organizers 1—N events
events N—N students through event_participants
events 1—N event_sessions (current repository contract) / attendance_sessions (alignment migration contract)
session 1—N attendance_records; students 1—N attendance_records
attendance_records 1—N attendance_requests; attendance_records 0/1—N verification_attempts

students 1—N qr_credentials; students 1—0/1 facial_profiles; students 1—N face embeddings
events 1—N objectives, resources, email outbox rows, feedback, summary snapshots
feedback 1—N ratings; objective 1—N ratings
```

### Primary integrity controls observed in migrations

| Rule | Database enforcement observed | Assessment |
| --- | --- | --- |
| One event participant per event/student | Unique `(event_id, student_id)` | Good; verify current live constraint due migration drift. |
| One active QR credential per student | Partial unique index on `student_id` where status is activated | Good. Expiration is checked by application/function logic; active status alone does not expire it. |
| One facial profile per student | `student_id` unique on `facial_profiles` | Good baseline; embeddings are separate one-to-many rows. |
| One attendance record per session/student | Partial unique indexes for class and event session forms in original migration | Good design; final live column/table naming must be verified. |
| Stable offline idempotency key | Partial unique index on `attendance_records(local_attendance_uuid)` | Good duplicate-insert protection; it does not solve semantic conflicts or client retry storms. |
| Local no-duplicate attendance | SQLite unique `(session_id, student_id)` plus UUID primary key | Good device-local guard. |
| Valid session/time/status values | Checks for session mode/status/time ordering and attendance status/time ordering | Good foundation; live constraints must be cataloged. |
| Manual correction auditability | Requests store reviewer/timestamp/reason; audit log table exists | Partially enforced; audit-log immutability needs live privilege/policy review. |

## Normalization and redundancy assessment

| Area | Classification | Assessment and consistency requirement |
| --- | --- | --- |
| `profiles` identifiers duplicated in `students` and `organizers` | **Uncertain** | `profiles.student_id` vs `students.student_id`, and `profiles.employee_id` vs `organizers.employee_id`, create two sources of truth. Use one canonical identifier or enforce synchronization with a reviewed database mechanism. |
| `students.department_id` alongside `program_id` and `section_id` | **Uncertain** | Department may be denormalized for filtering; it is derivable through program/section. Keep only if documented and consistently maintained. |
| `classes.subject_code`, `subject_title`, `room`, `schedule_label`, and `department_id` | **Harmful redundancy unless intentionally a snapshot** | The foundation model uses `subjects`, `rooms`, and `class_schedules`; the later model flattens values. The repository does not establish a single canonical model. |
| `event_summary_snapshots` | **Historical snapshot** | Preserving published/periodic event metrics is justified. Its `source`, capture time, and update rules must distinguish immutable snapshots from a cache. |
| `event_objectives.average_rating` and snapshot sentiment/count fields | **Derived/cache value** | Trigger-maintained values are justified for read performance only if recomputation and staleness behavior are documented and tested. |
| `events` priority score/tier/urgency/impact fields | **Derived/cache value / uncertain** | These may represent a reviewed classification snapshot. Document source-of-truth inputs and whether manual override (`fixed_priority`) owns precedence. |
| Event email/request outboxes | **Justified denormalization** | Recipient email, rendered subject/body, and event/request status are delivery snapshots. They must remain immutable enough to explain historical messages. |
| Facial profile plus embedding rows | **Justified separation** | Enrollment/consent/status metadata and model-specific embeddings have different lifecycle/security needs. Raw descriptors should not be duplicated into ordinary profile data. |
| `event_sessions` and `attendance_sessions` | **Harmful duplicate naming/state** | Both generated types and migrations suggest incompatible canonical objects. This must be resolved before feature work. |

No comma-separated relational fields were found in the inspected schema definitions. JSON is used for `audit_logs.metadata`, facial descriptors/embeddings, and some RPC/analytics payloads. Audit metadata and embedding vectors are defensible JSON uses; any new relational JSON payload should be evaluated before storage.

## Security and Supabase review

### Positive controls observed

- Foundation migrations enable RLS on exposed `public` tables and revoke default Data API table privileges before explicit grants.
- Many privileged routines use `SECURITY DEFINER` with `set search_path = ''` and explicit `REVOKE`/`GRANT` statements.
- The offline synchronization RPC validates active organizer context, session ownership, participant membership, allowed methods/status, and time ordering before writing.
- Email worker service credentials are read from Vault in the dispatcher rather than hard-coded in SQL.
- The Electron local database uses SQLite foreign keys, WAL, and secure delete; it deletes temporary local attendance only after server confirmation.

### Required security verification and findings

| Topic | Assessment | Required read-only verification |
| --- | --- | --- |
| RLS policy coverage | Live Security Advisor had 30 warnings despite 0 errors. Historical migrations are not enough to conclude effective policies. | Export `pg_policies`, table grants, exposed schemas, and `relrowsecurity`; test roles against a non-production or controlled staging dataset. |
| Broad authenticated reads | The alignment migration adds four `USING (true)` policies. | Determine whether students should see all rosters/faculty/admin profiles; scope by organization, department, assignment, or self where needed. |
| Biometric access | Face descriptor and embedding data are sensitive. The offline package intentionally includes embeddings for local matching. | Confirm public-schema table grants, RLS, RPC exposure, desktop database encryption/OS protections, retention, and logs never include embedding data. |
| Security-definer functions | Fixed search paths are mostly present, but every final definition and `PUBLIC` execute privilege must be cataloged. | Query `pg_proc`, `proconfig`, ACLs, and function definitions; verify direct callers cannot bypass intended policy. |
| `auth.role()` | Used in service-role email routines. Supabase guidance deprecates it for authorization patterns. | Review final caller/auth model and use explicit privilege boundaries; do not assume an authenticated role equals an authorized user. |
| Storage | Attachments/resources rely on storage bucket/path references and policies. | Export bucket policies and test anonymous/student/organizer access without exposing actual files. |
| Audit logs | Table exists but immutability is not proven by the current report. | Confirm that ordinary clients cannot insert, update, or delete arbitrary audit rows, and that function-only writes have authorization. |

## Performance and scalability review

### Confirmed and likely load sources

- React Query defaults to one retry, 30-second staleness, and no refetch-on-window-focus in [queryClient.ts](../src/app/providers/queryClient.ts). This is conservative and is not an infinite generic React Query retry loop.
- `useOfflineEvent` contributes a separate 15-second polling loop and calls `auth.getUser()` for each attempted sync/refresh. This is not protected by the global query defaults.
- `DevelopmentSessionProvider` correctly removes its Realtime channel on effect cleanup, but its broad ten-table subscription can still create meaningful work while mounted.
- The query performance dashboard identified `realtime.list_changes` as the largest cumulative time consumer. This supports reducing subscription churn before assuming missing indexes.
- Generic list helpers request exact counts and use offsets. This is acceptable for small administrative lists but grows with page depth; deep or high-cardinality lists should use a cursor only after measurements show need.
- `listAttendanceRecords` first queries session IDs and then fetches attendance records; date filtering can make another session query. It is bounded but creates extra round trips.
- The event email worker is comparatively well-protected: `FOR UPDATE SKIP LOCKED`, a five-minute lease expiry, max five attempts, and increasing retry delay. It is not modeled by the weaker offline outbox.
- SQLite WAL and `BEGIN IMMEDIATE` transaction use are appropriate foundations. The outbox needs lease timing and a due-at schedule rather than unconditional recovery.

### Index position

The migrations include many useful foreign-key and access-path indexes, including attendance by session/student, events by organizer/status/start time, event participants by event/student, QR credential uniqueness, and outbox due-row partial indexes. Do **not** add indexes merely because a column appears in a filter.

Before proposing an index, capture the normalized statement, call count, timing, rows, plan, and live table size. Priority candidates for review are:

1. Attendance records filtered by session/student and the offline UUID conflict/idempotency lookups.
2. RLS predicates and ownership helpers after final policies are known.
3. Event/session/participant screens with high real traffic.
4. Audit log searches by target or actor if the current `ILIKE` path becomes hot.
5. Feedback trigger queries if production feedback volume produces measurable write latency.

## Read-only production inventory queries

These are the exact safe query families for the follow-up catalog export. Run them in bounded form, save only metadata, and redact PII/biometric values from the report artifact.

```sql
-- Tables, RLS, estimated rows, and sizes (metadata only).
select n.nspname as schema_name, c.relname as relation_name,
       c.relrowsecurity as rls_enabled,
       c.reltuples::bigint as estimated_rows,
       pg_total_relation_size(c.oid) as total_bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private')
  and c.relkind in ('r', 'p', 'v', 'm')
order by pg_total_relation_size(c.oid) desc;

-- Constraints and indexes. Metadata only; no scans of application data.
select conrelid::regclass as table_name, conname, contype,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text, conname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- Effective RLS policies and direct public-schema grants.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select table_schema, table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- Maintenance health; use estimates/statistics only.
select relname, n_live_tup, n_dead_tup,
       last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
from pg_stat_user_tables
order by n_dead_tup desc
limit 50;
```

## Remediation plan — approval required before any implementation

Each stage is intentionally isolated. Emergency containment, schema work, security changes, and data cleanup must not be bundled into one migration.

| Stage | Problem and proposed solution | Risk/side effects | Backup, validation, rollback | Tests required |
| --- | --- | --- | --- | --- |
| 0. Incident containment | Identify the surviving caller via logs/activity; close or disable only that process after preserving an incident record. If code is deployed, use a reviewed feature flag or desktop release control to stop automatic sync. | Temporarily delays offline uploads; never delete local outbox data. | Record log range, app version, connection metadata, and pending local counts. Roll back by re-enabling the controlled client path. | Verify no new `40001` rate after containment and no local attendance loss. |
| 1. Offline sync concurrency | Add a process-wide single-flight gate; replace unconditional recovery with a lease carrying owner and expiry; atomically claim only expired or due rows. | A bad lease duration can delay recovery after crash. | SQLite schema migration with copy/rollback plan; test on fresh and existing local databases. Roll back to prior app version only after compatible local schema review. | Concurrent timers, two windows, restart mid-RPC, stale lease recovery, and no duplicate RPC for one UUID. |
| 2. Retry/conflict policy | Add bounded exponential backoff with jitter and max attempts; keep `40001`/`23505` terminal as `CONFLICT` and require explicit user review/reconciliation. | Some records require human attention instead of silent automatic retry. | Preserve all original local record values and errors. Roll back by retaining records, never by deleting them. | Transient network failure, lost success response, persistent failure, conflict, manual resolution, check-in/out update. |
| 3. Server conflict contract | Review the RPC’s semantic conflict condition and define whether equivalent time/status records should adopt the UUID or require user action. Keep uniqueness/idempotency in PostgreSQL. | Changing conflict semantics can alter attendance history. | Export affected record counts; use a forward migration only after staging replay. | SQL/RPC authorization, duplicate UUID, duplicate student/session, exact-match recovery, divergent-record rejection. |
| 4. Schema reconciliation | Establish one canonical session table/column contract, recover missing remote migrations, produce a catalog diff, and use forward migrations/adapters until all clients migrate. | High compatibility risk across desktop/browser/deployed clients. | Full backup plus clean disposable replay; no migration-history rewrite. Rollback via compatible view/RPC/dual-read window, not destructive rename reversal. | Clean migration replay, generated types, repository schema consistency, staging smoke tests. |
| 5. Security hardening | Replace broad policies where not intended, inventory function grants, protect biometric tables/storage, and make audit writes controlled. | May reveal legitimate paths that relied on overbroad access. | Staging policy matrix and pre-change policy export; rollback via prior reviewed policy definitions. | Anonymous, student, organizer, administrator, service-role, storage, RPC, and biometric-access tests. |
| 6. Performance follow-up | Reduce Realtime subscription scope/refetch fan-out; optimize only measured hot queries/indexes; assess feedback aggregation and count/pagination behavior. | Narrowing subscriptions may delay UI freshness; added indexes increase write cost. | Save `pg_stat_statements`/plan baselines and index definitions. Rollback indexes/policies separately with approval. | Request rate, CPU, connection count, query latency, Realtime delivery, and UI freshness benchmarks. |
| 7. Optional normalization | Resolve duplicated academic and identifier fields only after source-of-truth decisions and a reviewed mapping. | Highest data-quality risk; may affect reports/integrations. | Back up, validate every proposed mapping, use reversible forward migrations and compatibility reads. | Orphan/duplicate checks, report parity, migration rollback, and cross-role end-to-end tests. |

## Acceptance criteria for a future implementation

| Metric | Target |
| --- | --- |
| `40001` offline-conflict error rate | No automatic recurrence; only explicit user-visible conflict actions may produce a recorded conflict. |
| One local UUID sync attempt | At most one in-flight RPC per desktop process; no duplicate attendance row. |
| Transient failure behavior | Backoff with jitter, maximum attempts, and visible pending/retry state. |
| Conflict behavior | No automatic requeue; preserved local/server context and deliberate resolution path. |
| Database health | CPU, connections, error rate, WAL/log growth, and disk alerts return to an agreed baseline under representative load. |
| Schema | Clean disposable migration replay matches approved linked/staging catalog and regenerated types. |
| Security | Policy matrix passes for anonymous, student, organizer, administrator, and service-role contexts. |

## Audit limitations and next decision

This report deliberately does not perform cleanup, data repair, plan upgrade, migration repair, or deployment. Phase 0 performed only bounded read-only production metadata checks: linked migration history, live conflict-routine fingerprinting, and aggregated connection application/state counts. It does not expose tokens, service-role credentials, personal data, or biometric values.

Before implementation, approve **Stage 0 only** if immediate containment is needed. After the production caller is identified and the error storm is stopped, approve Stages 1–3 as a small offline-sync safety change. Schema reconciliation and security hardening should be reviewed and approved independently.
