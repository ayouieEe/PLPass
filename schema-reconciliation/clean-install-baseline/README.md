# Canonical clean-install baseline

This is an isolated local Supabase worktree for `plpass-canonical-replay`.
It uses ports 65441–65444 and has no remote link metadata, environment file,
seed, production URL, or production key.

`supabase/migrations/` under this directory is a curated canonical replay
track. It contains 59 byte-identical reviewed historical migrations, excludes
`20260907074339_align_schema.sql`, includes one baseline-safe historical copy,
and adds one baseline-only reconciliation migration. The excluded file performs the abandoned `event_sessions` /
`event_session_id` rename and also has an incompatible duplicate `classes`
definition. The reconciliation migration restores only its independent missing
objects: `classes`, `class_rosters`, `faculty_profiles`, and `admin_profiles`.
The baseline restores the current snapshot-style academic-class contract after
the historical event-only cleanup; its dependency and normalization decisions
are recorded in `CLASS_DEPENDENCY_MATRIX.md`.

`20260907111527_atomic_event_creation_and_email_outbox_worker.sql` is the one
baseline-safe historical copy. Its hard-coded production worker endpoint is
replaced with the Vault secret `event_email_worker_url`; the worker safely
returns without dispatching when that secret or its service-role credential is
absent. This prevents a fresh local or staging replay from ever targeting a
production endpoint. The root historical migration remains unchanged.

The original `supabase/migrations/` directory at the repository root remains
unchanged and is never executed by this worktree. This track is not a
production-forward migration directory and must not be applied to an existing
database. A separately approved future consolidation may replace this curated
track with an immutable single baseline after catalog and staging validation.

No seeds are configured. Structural validation is run by
`tests/structural-catalog.test.mjs` and reads only PostgreSQL catalog metadata.
The test is intentionally outside the application test suite until the baseline
is separately reviewed and committed.
