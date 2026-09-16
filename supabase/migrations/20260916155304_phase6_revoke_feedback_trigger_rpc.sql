begin;

-- This function is invoked by database triggers only.  It must not be
-- callable through the PostgREST RPC surface, especially as it is SECURITY
-- DEFINER and updates aggregate tables.
revoke all on function public.recalculate_feedback_analytics() from public, anon, authenticated;

commit;
