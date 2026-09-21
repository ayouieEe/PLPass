-- Current-only repair: use the dedicated worker token for the scheduled
-- dispatch call. The service-role key remains inside the Edge Function for
-- its database client and is never sent by this dispatcher.
create or replace function private.dispatch_event_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker_key text;
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

  select decrypted_secret into v_worker_key
  from vault.decrypted_secrets
  where name = 'event_email_worker_api_key'
  limit 1;

  select decrypted_secret into v_function_url
  from vault.decrypted_secrets
  where name = 'event_email_worker_function_url'
  limit 1;

  if v_worker_key is null or v_function_url is null then
    raise warning 'Event email worker is not configured: dedicated worker secret or function URL is missing.';
    return;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_worker_key,
      'apikey', v_worker_key
    ),
    body := jsonb_build_object('action', 'dispatch')
  );
end;
$$;

revoke all on function private.dispatch_event_email_worker() from public, anon, authenticated;
