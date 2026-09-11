# Future clean-install baseline — inactive

This is a placeholder only. It is deliberately not a Supabase CLI worktree and
contains no SQL, configuration, seed, link metadata, environment file, or data.

After separate approval, it will become a distinct project root that builds an
empty database from the canonical event-session baseline. It must not replay
`supabase/migrations/`, import production data, or include the abandoned
`attendance_sessions` rename.
