# PLPass schema reconciliation scaffold

This directory is an inactive, repository-only planning scaffold. It is **not**
a Supabase project root: it contains no `config.toml`, SQL, link metadata,
environment file, seed, database file, or executable migration command.

| Path | Purpose | Execution status |
| --- | --- | --- |
| `historical-audit/` | Documents the immutable current history kept in `supabase/migrations/`. | Audit only; never a CLI worktree. |
| `clean-install-baseline/` | Reserved for a future separate Supabase project root and canonical baseline. | Inactive placeholder; no SQL exists. |
| `production-forward/` | Reserved for reviewed, additive migrations after the production head. | Inactive placeholder; no SQL exists. |
| `canonical-catalog.manifest.json` | Machine-readable approved schema and evidence requirements. | Metadata only. |
| `catalog-fingerprint-spec.md` | Deterministic comparison and exclusion rules. | Documentation only. |
| `missing-ledger-versions.json` | Honest classification of remote-ledger differences. | Metadata only. |

## Safety boundary

- Current production commands continue to use only `supabase/`; this scaffold
  is not discovered by that project configuration.
- No command may point a Supabase CLI worktree at `clean-install-baseline/`
  until a later approval adds a reviewed project configuration and baseline SQL.
- `supabase/migrations/` remains untouched during this scaffold phase.
- The verified canonical contract is `event_sessions`,
  `attendance_records.event_session_id`, and
  `verification_attempts.event_session_id`.
- `attendance_sessions`, `attendance_records.session_id`, and
  `verification_attempts.session_id` are explicitly forbidden as a
  reconciliation target.

See `docs/PLPASS_MIGRATION_RECONCILIATION_DESIGN.md` for the approved two-track
design and rollout gates.
