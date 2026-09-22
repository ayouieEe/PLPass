begin;

create or replace function private.current_organizer_department_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.department_id
  from public.organizers o
  where o.profile_id = (select auth.uid())
    and o.organizer_status = 'active'
  limit 1;
$$;

revoke all on function private.current_organizer_department_id() from public;
grant execute on function private.current_organizer_department_id() to authenticated;

-- Organizers need peer profile records for managed-event coordination, but
-- profile reads remain limited to the current organizer's department. The
-- target organizer must also be active; this does not grant access to
-- unrelated departments, students outside existing organizer scope, or anon.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read
on public.profiles
for select
to authenticated
using (
  (
    id = (select auth.uid())
    and (select private.is_active_user())
  )
  or (select private.is_active_admin())
  or exists (
    select 1
    from public.students s
    where s.profile_id = profiles.id
      and (select private.organizer_can_access_student(s.id))
  )
  or (
    profiles.role = 'organizer'
    and profiles.account_status = 'active'
    and profiles.department_id = (select private.current_organizer_department_id())
    and (select private.is_active_organizer())
  )
);

-- Assigned events must not become visible to every student merely because
-- they are approved. Students may read public events or events where they
-- are explicit participants; owners and department administrators retain
-- their existing operational scopes.
drop policy if exists events_read on public.events;
create policy events_read
on public.events
for select
to authenticated
using (
  (select private.is_active_user())
  and (
    organizer_id = (select private.current_organizer_id())
    or (
      (select private.is_active_department_admin())
      and department_id = (select private.current_department_id())
    )
    or (
      (select private.current_student_id()) is not null
      and approval_status = 'approved'
      and event_status <> 'draft'
      and (
        visibility = 'public'
        or (select private.is_current_student_event_participant(events.id))
      )
    )
  )
);

-- Repair the cancellation notification trigger used by the organizer event
-- transaction. The historical function selected p.id but later referenced
-- v_participant.profile_id, which aborted cancellation after the event row was
-- updated. Keep the notification behavior and return the corrected row shape.
create or replace function private.notify_event_workflow()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_organizer_profile_id uuid;
  v_participant record;
begin
  select profile_id into v_organizer_profile_id
  from public.organizers
  where id = new.organizer_id;

  if tg_op = 'INSERT' and new.approval_status = 'pending' then
    return new;
  end if;

  if v_organizer_profile_id is not null then
    if new.approval_status is distinct from old.approval_status
      and new.approval_status in ('approved', 'rejected') then
      perform private.create_role_notification(
        v_organizer_profile_id, 'event.' || new.approval_status, 'system',
        'Event ' || initcap(new.approval_status),
        format('%s was %s.', new.title, new.approval_status), 'info',
        new.approval_status = 'rejected', 'event', new.id,
        '/organizer/events/' || new.id::text,
        'event.' || new.approval_status || ':event:' || new.id::text || ':' || new.updated_at::text
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

commit;
