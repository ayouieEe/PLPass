begin;

-- Reconcile only the safe direction: an event with an active ongoing session
-- must be represented as ongoing. Completed and cancelled events are terminal
-- and are intentionally excluded from this repair. Events without an ongoing
-- session are left unchanged because there is not enough evidence to infer a
-- replacement status from historical data.
update public.events as event
set event_status = 'ongoing', updated_at = now()
where event.event_status not in ('completed', 'cancelled')
  and exists (
    select 1
    from public.event_sessions as session
    where session.event_id = event.id
      and session.session_status = 'ongoing'
      and coalesce(session.session_archive_status, 'active') = 'active'
  );

commit;
