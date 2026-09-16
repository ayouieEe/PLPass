begin;

-- The health page reads delivery timestamps but never message bodies.
grant select (sent_at) on public.event_email_outbox to authenticated;
grant select (sent_at) on public.request_email_outbox to authenticated;

create or replace function public.admin_retry_email_job(
  p_job_id uuid,
  p_source text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_recipient text;
  v_subject text;
  v_status text;
  v_error text;
  v_created_at timestamptz;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A retry reason of at least 5 characters is required.' using errcode = '22023';
  end if;
  if p_source not in ('event_email', 'request_email') then
    raise exception 'The email job source is invalid.' using errcode = '22023';
  end if;

  if p_source = 'event_email' then
    update public.event_email_outbox
    set delivery_status = 'pending',
        error_message = null,
        attempt_count = 0,
        next_attempt_at = now(),
        processing_started_at = null,
        processing_token = null
    where id = p_job_id and delivery_status = 'failed'
    returning id, recipient_email, subject, delivery_status, error_message, created_at
    into v_id, v_recipient, v_subject, v_status, v_error, v_created_at;
  else
    update public.request_email_outbox
    set delivery_status = 'pending', error_message = null
    where id = p_job_id and delivery_status = 'failed'
    returning id, recipient_email, subject, delivery_status, error_message, created_at
    into v_id, v_recipient, v_subject, v_status, v_error, v_created_at;
  end if;

  if v_id is null then
    raise exception 'Only failed email jobs can be retried.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'system.notification_retry', 'notification_job', v_id,
    jsonb_build_object('source', p_source, 'reason', btrim(p_reason)));

  return jsonb_build_object(
    'id', v_id, 'source', p_source, 'recipient_email', v_recipient,
    'subject', v_subject, 'delivery_status', v_status,
    'error_message', v_error, 'created_at', v_created_at
  );
end;
$$;

revoke all on function public.admin_retry_email_job(uuid, text, text) from public, anon;
grant execute on function public.admin_retry_email_job(uuid, text, text) to authenticated;

create or replace function public.admin_run_data_consistency_check()
returns table (
  id text,
  severity text,
  message text,
  reference_id text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;

  return query
    select 'event-without-organizer:' || e.id::text, 'critical', 'Event has no valid organizer record.', e.id::text, now()
    from public.events e left join public.organizers o on o.id = e.organizer_id where o.id is null;

  return query
    select 'session-without-event:' || s.id::text, 'critical', 'Attendance session has no valid event record.', s.id::text, now()
    from public.event_sessions s left join public.events e on e.id = s.event_id where e.id is null;

  return query
    select 'attendance-without-session:' || a.id::text, 'critical', 'Attendance record has no valid session record.', a.id::text, now()
    from public.attendance_records a
    left join public.event_sessions es on es.id = a.event_session_id
    left join public.class_sessions cs on cs.id = a.class_session_id
    where (a.event_session_id is not null and es.id is null)
       or (a.class_session_id is not null and cs.id is null);

  return query
    select 'organizer-without-profile:' || o.id::text, 'critical', 'Organizer has no valid profile record.', o.id::text, now()
    from public.organizers o left join public.profiles p on p.id = o.profile_id where p.id is null;

  return query
    select 'student-without-relationship:' || s.id::text, 'critical', 'Student is missing a profile or academic relationship.', s.id::text, now()
    from public.students s
    left join public.profiles p on p.id = s.profile_id
    left join public.programs pr on pr.id = s.program_id
    left join public.departments d on d.id = s.department_id
    left join public.sections sec on sec.id = s.section_id
    where p.id is null or pr.id is null or d.id is null or sec.id is null;

  return query
    select 'duplicate-attendance:' || a.event_session_id::text || ':' || a.student_id::text, 'critical', 'Duplicate attendance records were found for a session and student.', a.event_session_id::text, now()
    from public.attendance_records a
    where a.event_session_id is not null
    group by a.event_session_id, a.student_id
    having count(*) > 1;

  return query
    select 'event-state-mismatch:' || e.id::text, 'warning', 'Event is marked completed while an attendance session is still ongoing.', e.id::text, now()
    from public.events e
    where e.event_status = 'completed'
      and exists (select 1 from public.event_sessions s where s.event_id = e.id and s.session_status = 'ongoing');

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'system.data_consistency_check', 'system', null, jsonb_build_object('scope', 'operational_records'));
end;
$$;

revoke all on function public.admin_run_data_consistency_check() from public, anon;
grant execute on function public.admin_run_data_consistency_check() to authenticated;

commit;
