begin;

-- Keep the health page read-only by default. Admins can inspect only the
-- delivery metadata needed for troubleshooting, never message bodies.
create index if not exists event_email_outbox_failed_idx
  on public.event_email_outbox (created_at desc)
  where delivery_status = 'failed';

create index if not exists request_email_outbox_failed_idx
  on public.request_email_outbox (created_at desc)
  where delivery_status = 'failed';

revoke all on public.event_email_outbox from authenticated;
grant select (
  id, recipient_email, event_id, event_code, event_title, subject, notification_type,
  delivery_status, error_message, created_at
) on public.event_email_outbox to authenticated;
grant update (
  delivery_status, error_message, next_attempt_at,
  processing_started_at, processing_token, attempt_count
) on public.event_email_outbox to authenticated;

drop policy if exists admin_system_health_event_email_read on public.event_email_outbox;
create policy admin_system_health_event_email_read on public.event_email_outbox
  for select to authenticated
  using ((select private.is_active_admin()));

drop policy if exists admin_system_health_event_email_retry on public.event_email_outbox;
create policy admin_system_health_event_email_retry on public.event_email_outbox
  for update to authenticated
  using ((select private.is_active_admin()) and delivery_status = 'failed')
  with check ((select private.is_active_admin()) and delivery_status = 'pending');

grant update (delivery_status, error_message) on public.request_email_outbox to authenticated;
grant select (
  id, recipient_email, subject, delivery_status, error_message, created_at,
  recipient_profile_id
) on public.request_email_outbox to authenticated;

drop policy if exists admin_system_health_request_email_read on public.request_email_outbox;
create policy admin_system_health_request_email_read on public.request_email_outbox
  for select to authenticated
  using ((select private.is_active_admin()) or recipient_profile_id = (select auth.uid()));

drop policy if exists admin_system_health_request_email_retry on public.request_email_outbox;
create policy admin_system_health_request_email_retry on public.request_email_outbox
  for update to authenticated
  using ((select private.is_active_admin()) and delivery_status = 'failed')
  with check ((select private.is_active_admin()) and delivery_status = 'pending');

-- Recovery is deliberately a single transaction: validate the active session,
-- mark missing participants absent, close the session, and write the audit row.
create or replace function public.admin_recover_attendance_session(
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
  v_absent_count integer;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A recovery reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select * into v_session
  from public.event_sessions
  where id = p_session_id
    and session_status = 'ongoing'
  for update;
  if not found then
    raise exception 'Only an active attendance session can be recovered.' using errcode = 'P0002';
  end if;

  insert into public.attendance_records (
    event_session_id, student_id, attendance_status, verification_method,
    recorded_at, recorded_by, remarks
  )
  select
    v_session.id, ep.student_id, 'absent', 'manual', v_now, v_actor,
    'Automatically marked absent during administrative recovery: ' || btrim(p_reason)
  from public.event_participants ep
  where ep.event_id = v_session.event_id
    and ep.participant_status <> 'removed'
    and not exists (
      select 1 from public.attendance_records ar
      where ar.event_session_id = v_session.id
        and ar.student_id = ep.student_id
    )
  on conflict (event_session_id, student_id) where event_session_id is not null do nothing;
  get diagnostics v_absent_count = row_count;

  update public.event_sessions
  set session_status = 'completed',
      actual_end = v_now,
      ended_reason = btrim(p_reason),
      updated_at = v_now
  where id = v_session.id
  returning * into v_session;

  if not exists (
    select 1 from public.event_sessions
    where event_id = v_session.event_id
      and id <> v_session.id
      and session_status = 'ongoing'
  ) then
    update public.events
    set event_status = 'completed', updated_at = v_now
    where id = v_session.event_id;
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (
    v_actor, 'system.attendance_session_recovered', 'attendance_session', v_session.id,
    jsonb_build_object('event_id', v_session.event_id, 'reason', btrim(p_reason), 'automatically_absent', v_absent_count)
  );
  return v_session;
end;
$$;

revoke all on function public.admin_recover_attendance_session(uuid, text) from public, anon;
grant execute on function public.admin_recover_attendance_session(uuid, text) to authenticated;

commit;
