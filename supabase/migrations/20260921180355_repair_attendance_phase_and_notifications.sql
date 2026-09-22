begin;

-- Persist the one-way capture step on the server. Browser session storage and
-- the Electron cache are only presentation/device fallbacks; they must never
-- be the authoritative source for an active online session.
alter table public.event_sessions
  add column if not exists attendance_capture_phase text not null default 'time_in';

alter table public.event_sessions
  drop constraint if exists event_sessions_attendance_capture_phase_check;

alter table public.event_sessions
  add constraint event_sessions_attendance_capture_phase_check
  check (attendance_capture_phase in ('time_in', 'time_out'));

-- Preserve the already-observed state for sessions that have recorded
-- check-outs before this column existed.
update public.event_sessions es
set attendance_capture_phase = 'time_out', updated_at = coalesce(es.updated_at, now())
where es.session_status = 'ongoing'
  and es.attendance_capture_phase = 'time_in'
  and exists (
    select 1
    from public.attendance_records ar
    where ar.event_session_id = es.id
      and ar.time_out is not null
  );

create or replace function public.get_event_attendance_capture_phase(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase text;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  select es.attendance_capture_phase
    into v_phase
  from public.event_sessions es
  join public.events e on e.id = es.event_id
  where es.id = p_session_id
    and e.organizer_id = private.current_organizer_id();

  if v_phase is null then
    raise exception 'The attendance session is outside this organizer scope.' using errcode = '42501';
  end if;

  return v_phase;
end;
$$;

create or replace function public.advance_event_attendance_capture_phase(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase text;
begin
  if not private.is_active_organizer() then
    raise exception 'An active organizer account is required.' using errcode = '42501';
  end if;

  update public.event_sessions es
  set attendance_capture_phase = 'time_out', updated_at = now()
  from public.events e
  where es.id = p_session_id
    and e.id = es.event_id
    and e.organizer_id = private.current_organizer_id()
    and es.session_status = 'ongoing'
  returning es.attendance_capture_phase into v_phase;

  if v_phase is null then
    raise exception 'Only an active owned attendance session can advance to Time Out.' using errcode = '22023';
  end if;

  return v_phase;
end;
$$;

revoke all on function public.get_event_attendance_capture_phase(uuid) from public, anon;
grant execute on function public.get_event_attendance_capture_phase(uuid) to authenticated;
revoke all on function public.advance_event_attendance_capture_phase(uuid) from public, anon;
grant execute on function public.advance_event_attendance_capture_phase(uuid) to authenticated;

-- Restore the helper required by notification triggers. This is deliberately
-- fail-open for preferences: notification preferences must never prevent an
-- attendance session from ending.
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
    when split_part(coalesce(p_notification_code, ''), '.', 1) in ('security', 'account', 'approval', 'escalation', 'system') then true
    else coalesce((
      select case
        when split_part(p_notification_code, '.', 1) = 'reminder' then coalesce((preferences ->> 'reminders')::boolean, true)
        when split_part(p_notification_code, '.', 1) = 'event' then coalesce((preferences ->> 'eventUpdates')::boolean, true)
        when split_part(p_notification_code, '.', 1) = 'report' then coalesce((preferences ->> 'reports')::boolean, true)
        when split_part(p_notification_code, '.', 1) = 'attendance' then coalesce((preferences ->> 'attendanceExceptions')::boolean, true)
        else true
      end
      from public.notification_preferences
      where profile_id = p_recipient_id
    ), true)
  end;
$$;

revoke all on function private.notification_preference_enabled(uuid, text, text) from public, anon, authenticated;

-- A notification is secondary work. If a malformed legacy preference or
-- delivery row is encountered, preserve the attendance/session transaction.
create or replace function private.notify_attendance_finalization()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_profile_id uuid;
  v_event_id uuid;
  v_title text;
begin
  if new.attendance_status not in ('present', 'late', 'absent')
    or (new.attendance_status is not distinct from old.attendance_status and new.finalized_at is not distinct from old.finalized_at) then
    return new;
  end if;

  select s.profile_id, es.event_id, e.title
    into v_profile_id, v_event_id, v_title
  from public.students s
  join public.event_sessions es on es.id = new.event_session_id
  join public.events e on e.id = es.event_id
  where s.id = new.student_id;

  if v_profile_id is not null then
    begin
      perform private.create_role_notification(
        v_profile_id, 'attendance.finalized', 'attendance', 'Attendance finalized',
        format('%s attendance for %s.', initcap(new.attendance_status), coalesce(v_title, 'your event')),
        case when new.attendance_status = 'absent' then 'warning' else 'info' end,
        false, 'event', v_event_id, '/student/attendance', 'attendance-finalized:' || new.id::text || ':' || new.attendance_status || ':' || coalesce(new.finalized_at::text, new.updated_at::text)
      );
    exception when others then
      raise warning 'Attendance notification skipped for record %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

commit;
