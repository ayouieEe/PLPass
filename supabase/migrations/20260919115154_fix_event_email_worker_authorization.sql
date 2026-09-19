-- Keep the worker behind the Edge Function's JWT gateway and authenticate it
-- with the service-role secret held in Vault. This migration is intentionally
-- unapplied until remote migration history has been reconciled.
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
