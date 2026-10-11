begin;

-- Feedback notifications are secondary to session completion. The previous
-- trigger supplied both an event ID and task ID for a single reference column,
-- causing Postgres to roll back End Session whenever feedback was created.
create or replace function private.notify_feedback_task_created()
returns trigger
language plpgsql
security definer
set search_path = public, private
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
    begin
      insert into public.notifications (
        recipient_id, notification_type, title, message, notification_status,
        action_url, reference_id, notification_code, severity, requires_action,
        related_type, dedupe_key
      ) values (
        v_profile_id, 'attendance', 'Event feedback required',
        format('Complete the required feedback for %s before the deadline.', coalesce(v_title, 'your event')),
        'unread', '/student/feedback', new.id,
        'attendance.feedback_required', 'info', true, 'event_feedback_task',
        'feedback-task:' || new.id::text
      )
      on conflict (dedupe_key) where dedupe_key is not null do update
        set notification_status = 'unread', read_at = null, requires_action = true;
    exception when others then
      raise warning 'Feedback task notification skipped for task %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_feedback_task_created() from public, anon, authenticated;

commit;
