begin;

-- Quota deferral preserves the attempt count and releases a worker lease.
-- These functions are intentionally service-role-only and do not retry or
-- alter already-failed rows.
create or replace function public.defer_event_email_outbox_delivery(
  p_outbox_id uuid,
  p_processing_token uuid,
  p_defer_until timestamptz,
  p_reason text
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may defer queued email.' using errcode = '42501';
  end if;

  update public.event_email_outbox
  set delivery_status = 'pending',
      next_attempt_at = greatest(coalesce(p_defer_until, now() + interval '1 hour'), now()),
      error_message = left(coalesce(nullif(btrim(p_reason), ''), 'Email provider quota temporarily unavailable.'), 1000),
      processing_started_at = null,
      processing_token = null
  where id = p_outbox_id
    and processing_token = p_processing_token
    and delivery_status = 'processing';

  if not found then
    raise exception 'Email delivery lease was not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.defer_request_email_outbox_delivery(
  p_outbox_id uuid,
  p_processing_token uuid,
  p_defer_until timestamptz,
  p_reason text
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may defer queued email.' using errcode = '42501';
  end if;

  update public.request_email_outbox
  set delivery_status = 'pending',
      next_attempt_at = greatest(coalesce(p_defer_until, now() + interval '1 hour'), now()),
      error_message = left(coalesce(nullif(btrim(p_reason), ''), 'Email provider quota temporarily unavailable.'), 1000),
      processing_started_at = null,
      processing_token = null
  where id = p_outbox_id
    and processing_token = p_processing_token
    and delivery_status = 'processing';

  if not found then
    raise exception 'Email delivery lease was not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.defer_event_email_outbox_delivery(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.defer_request_email_outbox_delivery(uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.defer_event_email_outbox_delivery(uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.defer_request_email_outbox_delivery(uuid, uuid, timestamptz, text) to service_role;

-- Reserve the daily budget while a row is processing.  The common advisory
-- lock makes claims from both outboxes serializable without a counter table.
create or replace function public.claim_event_email_outbox_batch_with_daily_cap(
  p_limit integer default 25,
  p_daily_cap integer default 250
)
returns table (
  id uuid,
  recipient_email text,
  subject text,
  body text,
  html_body text,
  processing_token uuid
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_reserved integer := 0;
  v_limit integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plpass_email_daily_budget', 0));
  select count(*) into v_reserved
  from (
    select id from public.event_email_outbox
    where (delivery_status = 'sent' and sent_at >= v_day_start)
       or (delivery_status = 'processing' and processing_started_at >= v_day_start)
    union all
    select id from public.request_email_outbox
    where (delivery_status = 'sent' and sent_at >= v_day_start)
       or (delivery_status = 'processing' and processing_started_at >= v_day_start)
  ) as reserved;
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50, greatest(coalesce(p_daily_cap, 250), 0) - v_reserved);
  if v_limit <= 0 then return; end if;
  return query select * from public.claim_event_email_outbox_batch(v_limit);
end;
$$;

create or replace function public.claim_request_email_outbox_batch_with_daily_cap(
  p_limit integer default 25,
  p_daily_cap integer default 250
)
returns table (
  id uuid,
  recipient_email text,
  subject text,
  body text,
  processing_token uuid
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_reserved integer := 0;
  v_limit integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plpass_email_daily_budget', 0));
  select count(*) into v_reserved
  from (
    select id from public.event_email_outbox
    where (delivery_status = 'sent' and sent_at >= v_day_start)
       or (delivery_status = 'processing' and processing_started_at >= v_day_start)
    union all
    select id from public.request_email_outbox
    where (delivery_status = 'sent' and sent_at >= v_day_start)
       or (delivery_status = 'processing' and processing_started_at >= v_day_start)
  ) as reserved;
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50, greatest(coalesce(p_daily_cap, 250), 0) - v_reserved);
  if v_limit <= 0 then return; end if;
  return query select * from public.claim_request_email_outbox_batch(v_limit);
end;
$$;

-- A quota response should quiet the entire due queue, not merely the first
-- claimed batch. Failed rows are deliberately excluded and remain untouched.
create or replace function public.defer_due_email_outbox_deliveries(
  p_defer_until timestamptz,
  p_reason text
)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count integer := 0;
  v_updated integer := 0;
  v_until timestamptz := greatest(coalesce(p_defer_until, now() + interval '1 hour'), now());
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Email delivery temporarily deferred.'), 1000);
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may defer queued email.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plpass_email_daily_budget', 0));
  update public.event_email_outbox
  set next_attempt_at = v_until, error_message = v_reason
  where delivery_status = 'pending' and next_attempt_at <= now();
  get diagnostics v_count = row_count;
  update public.request_email_outbox
  set next_attempt_at = v_until, error_message = v_reason
  where delivery_status = 'pending' and next_attempt_at <= now();
  get diagnostics v_updated = row_count;
  v_count := v_count + v_updated;
  return v_count;
end;
$$;

revoke all on function public.claim_event_email_outbox_batch_with_daily_cap(integer, integer) from public, anon, authenticated;
revoke all on function public.claim_request_email_outbox_batch_with_daily_cap(integer, integer) from public, anon, authenticated;
revoke all on function public.defer_due_email_outbox_deliveries(timestamptz, text) from public, anon, authenticated;
grant execute on function public.claim_event_email_outbox_batch_with_daily_cap(integer, integer) to service_role;
grant execute on function public.claim_request_email_outbox_batch_with_daily_cap(integer, integer) to service_role;
grant execute on function public.defer_due_email_outbox_deliveries(timestamptz, text) to service_role;

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
  v_last_attempt_at timestamptz;
  v_notification_type text;
begin
  if not (select private.is_active_admin()) then
    raise exception 'An active administrator account is required.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'A retry reason of at least 5 characters is required.' using errcode = '22023';
  end if;
  if p_source is distinct from 'event_email' then
    raise exception 'Only recent participant invitation email jobs may be retried.' using errcode = '22023';
  end if;

  if p_source = 'event_email' then
    select recipient_email, subject, delivery_status, error_message, created_at, last_attempt_at, notification_type
      into v_recipient, v_subject, v_status, v_error, v_created_at, v_last_attempt_at, v_notification_type
    from public.event_email_outbox
    where id = p_job_id;
    if v_status is distinct from 'failed' then
      raise exception 'Only failed email jobs can be retried.' using errcode = 'P0002';
    end if;
    if v_notification_type <> 'participant_added' then
      raise exception 'Only participant invitation email jobs may be retried.' using errcode = '22023';
    end if;
    if v_created_at < now() - interval '24 hours' then
      raise exception 'Only email jobs created within the last 24 hours can be retried.' using errcode = '22023';
    end if;
    if v_last_attempt_at is not null and v_last_attempt_at > now() - interval '15 minutes' then
      raise exception 'This email job is still within its retry cooldown.' using errcode = '55006';
    end if;
    update public.event_email_outbox
    set delivery_status = 'pending', error_message = null, attempt_count = 0,
        next_attempt_at = now(), processing_started_at = null, processing_token = null
    where id = p_job_id and delivery_status = 'failed' and notification_type = 'participant_added'
    returning id into v_id;
  else
    select recipient_email, subject, delivery_status, error_message, created_at, last_attempt_at
      into v_recipient, v_subject, v_status, v_error, v_created_at, v_last_attempt_at
    from public.request_email_outbox
    where id = p_job_id;
    if v_status is distinct from 'failed' then
      raise exception 'Only failed email jobs can be retried.' using errcode = 'P0002';
    end if;
    if v_created_at < now() - interval '24 hours' then
      raise exception 'Only email jobs created within the last 24 hours can be retried.' using errcode = '22023';
    end if;
    if v_last_attempt_at is not null and v_last_attempt_at > now() - interval '15 minutes' then
      raise exception 'This email job is still within its retry cooldown.' using errcode = '55006';
    end if;
    update public.request_email_outbox
    set delivery_status = 'pending', error_message = null, attempt_count = 0,
        next_attempt_at = now(), processing_started_at = null, processing_token = null
    where id = p_job_id and delivery_status = 'failed'
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'Only failed email jobs can be retried.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs(actor_user_id, action, target_type, target_id, metadata)
  values (v_actor, 'system.notification_retry', 'notification_job', v_id,
    jsonb_build_object('source', p_source, 'reason', btrim(p_reason)));

  return jsonb_build_object(
    'id', v_id, 'source', p_source, 'recipient_email', v_recipient,
    'subject', v_subject, 'delivery_status', 'pending',
    'error_message', v_error, 'created_at', v_created_at
  );
end;
$$;

revoke all on function public.admin_retry_email_job(uuid, text, text) from public, anon;
grant execute on function public.admin_retry_email_job(uuid, text, text) to authenticated;

-- Direct Data API updates would bypass the RPC's age, type, and cooldown
-- controls. Keep the RPC as the only authenticated retry path.
revoke update on public.event_email_outbox from public, anon, authenticated;
revoke update on public.request_email_outbox from public, anon, authenticated;
drop policy if exists admin_system_health_event_email_retry on public.event_email_outbox;
drop policy if exists admin_system_health_request_email_retry on public.request_email_outbox;

-- Request-progress notifications use the same scheduled Edge worker. Do not
-- skip a cron run merely because the event-email queue is empty.
create or replace function private.dispatch_event_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_role_key text;
  v_function_url text;
begin
  if not exists (
    select 1
    from public.event_email_outbox
    where (delivery_status = 'pending' and next_attempt_at <= now())
       or (delivery_status = 'processing' and processing_started_at <= now() - interval '5 minutes')
  ) and not exists (
    select 1
    from public.request_email_outbox
    where (delivery_status = 'pending' and next_attempt_at <= now())
       or (delivery_status = 'processing' and processing_started_at <= now() - interval '5 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'event_email_worker_service_role_key'
  limit 1;

  select decrypted_secret into v_function_url
  from vault.decrypted_secrets
  where name = 'event_email_worker_function_url'
  limit 1;

  if v_service_role_key is null or v_function_url is null then
    raise warning 'Event email worker is not configured: required Vault secrets are missing.';
    return;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key,
      'apikey', v_service_role_key
    ),
    body := jsonb_build_object('action', 'dispatch')
  );
end;
$$;

commit;
