-- Refine notification audiences, preference storage, and retry-safe creation.
-- Existing notification rows are intentionally preserved as legacy notifications.

alter table public.notifications
  add column if not exists notification_code text,
  add column if not exists severity text not null default 'info',
  add column if not exists requires_action boolean not null default false,
  add column if not exists related_type text,
  add column if not exists dedupe_key text;

update public.notifications
set notification_code = coalesce(notification_code, 'legacy.' || notification_type)
where notification_code is null;

alter table public.notifications
  alter column notification_code set not null;

create or replace function private.normalize_notification_row()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  if new.notification_code is null or btrim(new.notification_code) = '' then
    new.notification_code := 'legacy.' || new.notification_type;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_notification_row on public.notifications;
create trigger normalize_notification_row
before insert on public.notifications
for each row execute function private.normalize_notification_row();

alter table public.notifications
  drop constraint if exists notifications_severity_valid;
alter table public.notifications
  add constraint notifications_severity_valid
  check (severity in ('info', 'warning', 'critical'));

create unique index if not exists notifications_dedupe_key_unique
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_recipient_code_created_idx
  on public.notifications (recipient_id, notification_code, created_at desc);

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{"reminders": true, "eventUpdates": true, "reports": true, "attendanceExceptions": true}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_object check (jsonb_typeof(preferences) = 'object')
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

drop policy if exists notification_preferences_read_self on public.notification_preferences;
create policy notification_preferences_read_self on public.notification_preferences
  for select to authenticated
  using (profile_id = (select auth.uid()));

drop policy if exists notification_preferences_insert_self on public.notification_preferences;
create policy notification_preferences_insert_self on public.notification_preferences
  for insert to authenticated
  with check (profile_id = (select auth.uid()));

drop policy if exists notification_preferences_update_self on public.notification_preferences;
create policy notification_preferences_update_self on public.notification_preferences
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create or replace function private.notification_preference_enabled(
  p_recipient_id uuid,
  p_notification_code text,
  p_severity text
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when p_severity = 'critical' then true
    when split_part(p_notification_code, '.', 1) in ('security', 'account', 'approval', 'escalation', 'system') then true
    else coalesce((
      select case
        when split_part(p_notification_code, '.', 1) = 'reminder' then (preferences ->> 'reminders')::boolean
        when split_part(p_notification_code, '.', 1) = 'event' then (preferences ->> 'eventUpdates')::boolean
        when split_part(p_notification_code, '.', 1) = 'report' then (preferences ->> 'reports')::boolean
        when split_part(p_notification_code, '.', 1) = 'attendance' then (preferences ->> 'attendanceExceptions')::boolean
        else true
      end
      from public.notification_preferences
      where profile_id = p_recipient_id
    ), true)
  end;
$$;

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
  v_role text;
  v_id uuid;
  v_prefix text := split_part(p_notification_code, '.', 1);
begin
  select role into v_role
  from public.profiles
  where id = p_recipient_id and account_status = 'active';

  if v_role is null then
    return null;
  end if;

  if p_notification_type not in ('attendance', 'correction', 'system', 'report')
    or p_severity not in ('info', 'warning', 'critical')
    or btrim(p_title) = ''
    or btrim(p_message) = '' then
    raise exception 'Invalid notification payload.' using errcode = '22023';
  end if;

  if v_role = 'student' and not (p_notification_code like any (array[
    'event.invited%', 'event.rescheduled%', 'event.cancelled%', 'attendance.exception%',
    'correction.%', 'credential.%', 'reminder.%', 'account.%', 'security.%'
  ])) then
    return null;
  elsif v_role = 'organizer' and not (p_notification_code like any (array[
    'event.%', 'attendance.exception%', 'correction.%', 'report.%', 'reminder.%', 'account.%', 'security.%'
  ])) then
    return null;
  elsif v_role = 'admin' and not (p_notification_code like any (array[
    'security.%', 'account.%', 'approval.%', 'escalation.%', 'system.exception%', 'system.settings%'
  ])) then
    return null;
  elsif v_role not in ('student', 'organizer', 'admin') then
    return null;
  end if;

  if v_role = 'organizer' and p_reference_id is not null and p_related_type = 'event'
    and not exists (
      select 1
      from public.events e
      join public.organizers o on o.id = e.organizer_id
      where e.id = p_reference_id and o.profile_id = p_recipient_id
    ) then
    return null;
  end if;

  if not private.notification_preference_enabled(p_recipient_id, p_notification_code, p_severity) then
    return null;
  end if;

  if p_dedupe_key is null then
    insert into public.notifications (
      recipient_id, notification_type, title, message, notification_status,
      action_url, reference_id, notification_code, severity, requires_action,
      related_type, dedupe_key
    )
    values (
      p_recipient_id, p_notification_type, p_title, p_message, 'unread',
      p_action_url, p_reference_id, p_notification_code, p_severity, p_requires_action,
      p_related_type, null
    )
    returning id into v_id;
  else
    insert into public.notifications (
      recipient_id, notification_type, title, message, notification_status,
      action_url, reference_id, notification_code, severity, requires_action,
      related_type, dedupe_key
    )
    values (
      p_recipient_id, p_notification_type, p_title, p_message, 'unread',
      p_action_url, p_reference_id, p_notification_code, p_severity, p_requires_action,
      p_related_type, p_dedupe_key
    )
    on conflict (dedupe_key) where dedupe_key is not null do update
      set title = excluded.title,
          message = excluded.message,
          severity = excluded.severity,
          requires_action = excluded.requires_action,
          action_url = excluded.action_url
    returning id into v_id;
  end if;

  if v_id is null and p_dedupe_key is not null then
    select id into v_id from public.notifications where dedupe_key = p_dedupe_key;
  end if;
  return v_id;
end;
$$;

revoke all on function private.create_role_notification(uuid, text, text, text, text, text, boolean, text, uuid, text, text) from public, anon, authenticated;
revoke all on function private.notification_preference_enabled(uuid, text, text) from public, anon, authenticated;

create or replace function private.notify_event_workflow()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_organizer_profile_id uuid;
  v_participant record;
  v_code text;
  v_title text;
  v_message text;
begin
  select profile_id into v_organizer_profile_id
  from public.organizers
  where id = new.organizer_id;

  if tg_op = 'INSERT' and new.approval_status = 'pending' then
    for v_participant in select id from public.profiles where role = 'admin' and account_status = 'active' loop
      perform private.create_role_notification(
        v_participant.id, 'approval.event_pending', 'system', 'Event approval required',
        format('%s requires administrative review.', new.title), 'warning', true,
        'event', new.id, '/admin', 'approval:event:' || new.id::text
      );
    end loop;
    return new;
  end if;

  if v_organizer_profile_id is not null then
    if new.approval_status is distinct from old.approval_status
      and new.approval_status in ('approved', 'rejected') then
      v_code := 'event.' || new.approval_status;
      v_title := 'Event ' || initcap(new.approval_status);
      v_message := format('%s was %s.', new.title, new.approval_status);
      perform private.create_role_notification(
        v_organizer_profile_id, v_code, 'system', v_title, v_message, 'info',
        new.approval_status = 'rejected', 'event', new.id, '/organizer/events/' || new.id::text,
        v_code || ':event:' || new.id::text || ':' || new.updated_at::text
      );
    end if;

    if new.event_status is distinct from old.event_status and new.event_status = 'cancelled' then
      perform private.create_role_notification(
        v_organizer_profile_id, 'event.cancelled', 'system', 'Event cancelled',
        format('%s was cancelled.', new.title), 'warning', true, 'event', new.id,
        '/organizer/events/' || new.id::text, 'event:cancelled:' || new.id::text || ':' || new.updated_at::text
      );
    elsif (new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.venue is distinct from old.venue)
      and new.event_status <> 'cancelled' then
      perform private.create_role_notification(
        v_organizer_profile_id, 'event.rescheduled', 'system', 'Event rescheduled',
        format('%s has a schedule or venue update.', new.title), 'info', false, 'event', new.id,
        '/organizer/events/' || new.id::text, 'event:rescheduled:' || new.id::text || ':' || new.updated_at::text
      );
    end if;
  end if;

  if new.event_status is distinct from old.event_status and new.event_status = 'cancelled' then
    for v_participant in
      select p.id
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

drop trigger if exists notify_event_workflow_after_insert on public.events;
create trigger notify_event_workflow_after_insert
after insert on public.events
for each row execute function private.notify_event_workflow();

drop trigger if exists notify_event_workflow_after_update on public.events;
create trigger notify_event_workflow_after_update
after update of approval_status, event_status, starts_at, ends_at, venue on public.events
for each row execute function private.notify_event_workflow();

create or replace function private.notify_organizer_correction_request()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_id uuid;
  v_organizer_profile_id uuid;
  v_event_title text;
begin
  select es.event_id, e.title, o.profile_id
    into v_event_id, v_event_title, v_organizer_profile_id
  from public.attendance_records ar
  join public.event_sessions es on es.id = ar.event_session_id
  join public.events e on e.id = es.event_id
  join public.organizers o on o.id = e.organizer_id
  where ar.id = new.attendance_record_id;

  if v_event_id is not null and v_organizer_profile_id is not null then
    perform private.create_role_notification(
      v_organizer_profile_id, 'correction.review_requested', 'correction',
      'Correction request needs review', format('A correction request was submitted for %s.', v_event_title),
      'warning', true, 'event', v_event_id, '/organizer/corrections', 'correction:created:' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_organizer_correction_request_after_insert on public.attendance_requests;
create trigger notify_organizer_correction_request_after_insert
after insert on public.attendance_requests
for each row execute function private.notify_organizer_correction_request();
