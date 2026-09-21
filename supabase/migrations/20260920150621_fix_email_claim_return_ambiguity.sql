-- Current-only repair: qualify the final claimed-row projection. The
-- functions expose an output column named id, so SELECT * can be ambiguous.
create or replace function public.claim_event_email_outbox_batch(p_limit integer default 25)
returns table (id uuid, recipient_email text, subject text, body text, html_body text, processing_token uuid)
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;
  update public.event_email_outbox
  set delivery_status = case when attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = case when attempt_count >= 5 then next_attempt_at else now() end,
      processing_started_at = null,
      processing_token = null,
      error_message = coalesce(error_message, 'Email worker lease expired.')
  where delivery_status = 'processing' and processing_started_at < now() - interval '5 minutes';
  return query
  with candidates as (
    select outbox.id from public.event_email_outbox outbox
    where outbox.delivery_status = 'pending' and outbox.next_attempt_at <= now()
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ), claimed as (
    update public.event_email_outbox outbox
    set delivery_status = 'processing', processing_started_at = now(),
        processing_token = gen_random_uuid(), last_attempt_at = now(),
        attempt_count = outbox.attempt_count + 1
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.recipient_email, outbox.subject, outbox.body,
      outbox.html_body, outbox.processing_token
  )
  select c.id, c.recipient_email, c.subject, c.body, c.html_body, c.processing_token
  from claimed c;
end;
$$;

create or replace function public.claim_request_email_outbox_batch(p_limit integer default 25)
returns table (id uuid, recipient_email text, subject text, body text, processing_token uuid)
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;
  update public.request_email_outbox
  set delivery_status = 'pending', processing_started_at = null, processing_token = null,
      error_message = coalesce(error_message, 'Email worker lease expired.')
  where delivery_status = 'processing' and processing_started_at < now() - interval '5 minutes';
  return query
  with candidates as (
    select outbox.id from public.request_email_outbox outbox
    where outbox.delivery_status = 'pending' and outbox.next_attempt_at <= now()
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ), claimed as (
    update public.request_email_outbox outbox
    set delivery_status = 'processing', processing_started_at = now(),
        processing_token = gen_random_uuid(), last_attempt_at = now(),
        attempt_count = outbox.attempt_count + 1
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.recipient_email, outbox.subject, outbox.body, outbox.processing_token
  )
  select c.id, c.recipient_email, c.subject, c.body, c.processing_token
  from claimed c;
end;
$$;

revoke all on function public.claim_event_email_outbox_batch(integer) from public, anon, authenticated;
revoke all on function public.claim_request_email_outbox_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_event_email_outbox_batch(integer) to service_role;
grant execute on function public.claim_request_email_outbox_batch(integer) to service_role;
