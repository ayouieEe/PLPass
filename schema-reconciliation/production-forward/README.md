# Future production-forward migrations — inactive

This directory reserves a review boundary for future additive changes after the
verified production migration head `20260907140000`. It contains no SQL and is
not an active Supabase worktree.

Any future migration must be newly versioned, catalog-guarded, additive, and
compatible with `event_sessions` and `event_session_id`. It must never mark a
historical version applied, replay a missing historical file, or run the
abandoned alignment rename.
