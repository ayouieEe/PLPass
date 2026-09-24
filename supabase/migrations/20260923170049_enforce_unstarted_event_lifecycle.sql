begin;

create or replace function private.enforce_unstarted_event_lifecycle(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reminder_minutes integer;
  v_event record;
  v_organizer_profile_id uuid;
  v_manila_today date := (p_now at time zone 'Asia/Manila')::date;
  v_cancellation_reason constant text := 'Automatically cancelled because the event was not started, rescheduled, or cancelled before the end of its scheduled Manila day.';
begin
  select greatest(0, least(1440, coalesce(
    case when coalesce(notification_preferences ->> 'noStartReminderMinutes', '') ~ '^\\d+$'
      then (notification_preferences ->> 'noStartReminderMinutes')::integer end,
    60
  )))
  into v_reminder_minutes
  from public.system_settings
  order by updated_at desc
  limit 1;

  v_reminder_minutes := coalesce(v_reminder_minutes, 60);

  -- The organizer receives a single required-action notification for each
  -- schedule. Rescheduling changes starts_at, which intentionally creates a
  -- fresh reminder for the new schedule when it becomes overdue.
  for v_event in
    select e.id, e.event_code, e.title, e.starts_at, e.organizer_id
    from public.events e
    where e.approval_status = 'approved'
      and e.event_status = 'scheduled'
      and (e.starts_at at time zone 'Asia/Manila')::date = v_manila_today
      and p_now >= e.starts_at + make_interval(mins => v_reminder_minutes)
      and not exists (
        select 1
        from public.event_sessions s
        where s.event_id = e.id
          and s.actual_start is not null
          and s.session_status <> 'cancelled'
      )
  loop
    select o.profile_id into v_organizer_profile_id
    from public.organizers o
    where o.id = v_event.organizer_id;

    if v_organizer_profile_id is not null then
      perform private.create_role_notification(
        v_organizer_profile_id,
        'event.lifecycle.unstarted',
        'system',
        'Event needs action',
        format('%s was scheduled to start at %s but attendance has not started. Reschedule or cancel it before the end of today.', v_event.title, to_char(v_event.starts_at at time zone 'Asia/Manila', 'FMHH12:MI AM')),
        'critical',
        true,
        'event',
        v_event.id,
        '/organizer/events/' || v_event.id::text || '?lifecycle=unstarted',
        'event:lifecycle:unstarted:' || v_event.id::text || ':' || v_event.starts_at::text
      );
    end if;
  end loop;

  -- Run after midnight Manila time. A started event is never auto-cancelled,
  -- even if its session has since been completed or archived.
  for v_event in
    select e.id
    from public.events e
    where e.approval_status = 'approved'
      and e.event_status = 'scheduled'
      and (e.starts_at at time zone 'Asia/Manila')::date < v_manila_today
      and not exists (
        select 1
        from public.event_sessions s
        where s.event_id = e.id
          and s.actual_start is not null
          and s.session_status <> 'cancelled'
      )
    for update of e skip locked
  loop
    update public.event_sessions
    set session_status = 'cancelled',
        actual_end = coalesce(actual_end, p_now),
        ended_reason = v_cancellation_reason,
        updated_at = p_now
    where event_id = v_event.id
      and session_status in ('scheduled', 'ongoing');

    update public.events
    set event_status = 'cancelled',
        cancellation_reason = v_cancellation_reason,
        cancelled_by = null,
        cancelled_at = p_now,
        updated_at = p_now
    where id = v_event.id
      and event_status = 'scheduled';

    insert into public.audit_logs (actor_user_id, action, target_type, target_id, metadata)
    values (
      null,
      'event.auto_cancelled_unstarted',
      'event',
      v_event.id,
      jsonb_build_object('reason', v_cancellation_reason, 'timezone', 'Asia/Manila')
    );
  end loop;
end;
$$;

revoke all on function private.enforce_unstarted_event_lifecycle(timestamptz) from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid)
from cron.job
where jobname = 'enforce-unstarted-event-lifecycle';
select cron.schedule(
  'enforce-unstarted-event-lifecycle',
  '*/5 * * * *',
  $$select private.enforce_unstarted_event_lifecycle()$$
);

commit;
