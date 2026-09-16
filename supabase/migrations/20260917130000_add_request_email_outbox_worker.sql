begin;

alter table public.request_email_outbox
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_token uuid,
  add column if not exists last_attempt_at timestamptz;

alter table public.request_email_outbox
  drop constraint if exists request_email_outbox_delivery_valid,
  add constraint request_email_outbox_delivery_valid
    check (delivery_status in ('pending', 'processing', 'sent', 'failed', 'skipped'));

create index if not exists request_email_outbox_due_idx
  on public.request_email_outbox (next_attempt_at, created_at)
  where delivery_status = 'pending';

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
  where delivery_status = 'processing'
    and processing_started_at < now() - interval '5 minutes';

  return query
  with candidates as (
    select outbox.id
    from public.request_email_outbox outbox
    where outbox.delivery_status = 'pending'
      and outbox.next_attempt_at <= now()
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
  select * from claimed;
end;
$$;

create or replace function public.complete_request_email_outbox_delivery(
  p_outbox_id uuid, p_processing_token uuid, p_provider_message_id text default null
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may complete queued email.' using errcode = '42501';
  end if;
  update public.request_email_outbox
  set delivery_status = 'sent', sent_at = now(),
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      error_message = null, processing_started_at = null, processing_token = null
  where id = p_outbox_id and processing_token = p_processing_token;
  if not found then raise exception 'Email delivery lease was not found.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.fail_request_email_outbox_delivery(
  p_outbox_id uuid, p_processing_token uuid, p_error_message text
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare v_attempt_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may update queued email.' using errcode = '42501';
  end if;
  select attempt_count into v_attempt_count
  from public.request_email_outbox
  where id = p_outbox_id and processing_token = p_processing_token for update;
  if not found then raise exception 'Email delivery lease was not found.' using errcode = 'P0002'; end if;
  update public.request_email_outbox
  set delivery_status = case when v_attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = case v_attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        when 3 then now() + interval '15 minutes'
        when 4 then now() + interval '1 hour'
        else now() + interval '4 hours' end,
      error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'Email delivery failed.'), 1000),
      processing_started_at = null, processing_token = null
  where id = p_outbox_id;
end;
$$;

revoke all on function public.claim_request_email_outbox_batch(integer) from public, anon, authenticated;
revoke all on function public.complete_request_email_outbox_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_request_email_outbox_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_request_email_outbox_batch(integer) to service_role;
grant execute on function public.complete_request_email_outbox_delivery(uuid, uuid, text) to service_role;
grant execute on function public.fail_request_email_outbox_delivery(uuid, uuid, text) to service_role;

commit;
