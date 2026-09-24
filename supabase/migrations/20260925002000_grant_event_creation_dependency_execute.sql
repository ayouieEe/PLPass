-- The authenticated wrapper delegates to this function. Keep the underlying
-- RPC callable only by signed-in users; it still requires an active organizer
-- through private.is_active_organizer() before writing anything.
grant execute on function public.create_organizer_event(
  text, uuid, text, text, text, timestamptz, timestamptz, text, numeric,
  text, uuid[], text[], text, text, text
) to authenticated;
