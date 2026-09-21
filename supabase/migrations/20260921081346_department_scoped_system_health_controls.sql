begin;

grant select (last_attempt_at) on public.event_email_outbox to authenticated;

-- Department administrators may inspect only event-email failures attached to
-- events in their own department. Request-progress mail remains private.
drop policy if exists department_admin_system_health_event_email_read
  on public.event_email_outbox;
create policy department_admin_system_health_event_email_read
  on public.event_email_outbox for select to authenticated
  using (
    (select private.is_active_department_admin())
    and exists (
      select 1 from public.events e
      where e.id = event_email_outbox.event_id
        and e.department_id = (select private.current_department_id())
    )
  );

create or replace function public.department_admin_retry_event_email_job(
  p_job_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_job public.event_email_outbox;
begin
  if v_actor is null or not (select private.is_active_department_admin()) then
    raise exception 'An active department administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A retry reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select outbox.* into v_job
  from public.event_email_outbox outbox
  join public.events e on e.id = outbox.event_id
  where outbox.id = p_job_id
    and e.department_id = (select private.current_department_id())
  for update of outbox;

  if not found then
    raise exception 'The email job was not found in your department.' using errcode = 'P0002';
  end if;
  if v_job.delivery_status <> 'failed'
     or v_job.notification_type <> 'participant_added'
     or v_job.created_at < now() - interval '24 hours'
     or (v_job.last_attempt_at is not null and v_job.last_attempt_at > now() - interval '15 minutes') then
    raise exception 'This email job is not eligible for retry. Only recent failed participant invitations outside the retry cooldown can be retried.' using errcode = '22023';
  end if;

  update public.event_email_outbox
  set delivery_status = 'pending', error_message = null, attempt_count = 0,
      next_attempt_at = now(), processing_started_at = null, processing_token = null
  where id = v_job.id and delivery_status = 'failed';

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'system.notification_retry', 'notification_job', v_job.id,
    jsonb_build_object('source', 'event_email', 'event_id', v_job.event_id, 'reason', btrim(p_reason))
  );

  return jsonb_build_object(
    'id', v_job.id, 'source', 'event_email', 'recipient_email', v_job.recipient_email,
    'subject', v_job.subject, 'delivery_status', 'pending', 'created_at', v_job.created_at
  );
end;
$$;

revoke all on function public.department_admin_retry_event_email_job(uuid, text) from public, anon;
grant execute on function public.department_admin_retry_event_email_job(uuid, text) to authenticated;

-- Recovery is intentionally limited to sessions at least 30 minutes past
-- scheduled end. It closes the stale session without inferring or inserting
-- attendance records; all historical attendance is preserved.
create or replace function public.department_admin_recover_stuck_attendance_session(
  p_session_id uuid,
  p_reason text
) returns public.event_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_session public.event_sessions;
  v_now timestamptz := now();
begin
  if v_actor is null or not (select private.is_active_department_admin()) then
    raise exception 'An active department administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A recovery reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select session.* into v_session
  from public.event_sessions session
  join public.events e on e.id = session.event_id
  where session.id = p_session_id
    and session.session_status = 'ongoing'
    and session.scheduled_end < v_now - interval '30 minutes'
    and e.department_id = (select private.current_department_id())
  for update of session;

  if not found then
    raise exception 'Only a session in your department that is at least 30 minutes past its scheduled end can be recovered.' using errcode = 'P0002';
  end if;

  update public.event_sessions
  set session_status = 'completed', actual_end = v_now,
      ended_reason = btrim(p_reason), updated_at = v_now
  where id = v_session.id
  returning * into v_session;

  if not exists (
    select 1 from public.event_sessions other_session
    where other_session.event_id = v_session.event_id
      and other_session.id <> v_session.id
      and other_session.session_status = 'ongoing'
  ) then
    update public.events
    set event_status = 'completed', updated_at = v_now
    where id = v_session.event_id
      and department_id = (select private.current_department_id());
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'system.department_stuck_session_recovered', 'attendance_session', v_session.id,
    jsonb_build_object('event_id', v_session.event_id, 'department_id', (select private.current_department_id()), 'reason', btrim(p_reason), 'attendance_records_preserved', true)
  );
  return v_session;
end;
$$;

revoke all on function public.department_admin_recover_stuck_attendance_session(uuid, text) from public, anon;
grant execute on function public.department_admin_recover_stuck_attendance_session(uuid, text) to authenticated;

commit;
