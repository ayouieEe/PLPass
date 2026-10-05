begin;

create or replace function private.allocate_event_code(p_hint text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_year text := extract(year from timezone('Asia/Manila', now()))::text;
  v_next integer;
begin
  perform private.lock_event_publish_guard();

  select coalesce(max((substring(event_code from ('^EVT-' || v_year || '-([0-9]+)$'))::integer)), 0) + 1
  into v_next
  from public.events
  where event_code ~* ('^EVT-' || v_year || '-[0-9]+$');

  return format('EVT-%s-%s', v_year, lpad(v_next::text, 3, '0'));
end;
$$;

revoke all on function private.allocate_event_code(text) from public, anon, authenticated;
notify pgrst, 'reload schema';

commit;
