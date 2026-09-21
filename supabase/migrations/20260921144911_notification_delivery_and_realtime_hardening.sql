begin;

-- Notifications are inserted by trusted triggers and SECURITY DEFINER
-- workflows. Keep the target profile explicit, but allow every supported
-- active login role to receive a notification about itself.
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
begin
  if not exists (
    select 1 from public.profiles
    where id = p_recipient_id
      and account_status = 'active'
      and role in ('admin', 'department_admin', 'organizer', 'student')
  ) then
    return null;
  end if;

  if p_notification_type not in ('attendance', 'correction', 'system', 'report')
    or p_notification_code is null or btrim(p_notification_code) = ''
    or p_severity not in ('info', 'warning', 'critical')
    or p_title is null or btrim(p_title) = ''
    or p_message is null or btrim(p_message) = '' then
    raise exception 'Invalid notification payload.' using errcode = '22023';
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
    p_action_url, p_reference_id, p_notification_code, p_severity, p_requires_action,
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

-- Older trusted writers omitted notification_code. Classify those rows into
-- the same UI categories so they are visible to the intended role.
create or replace function private.normalize_notification_row()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_text text := lower(coalesce(new.title, '') || ' ' || coalesce(new.message, ''));
begin
  if new.notification_code is null or btrim(new.notification_code) = '' then
    new.notification_code := case
      when new.notification_type = 'attendance' then 'attendance.updated'
      when new.notification_type = 'correction' then 'correction.updated'
      when new.notification_type = 'report' then 'report.updated'
      when v_text like '%account%' or v_text like '%password%' or v_text like '%security%' then 'account.updated'
      when v_text like '%event%' or v_text like '%invited%' or v_text like '%reschedul%' then 'event.updated'
      when v_text like '%credential%' then 'credential.updated'
      when v_text like '%request%' then 'correction.updated'
      else 'legacy.' || new.notification_type
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_notification_row on public.notifications;
create trigger normalize_notification_row
before insert on public.notifications
for each row execute function private.normalize_notification_row();

create or replace function private.notify_profile_account_status_change()
returns trigger
language plpgsql security definer set search_path = public, private
as $$
begin
  if new.account_status is distinct from old.account_status then
    -- This trigger fires after the profile update. The helper intentionally
    -- skips inactive recipients, so insert this security notification here
    -- directly; otherwise the deactivation notice would be lost precisely
    -- when the account becomes inactive.
    insert into public.notifications (
      recipient_id, notification_type, title, message, notification_status,
      action_url, reference_id, notification_code, severity, requires_action,
      related_type, dedupe_key
    ) values (
      new.id, 'system', 'Account status updated',
      format('Your PLPass account status is now %s.', replace(new.account_status, '_', ' ')),
      'unread', '/profile', new.id, 'account.status_changed',
      case when new.account_status = 'active' then 'info' else 'warning' end,
      true, 'profile',
      'account-status:' || new.id::text || ':' || new.account_status || ':' || new.updated_at::text
    )
    on conflict (dedupe_key) where dedupe_key is not null do update
      set title = excluded.title,
          message = excluded.message,
          severity = excluded.severity,
          requires_action = excluded.requires_action,
          action_url = excluded.action_url,
          notification_status = 'unread',
          read_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_profile_account_status_after_update on public.profiles;
create trigger notify_profile_account_status_after_update
after update of account_status on public.profiles
for each row execute function private.notify_profile_account_status_change();

create or replace function private.notify_attendance_finalization()
returns trigger
language plpgsql security definer set search_path = public, private
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
    perform private.create_role_notification(
      v_profile_id, 'attendance.finalized', 'attendance', 'Attendance finalized',
      format('%s attendance for %s.', initcap(new.attendance_status), coalesce(v_title, 'your event')),
      case when new.attendance_status = 'absent' then 'warning' else 'info' end,
      false, 'event', v_event_id, '/student/attendance', 'attendance-finalized:' || new.id::text || ':' || new.attendance_status || ':' || coalesce(new.finalized_at::text, new.updated_at::text)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_attendance_finalization_after_update on public.attendance_records;
create trigger notify_attendance_finalization_after_update
after update of attendance_status, finalized_at on public.attendance_records
for each row execute function private.notify_attendance_finalization();

create or replace function private.notify_feedback_task_created()
returns trigger
language plpgsql security definer set search_path = public, private
as $$
declare
  v_profile_id uuid;
  v_title text;
begin
  select s.profile_id, e.title into v_profile_id, v_title
  from public.students s
  join public.events e on e.id = new.event_id
  where s.id = new.student_id;
  if v_profile_id is not null then
    perform private.create_role_notification(
      v_profile_id, 'attendance.feedback_required', 'attendance', 'Event feedback required',
      format('Complete the required feedback for %s before the deadline.', coalesce(v_title, 'your event')),
      'info', true, 'event_feedback_task', new.id, '/student/feedback', 'feedback-task:' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_feedback_task_after_insert on public.event_feedback_tasks;
create trigger notify_feedback_task_after_insert
after insert on public.event_feedback_tasks
for each row execute function private.notify_feedback_task_created();

commit;
