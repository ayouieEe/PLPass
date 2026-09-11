# PLPass Migration Reconciliation Design

## 1. Executive decision

Adopt the verified production event-attendance contract as canonical:

- `public.event_sessions`
- `public.attendance_records.event_session_id`
- `public.verification_attempts.event_session_id`

`attendance_sessions` and `attendance_records.session_id` are not part of the
canonical production contract. The repository must not send the rename in
`20260907074339_align_schema.sql` to production.

This design deliberately separates two concerns:

1. A clean-install baseline that can build an empty database reproducibly.
2. Additive, catalog-guarded production migrations that preserve the live
   event-session contract and migration history.

No data is copied from production to either the baseline or staging. A schema
definition and metadata manifest are sufficient.

## 2. Verified production facts

The read-only production catalog inspection verified all of the following:

- `public.event_sessions` exists, is RLS-enabled, and is the parent of the
  attendance relationship.
- `public.attendance_sessions` does not exist.
- `attendance_records.event_session_id` is required and has a foreign key to
  `event_sessions(id)` with `ON DELETE CASCADE`.
- `verification_attempts.event_session_id` has the same parent relationship.
- Unique partial indexes protect `(event_session_id, student_id)` and
  `local_attendance_uuid` for attendance idempotency.
- Live session, offline-package, offline-sync, facial, and student summary
  routines all use the event-session naming model.
- Relevant tables have RLS; `anon` and `PUBLIC` grants were not found for the
  inspected attendance/session objects or inspected RPCs.
- The production migration ledger head is `20260907140000`.

The remote ledger is missing eight repository versions. Several of their
effects are nevertheless live. Therefore a missing ledger entry does not prove
that an object is absent, nor authorize replay of its historical SQL.

## 3. Root cause of the clean replay failure

`20260907074339_align_schema.sql` renames `event_sessions` to
`attendance_sessions` and `attendance_records.event_session_id` to
`session_id`. The next affected migration,
`20260907130000_student_finalized_event_years.sql`, still creates a function
that references the old table and column. A clean replay consequently stops
with `SQLSTATE 42P01` because `public.event_sessions` no longer exists.

Later migrations continue to create functions against the event-session
contract. The failure is therefore a migration-order and schema-contract split,
not a missing production table.

## 4. Canonical model decision

The canonical model is the production event-attendance model. It is supported
by the live foreign keys, indexes, RLS policies, triggers, RPC definitions,
browser repository, Electron sync client, Python facial service, integration
tests, and current caller signatures.

The class-session generalization in the abandoned alignment migration is a
separate product/schema proposal. It must not be smuggled into reconciliation.
If class attendance is later approved, it requires a new independent design,
not a rename of production event tables.

## 5. Historical migration preservation policy

Historical SQL is evidence and must remain immutable for audit. It is not a
safe executable installation chain.

- Preserve the existing 61 migration files in a clearly labelled historical
  archive after an approved rebaseline transition.
- Store a read-only manifest beside that archive: original filename, SHA-256,
  original sequence, known production-ledger state, and disposition.
- Do not modify a historical file in place, including the broken rename.
- Keep archived SQL outside every Supabase project root used by `supabase
  start`, `db reset`, CI replay, staging, or deployment. This prevents an
  accidental replay.
- Record the baseline source commit, verified-catalog capture date, and review
  approvals. This makes migration identity auditable without creating false
  migration-history rows.

## 6. Clean-install baseline layout

The future implementation should create a separate, explicit Supabase project
root for the reconciled schema. The exact directory move is implementation work
and is not made by this design.

```text
supabase-reconciled/
  config.toml
  migrations/
    <generated-baseline-version>_canonical_event_schema.sql
    <future-version>_*.sql
  seed/                         # disposable fixtures only; never production data
  schema-manifest/
    production-catalog.json
    object-fingerprints.json
    baseline-source.md
supabase-history/
  legacy-unreconciled/
    migrations/                 # immutable current 61-file archive
  manifest.json
supabase-production-forward/
  migrations/                   # temporary, reviewed production-only bridge
  manifest.md
```

Only `supabase-reconciled/` is a fresh-install Supabase worktree. CI and local
development must invoke the CLI with that worktree explicitly. The history and
production-forward directories must contain no active `config.toml` that can be
mistaken for the default project root.

The baseline must include, from reviewed source and catalog metadata rather
than copied production rows:

- extensions and schemas;
- tables, types, primary/foreign/unique/check constraints, indexes, and
  ownership assumptions;
- `event_sessions`, `attendance_records.event_session_id`, and
  `verification_attempts.event_session_id` exactly as approved;
- all necessary functions, function ownership/security modes/search paths,
  execute grants, triggers, views, RLS policies, table grants, and storage
  policies;
- the event-session lifecycle, offline package, offline sync, facial, student
  summary, audit, email, feedback, and late-reason dependencies;
- security-sensitive biometric/storage definitions subject to a separate RLS
  and grant review.

The baseline is produced by comparing reviewed repository definitions with a
sanitized production catalog manifest. It must never contain attendance rows,
students, embeddings, emails, credentials, or other production data.

Future clean-install changes are appended only to
`supabase-reconciled/migrations/`. The initial baseline is immutable once used
by shared staging environments.

## 7. Existing-production additive migration plan

Production remains on its recorded history. It receives only newly generated,
reviewed migrations with versions later than `20260907140000`.

Each future migration must have three stages:

1. **Preflight:** verify object structure, not merely object names. Compare
   columns, types, nullability, constraints, index predicates, function
   identity arguments, result type, security mode, fixed search path, grants,
   policies, trigger definition, and definition fingerprint.
2. **Additive change:** create or replace only the precisely approved missing
   or outdated object. It must retain IDs, `event_sessions`,
   `event_session_id`, existing foreign keys, and public RPC signatures.
3. **Postflight:** assert the intended object fingerprint and compatibility
   contract. Stop on unexpected drift; do not guess a repair.

The production bridge must never execute the historical alignment rename, add
fake migration-history entries, or blindly reapply a missing-ledger file. A
future migration may replace an outdated function definition only after a
staging comparison proves that its public signature and authorization behavior
remain compatible.

## 8. Missing-version classification matrix

| Version | Classification | Verified evidence | Future additive action |
| --- | --- | --- | --- |
| `20260907070704` | Effect present; structural equivalence still needs a fingerprint | `discard_empty_event_session` exists | Do not replay. Compare definition; only replace if a reviewed difference matters. |
| `20260907074339` | Intentionally abandoned; unsafe and must never be applied | Production has no `attendance_sessions` or `session_id`; all live dependencies use event names | Permanently exclude from baseline and production bridge. Document the abandoned refactor. |
| `20260907080418` | Effects present but full structural equivalence is pending | Resource-limit function, trigger, and scoped policies exist | Do not replay. Compare function, trigger, storage policies, and grants before any additive repair. |
| `20260909041227` | Effect already present and structurally equivalent | Authenticated execute access exists for start-session RPC | No production change. Record as an out-of-band/live effect. |
| `20260909113720` | Effect already present and structurally equivalent | Live offline-package and start-session definitions use the expected event-session contract | No production change. Include the verified definitions in the baseline. |
| `20260909171500` | Effect already present and structurally equivalent | `service_role` has embedding read access | No production change. Revalidate the grant during baseline security review. |
| `20260909173000` | Effect present but definition differs because it was superseded | Live facial RPC includes the later checkout interval guard | Never replay this intermediate function revision. Baseline uses the final approved definition. |
| `20260909190000` | Effect already present and structurally equivalent | Live facial RPC has the one-minute checkout guard and expected signature/grant | No production change. Include final definition in baseline. |

“Structurally equivalent” means a future implementation must compare the full
approved definition and ACL fingerprint, not only the behavior observed here.

## 9. Object-by-object reconciliation matrix

| Object family | Baseline source | Production approach |
| --- | --- | --- |
| `event_sessions` | Verified catalog plus reviewed canonical definitions | Preserve unchanged; reject any rename proposal. |
| Attendance/verification foreign keys | Verified live constraints and index predicates | Preserve unchanged; validate before related changes. |
| Offline sync RPC | Verified production definition/signature and current Electron caller | Preserve signature and idempotency keys; replace only through approved forward work. |
| Offline package/start-session RPCs | Verified production definitions and browser caller | Preserve event-session return and JSON contract. |
| Facial RPCs/lookups | Verified definitions and Python caller signature | Preserve `p_event_session_id` and authorization contract. |
| Student summary RPCs | Verified production definitions | Include canonical event-session joins in baseline. |
| RLS/grants | Verified catalog plus role tests | Recreate exactly in baseline; production changes require role-matrix approval. |
| Event-resource objects | Catalog fingerprint still required | Treat existing production objects as authoritative until compared. |
| Generated types | Generated only from a successful reconciled schema | Do not hand-edit to hide differences. |

## 10. Application and RPC compatibility plan

The baseline and any forward migration must preserve these public contracts:

- Browser repository queries `event_sessions` and filters attendance by
  `event_session_id`.
- Electron calls `sync_offline_event_attendance` with a stable local UUID and
  `p_session_id`; the server maps that to `event_session_id`.
- The Python facial API supplies `p_event_session_id` to the facial RPC.
- Offline package JSON continues to expose stable session IDs as `sessionId`.
- `start_event_attendance_session` returns an event-session row.

Before a client-breaking change is considered, release a dual-compatible API,
update all supported clients, measure adoption, and remove compatibility only
after an explicit deprecation approval. No table rename is a rollback plan.

## 11. RLS and grant validation plan

For the reconciled local database and staging, test anonymous, student,
organizer, administrator, and service-role contexts. Validate:

- table access and row filtering for sessions, attendance records, and
  verification attempts;
- RPC execute grants and internal authorization checks;
- `SECURITY DEFINER` routines retain fixed `search_path` and do not have
  unintended `PUBLIC` execution;
- storage policies and biometric access are restricted to approved roles;
- session completion triggers and offline sync remain valid under RLS.

Production policy changes require a separate approval, catalog export, and
role-matrix rollback plan.

## 12. Generated-types strategy

After clean replay passes, generate types from the reconciled local schema and
compare them to the expected canonical contract. The generated output must:

- contain `event_sessions` and `attendance_records.event_session_id`;
- exclude `attendance_sessions` and `attendance_records.session_id` unless a
  future, separately approved feature introduces them;
- expose the verified RPC arguments and return types;
- compile browser, Electron, Python-adjacent contract tests, and integration
  tests.

Types are regenerated in a dedicated reviewed change after schema validation;
they are never edited manually as a migration substitute.

## 13. CI migration-replay strategy

CI must run only the reconciled project root and fail if an archived migration
is discovered under an active migration directory. Required gates:

1. Start a disposable local stack for `supabase-reconciled/`.
2. Replay baseline plus future reconciled migrations from empty state.
3. Do not load production-derived data or unrestricted seed files.
4. Export a local catalog manifest and compare approved object fingerprints.
5. Generate types and run schema-consistency, type, unit, integration, and
   applicable desktop tests.
6. Fail on a table/column/RPC/RLS/grant mismatch.

The legacy chain remains a negative regression fixture: CI may verify that it
is archived and cannot be invoked, but must not use it as the fresh-install
path.

## 14. Staging rollout plan

Create a disposable staging project only after the reconciled baseline passes
locally. Staging receives no production rows. Use synthetic organizer, event,
session, student, attendance, correction, and facial fixture metadata only.

Staging gates are:

- baseline replay and catalog fingerprint parity;
- RLS/grant role matrix;
- browser, Electron offline-sync, and facial-service RPC signature checks;
- event start/end, offline-package, check-in/check-out, idempotency, and
  conflict behavior;
- generated-type compilation and desktop build;
- rollback rehearsal using additive compatibility objects only.

## 15. Production rollout gates

Before any production migration proposal:

1. Capture a new read-only catalog and migration ledger.
2. Confirm the catalog still matches this design’s canonical contract.
3. Compare each proposed object fingerprint with production.
4. Back up schema definitions and obtain the approved rollback artifact.
5. Prove staging parity and supported-client compatibility.
6. Schedule an observable rollout with error, RPC, RLS-denial, and client
version monitoring.

Any unexpected catalog drift, missing backup, failed staging gate, or uncertain
client compatibility is a stop condition.

## 16. Rollback strategy

Rollback is additive and deployment-based:

- retain existing tables, IDs, columns, and foreign keys;
- restore a prior reviewed function, policy, grant, trigger, or view
  definition where necessary;
- retain compatibility functions/views for supported old clients;
- stop deployment on catalog mismatch rather than attempting a live rename;
- never roll back by recreating or renaming session/attendance tables, deleting
  records, or altering migration history.

## 17. Risks and unresolved questions

- The method that created effects absent from the production migration ledger
  is unknown. A schema fingerprint is required before any replacement.
- The exact full definitions of event-resource storage policies and older
  missing objects need a versioned comparison before inclusion in a final
  baseline.
- The baseline must be reviewed for extensions, storage, auth, and private
  helper dependencies beyond the session model.
- A separate class-attendance design may be valid in the future, but it cannot
  reuse the abandoned rename as a shortcut.
- Old deployed clients must be inventoried before any public RPC change.

## 18. Exact implementation sequence

1. Approve a repository-only baseline manifest and object-fingerprint capture
   format.
2. Approve a read-only production metadata supplement for remaining baseline
   object families, if needed.
3. Create the separate reconciled Supabase project root and archive manifest;
   do not alter historical SQL.
4. Author the canonical baseline from reviewed definitions.
5. Replay it locally from empty state and repair only the new baseline files.
6. Generate types and pass all local gates.
7. Create disposable staging and validate without production data.
8. Draft individually guarded production-forward migrations after the remote
   head; review each against a fresh catalog capture.
9. Seek a separate approval before any staging or production deployment.

## 19. Acceptance criteria

The implementation is acceptable only when it proves that:

- an empty database builds successfully from the reconciled baseline;
- the resulting schema uses `event_sessions` and `event_session_id`;
- offline, lifecycle, facial, and student RPC signatures match active clients;
- RLS and grants match approved role behavior;
- regenerated types compile all application targets;
- staging is populated only with synthetic data;
- production receives only reviewed additive migrations;
- the broken rename cannot be selected by fresh-install, CI, staging, or
  production deployment commands;
- all eight ledger differences remain truthfully documented.

## 20. Next approval request

Approve creation of the repository-only baseline manifest and catalog
fingerprint specification, followed by a local implementation branch that adds
the separate reconciled project layout. This must remain local-only: no
migrations executed, no type generation, no remote project contact, and no
production changes until a subsequent approval.
