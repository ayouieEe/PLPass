begin;

-- Keep student event lists live when another role adds or changes an invitation.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_participants'
  ) then
    alter publication supabase_realtime add table public.event_participants;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_sessions'
  ) then
    alter publication supabase_realtime add table public.event_sessions;
  end if;
end;
$$;

-- The historical email trigger still writes a legacy notification row. Add the
-- authoritative role-scoped row as well, so reschedules are visible in the
-- student notification feed and carry the correct event category.
create or replace function private.notify_student_event_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_participant record;
  v_code text;
  v_title text;
  v_message text;
begin
  if tg_op = 'INSERT' then
    if new.approval_status <> 'approved' then
      return new;
    end if;
    v_code := 'event.invited';
    v_title := 'Event invitation';
    v_message := format('You have been invited to %s.', new.title);
  elsif new.event_status = 'cancelled'
    and new.event_status is distinct from old.event_status then
    v_code := 'event.cancelled';
    v_title := 'Event cancelled';
    v_message := format('%s was cancelled.', new.title);
  elsif new.event_status <> 'cancelled'
    and (new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.venue is distinct from old.venue) then
    v_code := 'event.rescheduled';
    v_title := 'Event rescheduled';
    v_message := format('%s has a schedule or venue update.', new.title);
  else
    return new;
  end if;

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
      v_participant.profile_id,
      v_code,
      'system',
      v_title,
      v_message,
      case when v_code = 'event.cancelled' then 'warning' else 'info' end,
      v_code <> 'event.rescheduled',
      'event',
      new.id,
      '/student/events/' || new.id::text,
      v_code || ':student:' || v_participant.profile_id::text || ':' || new.updated_at::text
    );
  end loop;
  return new;
end;
$$;

revoke all on function private.notify_student_event_change() from public, anon, authenticated;

drop trigger if exists notify_student_event_change_after_insert on public.events;
create trigger notify_student_event_change_after_insert
after insert on public.events
for each row execute function private.notify_student_event_change();

drop trigger if exists notify_student_event_change_after_update on public.events;
create trigger notify_student_event_change_after_update
after update of approval_status, event_status, starts_at, ends_at, venue on public.events
for each row execute function private.notify_student_event_change();

-- Invitation rows created by the trusted participant workflow must be visible
-- as event notifications even though the older email helper remains in place.
create or replace function private.notify_student_event_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_profile_id uuid;
  v_title text;
begin
  if new.participant_status = 'removed' then
    return new;
  end if;
  select s.profile_id, e.title into v_profile_id, v_title
  from public.students s
  join public.events e on e.id = new.event_id
  where s.id = new.student_id and e.approval_status = 'approved' and e.event_status <> 'cancelled';
  if v_profile_id is not null then
    perform private.create_role_notification(
      v_profile_id, 'event.invited', 'system', 'Event invitation',
      format('You have been invited to %s.', v_title), 'info', false,
      'event', new.event_id, '/student/events/' || new.event_id::text,
      'event:invited:student:' || v_profile_id::text || ':' || new.event_id::text
    );
  end if;
  return new;
end;
$$;

revoke all on function private.notify_student_event_invitation() from public, anon, authenticated;

drop trigger if exists notify_student_event_invitation_after_insert on public.event_participants;
create trigger notify_student_event_invitation_after_insert
after insert on public.event_participants
for each row execute function private.notify_student_event_invitation();

drop trigger if exists notify_student_event_invitation_after_update on public.event_participants;
create trigger notify_student_event_invitation_after_update
after update of participant_status on public.event_participants
for each row when (old.participant_status = 'removed' and new.participant_status <> 'removed')
execute function private.notify_student_event_invitation();

commit;
