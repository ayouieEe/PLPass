begin;

-- Keep function resolution deterministic. The function may have been created
-- before migration history was introduced, so target every overload safely.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_conflicting_events'
  loop
    execute format('alter function %s set search_path to pg_catalog, public, extensions', v_function);
  end loop;
end;
$$;

-- Email delivery must be initiated by trusted server-side code only. It is
-- not an action that anonymous or ordinary signed-in users should invoke.
revoke all on function public.queue_emails_for_event(uuid) from public, anon, authenticated;
grant execute on function public.queue_emails_for_event(uuid) to service_role;

commit;
