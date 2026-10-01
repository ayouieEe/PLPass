begin;

-- Keep event-start notifications pointed at the exact live attendance session.
-- Admins and department admins already have read-only monitor access to the
-- corresponding Events workspace; passing the session id avoids opening the
-- generic event details page.
create or replace function private.notify_admin_event_started()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event record;
  v_recipient record;
  v_url text;
begin
  if tg_op = 'UPDATE' and old.actual_start is not null then
    return new;
  end if;
  if new.actual_start is null then
    return new;
  end if;

  select e.id, e.event_code, e.title, e.venue, e.department_id
    into v_event
  from public.events e
  where e.id = new.event_id;

  if v_event.id is null then
    return new;
  end if;

  for v_recipient in
    select p.id, p.role, p.department_id
    from public.profiles p
    where p.account_status = 'active'
      and (
        p.role = 'admin'
        or (p.role = 'department_admin' and p.department_id = v_event.department_id)
      )
  loop
    v_url := case
      when v_recipient.role = 'admin' then '/admin/events?session=' || new.id::text
      else '/department/events?session=' || new.id::text
    end;
    begin
      perform private.create_role_notification(
        v_recipient.id,
        'event.started',
        'system',
        'Event attendance started',
        format('%s (%s) has started at %s.', v_event.title, v_event.event_code, v_event.venue),
        'info',
        false,
        'event',
        v_event.id,
        v_url,
        'event:started:' || new.id::text || ':' || v_recipient.id::text
      );
    exception when others then
      raise warning 'Event-start notification skipped for session %: %', new.id, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function private.notify_admin_event_started() from public, anon, authenticated;

commit;
