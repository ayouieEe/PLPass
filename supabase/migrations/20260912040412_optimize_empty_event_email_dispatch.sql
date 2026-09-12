begin;

-- Do not invoke an Edge Function when there is no due email and no abandoned
-- processing lease to recover. The existing minute schedule remains intact.
create or replace function private.dispatch_event_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_api_key text;
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

  select decrypted_secret into v_api_key
  from vault.decrypted_secrets
  where name = 'event_email_worker_api_key'
  limit 1;

  select decrypted_secret into v_function_url
  from vault.decrypted_secrets
  where name = 'event_email_worker_function_url'
  limit 1;

  if v_api_key is null or v_function_url is null then
    raise warning 'Event email worker is not configured: missing required Vault secret.';
    return;
  end if;

  perform net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_api_key
    ),
    body := jsonb_build_object('action', 'dispatch')
  );
end;
$$;

commit;
