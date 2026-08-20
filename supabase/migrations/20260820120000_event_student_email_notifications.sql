begin;

create table if not exists public.event_email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  event_id uuid not null references public.events(id) on delete cascade,
  notification_type text not null,
  event_revision timestamptz not null,
  subject text not null,
  body text not null,
  delivery_status text not null default 'pending',
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint event_email_outbox_email_not_blank check (btrim(recipient_email) <> ''),
  constraint event_email_outbox_type_valid check (notification_type in ('published', 'rescheduled')),
  constraint event_email_outbox_delivery_valid check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  constraint event_email_outbox_revision_unique unique (event_id, recipient_profile_id, notification_type, event_revision)
);

alter table public.event_email_outbox
  add column if not exists event_code text,
  add column if not exists event_title text,
  add column if not exists notification_type text,
  add column if not exists event_revision timestamptz;

update public.event_email_outbox outbox
set notification_type = coalesce(outbox.notification_type, 'published'),
    event_revision = coalesce(outbox.event_revision, events.created_at)
from public.events
where events.id = outbox.event_id
  and (outbox.notification_type is null or outbox.event_revision is null);

alter table public.event_email_outbox
  alter column notification_type set not null,
  alter column event_revision set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_email_outbox_type_valid'
      and conrelid = 'public.event_email_outbox'::regclass
  ) then
    alter table public.event_email_outbox
      add constraint event_email_outbox_type_valid
      check (notification_type in ('published', 'rescheduled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_email_outbox_revision_unique'
      and conrelid = 'public.event_email_outbox'::regclass
  ) then
    create unique index if not exists event_email_outbox_revision_unique
      on public.event_email_outbox (event_id, recipient_profile_id, notification_type, event_revision);
  end if;
end;
$$;

create index if not exists event_email_outbox_pending_idx
  on public.event_email_outbox (delivery_status, created_at)
  where delivery_status = 'pending';

alter table public.event_email_outbox enable row level security;
revoke all on public.event_email_outbox from anon, authenticated;
grant select, update on public.event_email_outbox to service_role;

create or replace function private.queue_event_student_email(
  p_event_id uuid,
  p_student_id uuid,
  p_notification_type text,
  p_event_revision timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_profile_id uuid;
  v_email text;
  v_event_code text;
  v_title text;
  v_venue text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_subject text;
  v_body text;
begin
  select students.profile_id, profiles.email
    into v_profile_id, v_email
  from public.students
  join public.profiles on profiles.id = students.profile_id
  where students.id = p_student_id;

  select event_code, title, venue, starts_at, ends_at
    into v_event_code, v_title, v_venue, v_starts_at, v_ends_at
  from public.events
  where id = p_event_id;

  if v_profile_id is null or v_email is null or btrim(v_email) = '' or v_event_code is null then
    return;
  end if;

  if p_notification_type = 'published' then
    v_subject := format('PLPass event published: %s', v_title);
    v_body := format(
      'You have been invited to %s (%s).%s%s%s',
      v_title,
      v_event_code,
      E'\n\nVenue: ' || v_venue,
      E'\nDate and time: ' || to_char(v_starts_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM') || ' - ' || to_char(v_ends_at at time zone 'Asia/Manila', 'HH12:MI AM'),
      E'\n\nPlease sign in to PLPass for more details.'
    );
  else
    v_subject := format('PLPass event rescheduled: %s', v_title);
    v_body := format(
      '%s (%s) has been rescheduled.%s%s%s',
      v_title,
      v_event_code,
      E'\n\nVenue: ' || v_venue,
      E'\nNew date and time: ' || to_char(v_starts_at at time zone 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM') || ' - ' || to_char(v_ends_at at time zone 'Asia/Manila', 'HH12:MI AM'),
      E'\n\nPlease sign in to PLPass for the latest details.'
    );
  end if;

  insert into public.notifications (recipient_id, notification_type, title, message, notification_status, action_url, reference_id)
  values (
    v_profile_id,
    'system',
    v_subject,
    v_body,
    'unread',
    '/student/events/' || p_event_id::text,
    p_event_id
  )
  on conflict do nothing;

  insert into public.event_email_outbox (
    recipient_profile_id,
    recipient_email,
    event_id,
    event_code,
    event_title,
    notification_type,
    event_revision,
    subject,
    body
  )
  values (v_profile_id, v_email, p_event_id, v_event_code, v_title, p_notification_type, p_event_revision, v_subject, v_body)
  on conflict (event_id, recipient_profile_id, notification_type, event_revision) do nothing;
end;
$$;

create or replace function private.queue_event_student_emails_for_event(
  p_event_id uuid,
  p_notification_type text,
  p_event_revision timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant record;
begin
  for v_participant in
    select student_id
    from public.event_participants
    where event_id = p_event_id
      and participant_status <> 'removed'
  loop
    perform private.queue_event_student_email(
      p_event_id,
      v_participant.student_id,
      p_notification_type,
      p_event_revision
    );
  end loop;
end;
$$;

drop function if exists public.queue_emails_for_event(uuid);

create function public.queue_emails_for_event(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'Event was not found.' using errcode = 'P0002';
  end if;

  perform private.queue_event_student_emails_for_event(
    p_event_id,
    'published',
    v_event.created_at
  );
end;
$$;

revoke all on function public.queue_emails_for_event(uuid) from public, anon, authenticated;
grant execute on function public.queue_emails_for_event(uuid) to service_role;

create or replace function private.queue_event_email_after_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event public.events%rowtype;
begin
  select * into v_event from public.events where id = new.event_id;
  if found and v_event.approval_status = 'approved' and v_event.event_status not in ('cancelled', 'completed') then
    perform private.queue_event_student_email(v_event.id, new.student_id, 'published', v_event.created_at);
  end if;
  return new;
end;
$$;

create or replace function private.queue_event_email_after_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.event_status <> 'cancelled'
    and (new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.venue is distinct from old.venue) then
    perform private.queue_event_student_emails_for_event(new.id, 'rescheduled', clock_timestamp());
  end if;
  return new;
end;
$$;

drop trigger if exists queue_event_email_after_participant_insert on public.event_participants;
create trigger queue_event_email_after_participant_insert
after insert on public.event_participants
for each row
execute function private.queue_event_email_after_participant_insert();

drop trigger if exists queue_event_email_after_reschedule on public.events;
create trigger queue_event_email_after_reschedule
after update of starts_at, ends_at, venue on public.events
for each row
execute function private.queue_event_email_after_reschedule();

commit;