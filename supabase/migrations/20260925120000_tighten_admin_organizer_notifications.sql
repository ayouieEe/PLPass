begin;

-- New events are published directly by the organizer. Keep the historical
-- approval columns and rows, but remove the obsolete setting from active
-- configuration.
update public.system_settings
set notification_preferences = notification_preferences - 'eventApprovalRequired',
    updated_at = now()
where notification_preferences ? 'eventApprovalRequired';

-- Keep the notification helper as the server-side source of truth for role
-- audiences. UI filtering is intentionally not the authorization boundary.
create or replace function private.create_role_notification(
  p_recipient_id uuid,
  p_notification_code text,
  p_notification_type text,
  p_title text,
  p_message text,
  p_severity text default 'info',
  p_requires_action boolean default false,
  p_related_type text default null,
  p_reference_id uuid default null,
  p_action_url text default null,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_role text;
  v_department_id uuid;
  v_event_department_id uuid;
  v_allowed boolean := false;
begin
  select p.role, p.department_id
    into v_role, v_department_id
  from public.profiles p
  where p.id = p_recipient_id
    and (p.account_status = 'active' or p_notification_code = 'account.status_changed');

  if v_role is null then
    return null;
  end if;

  if p_notification_type not in ('attendance', 'correction', 'system', 'report')
    or p_notification_code is null or btrim(p_notification_code) = ''
    or p_severity not in ('info', 'warning', 'critical')
    or p_title is null or btrim(p_title) = ''
    or p_message is null or btrim(p_message) = '' then
    raise exception 'Invalid notification payload.' using errcode = '22023';
  end if;

  v_allowed :=
    (p_notification_code = 'account.status_changed')
    or p_notification_code like 'security.%';

  if v_role = 'admin' then
    v_allowed := v_allowed
      or p_notification_code like 'system.exception%'
      or p_notification_code like 'system.settings%'
      or p_notification_code = 'event.started';
  elsif v_role = 'department_admin' then
    v_allowed := v_allowed
      or p_notification_code like 'system.exception%'
      or p_notification_code like 'system.settings%'
      or p_notification_code = 'event.started';
  elsif v_role = 'organizer' then
    v_allowed := v_allowed
      or p_notification_code = 'correction.review_requested'
      or p_notification_code = 'event.lifecycle.unstarted';
  elsif v_role = 'student' then
    v_allowed := p_notification_code like any (array[
      'event.invited%', 'event.rescheduled%', 'event.cancelled%',
      'attendance.exception%', 'correction.%', 'credential.%',
      'reminder.%', 'account.status_changed', 'security.%'
    ]);
  else
    return null;
  end if;

  if not v_allowed then
    return null;
  end if;

  if p_notification_code = 'account.status_changed'
    and (p_related_type <> 'profile' or p_reference_id is distinct from p_recipient_id) then
    return null;
  end if;
  if p_notification_code like 'security.%'
    and (p_related_type <> 'profile' or p_reference_id is distinct from p_recipient_id) then
    return null;
  end if;

  if v_role = 'department_admin'
    and p_notification_code like 'system.%'
    and not (
      (p_related_type = 'department' and p_reference_id = v_department_id)
      or (p_related_type = 'event' and p_reference_id is not null)
    ) then
    return null;
  end if;

  if v_role = 'department_admin' and p_related_type = 'event' then
    select e.department_id into v_event_department_id
    from public.events e
    where e.id = p_reference_id;
    if v_event_department_id is null or v_event_department_id is distinct from v_department_id then
      return null;
    end if;
  end if;

  if p_notification_code = 'event.started' then
    if p_related_type <> 'event' or p_reference_id is null then
      return null;
    end if;
  elsif v_role = 'organizer' and p_notification_code = 'event.lifecycle.unstarted' then
    if p_related_type <> 'event' or not exists (
      select 1
      from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = p_reference_id and o.profile_id = p_recipient_id
    ) then
      return null;
    end if;
  elsif v_role = 'organizer' and p_notification_code = 'correction.review_requested' then
    if p_related_type <> 'event' or not exists (
      select 1
      from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = p_reference_id and o.profile_id = p_recipient_id
    ) then
      return null;
    end if;
  end if;

  if not private.notification_preference_enabled(p_recipient_id, p_notification_code, p_severity) then
    return null;
  end if;

  insert into public.notifications (
    recipient_id, notification_type, title, message, notification_status,
    action_url, reference_id, notification_code, severity, requires_action,
    related_type, dedupe_key
  ) values (
    p_recipient_id, p_notification_type, p_title, p_message, 'unread',
    p_action_url, p_reference_id, p_notification_code,
    p_severity,
    case when p_notification_code in ('account.status_changed', 'event.started') then false else p_requires_action end,
    p_related_type, p_dedupe_key
  )
  on conflict (dedupe_key) where dedupe_key is not null do update
    set title = excluded.title,
        message = excluded.message,
        severity = excluded.severity,
        requires_action = excluded.requires_action,
        action_url = excluded.action_url,
        notification_status = 'unread',
        read_at = null
  returning id into v_id;

  if v_id is null and p_dedupe_key is not null then
    select id into v_id from public.notifications where dedupe_key = p_dedupe_key;
  end if;
  return v_id;
end;
$$;

revoke all on function private.create_role_notification(uuid, text, text, text, text, text, boolean, text, uuid, text, text) from public, anon, authenticated;

-- Keep the shared event workflow trigger because it still produces student
-- cancellation notices. The tightened helper above suppresses the obsolete
-- organizer approval/reschedule/cancellation audience without deleting rows.
create or replace function private.notify_event_workflow()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant record;
begin
  -- Event creation and routine updates no longer produce approval,
  -- reschedule, or organizer cancellation notices. Keep student cancellation
  -- notices and avoid reading OLD during INSERT triggers.
  if tg_op = 'UPDATE'
    and new.event_status is distinct from old.event_status
    and new.event_status = 'cancelled' then
    for v_participant in
      select p.id as profile_id
      from public.event_participants ep
      join public.students s on s.id = ep.student_id
      join public.profiles p on p.id = s.profile_id
      where ep.event_id = new.id
        and ep.participant_status <> 'removed'
        and p.account_status = 'active'
    loop
      perform private.create_role_notification(
        v_participant.profile_id, 'event.cancelled', 'system', 'Event cancelled',
        format('%s was cancelled.', new.title), 'warning', true, 'event', new.id,
        '/student/events/' || new.id::text, 'event:cancelled:' || new.id::text || ':' || v_participant.profile_id::text
      );
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_event_workflow() from public, anon, authenticated;

-- Notify administrators only when a server-side attendance session actually
-- starts. The trigger is idempotent for a session and notification failures
-- must never roll back the session transition.
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
  if tg_op = 'UPDATE' then
    if old.actual_start is not null then
      return new;
    end if;
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
    v_url := case when v_recipient.role = 'admin' then '/admin/events/' || v_event.id::text else '/department/events' end;
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
drop trigger if exists notify_admin_event_started_after_insert on public.event_sessions;
drop trigger if exists notify_admin_event_started_after_update on public.event_sessions;
create trigger notify_admin_event_started_after_insert
after insert on public.event_sessions
for each row execute function private.notify_admin_event_started();
create trigger notify_admin_event_started_after_update
after update of actual_start on public.event_sessions
for each row execute function private.notify_admin_event_started();

commit;
