begin;

-- The existing create and metadata RPCs are individually authorized. Calling
-- both from this single wrapper keeps their writes in one PostgreSQL
-- transaction: an error in the metadata step rolls back the event and every
-- related row created by the first step.
create or replace function public.create_organizer_event_with_metadata(
  p_event_code text,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_venue text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_priority_level text,
  p_impact_score numeric,
  p_visibility text,
  p_participant_ids uuid[],
  p_objectives text[],
  p_resource_title text default null,
  p_resource_url text default null,
  p_publish_reason text default 'Published by event organizer',
  p_requested_by text default null,
  p_college_office text default null,
  p_number_of_pax integer default null,
  p_institutional_category text default null,
  p_participation_status text default null,
  p_target_group text default null,
  p_urgency_points integer default 0,
  p_priority_score integer default 0,
  p_priority_tier text default 'Low',
  p_fixed_priority boolean default false
) returns public.events
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.events;
begin
  select * into v_event
  from public.create_organizer_event(
    p_event_code, p_category_id, p_title, p_description, p_venue,
    p_starts_at, p_ends_at, p_priority_level, p_impact_score, p_visibility,
    p_participant_ids, p_objectives, p_resource_title, p_resource_url,
    p_publish_reason
  );

  select * into v_event
  from public.update_organizer_event_metadata(
    v_event.id, p_requested_by, p_college_office, p_number_of_pax,
    p_institutional_category, p_participation_status, p_target_group,
    p_urgency_points, p_priority_score, p_priority_tier, p_fixed_priority
  );

  return v_event;
end;
$$;

revoke all on function public.create_organizer_event_with_metadata(
  text, uuid, text, text, text, timestamptz, timestamptz, text, numeric,
  text, uuid[], text[], text, text, text, text, text, integer, text, text,
  text, integer, integer, text, boolean
) from public, anon;
grant execute on function public.create_organizer_event_with_metadata(
  text, uuid, text, text, text, timestamptz, timestamptz, text, numeric,
  text, uuid[], text[], text, text, text, text, text, integer, text, text,
  text, integer, integer, text, boolean
) to authenticated;

alter table public.event_email_outbox
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_token uuid,
  add column if not exists last_attempt_at timestamptz;

alter table public.event_email_outbox
  drop constraint if exists event_email_outbox_attempt_count_valid,
  add constraint event_email_outbox_attempt_count_valid check (attempt_count between 0 and 5),
  drop constraint if exists event_email_outbox_delivery_valid,
  add constraint event_email_outbox_delivery_valid
    check (delivery_status in ('pending', 'processing', 'sent', 'failed', 'skipped'));

create index if not exists event_email_outbox_due_idx
  on public.event_email_outbox (next_attempt_at, created_at)
  where delivery_status = 'pending';

-- This RPC is only available to the service-role client used by the worker.
-- SKIP LOCKED makes overlapping scheduled invocations safe.
create or replace function public.claim_event_email_outbox_batch(p_limit integer default 25)
returns table (
  id uuid,
  recipient_email text,
  subject text,
  body text,
  html_body text,
  processing_token uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may claim queued email.' using errcode = '42501';
  end if;

  -- A crashed worker leaves a lease behind. Make it available again after
  -- five minutes; the next claim counts as its next delivery attempt.
  update public.event_email_outbox
  set delivery_status = case when attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = case when attempt_count >= 5 then next_attempt_at else now() end,
      processing_started_at = null,
      processing_token = null,
      error_message = coalesce(error_message, 'Email worker lease expired.')
  where delivery_status = 'processing'
    and processing_started_at < now() - interval '5 minutes';

  return query
  with candidates as (
    select outbox.id
    from public.event_email_outbox outbox
    where outbox.delivery_status = 'pending'
      and outbox.next_attempt_at <= now()
    order by outbox.next_attempt_at, outbox.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ), claimed as (
    update public.event_email_outbox outbox
    set delivery_status = 'processing',
        processing_started_at = now(),
        processing_token = gen_random_uuid(),
        last_attempt_at = now(),
        attempt_count = outbox.attempt_count + 1
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.recipient_email, outbox.subject, outbox.body,
      outbox.html_body, outbox.processing_token
  )
  select * from claimed;
end;
$$;

create or replace function public.complete_event_email_outbox_delivery(
  p_outbox_id uuid,
  p_processing_token uuid,
  p_provider_message_id text default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may complete queued email.' using errcode = '42501';
  end if;

  update public.event_email_outbox
  set delivery_status = 'sent',
      sent_at = now(),
      provider_message_id = nullif(btrim(p_provider_message_id), ''),
      error_message = null,
      processing_started_at = null,
      processing_token = null
  where id = p_outbox_id
    and delivery_status = 'processing'
    and processing_token = p_processing_token;

  if not found then
    raise exception 'Email delivery lease was not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.fail_event_email_outbox_delivery(
  p_outbox_id uuid,
  p_processing_token uuid,
  p_error_message text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the email worker may update queued email.' using errcode = '42501';
  end if;

  select attempt_count into v_attempt_count
  from public.event_email_outbox
  where id = p_outbox_id
    and delivery_status = 'processing'
    and processing_token = p_processing_token
  for update;

  if not found then
    raise exception 'Email delivery lease was not found.' using errcode = 'P0002';
  end if;

  update public.event_email_outbox
  set delivery_status = case when v_attempt_count >= 5 then 'failed' else 'pending' end,
      next_attempt_at = case v_attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        when 3 then now() + interval '15 minutes'
        when 4 then now() + interval '1 hour'
        else now() + interval '4 hours'
      end,
      error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'Email delivery failed.'), 1000),
      processing_started_at = null,
      processing_token = null
  where id = p_outbox_id;
end;
$$;

revoke all on function public.claim_event_email_outbox_batch(integer) from public, anon, authenticated;
revoke all on function public.complete_event_email_outbox_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fail_event_email_outbox_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_event_email_outbox_batch(integer) to service_role;
grant execute on function public.complete_event_email_outbox_delivery(uuid, uuid, text) to service_role;
grant execute on function public.fail_event_email_outbox_delivery(uuid, uuid, text) to service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- The service-role key is deliberately read from Supabase Vault rather than
-- hard-coded in SQL. See the deployment note for creating this secret.
create or replace function private.dispatch_event_email_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service_role_key text;
begin
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'event_email_worker_service_role_key'
  limit 1;

  if v_service_role_key is null then
    raise warning 'Event email worker is not configured: missing Vault secret event_email_worker_service_role_key.';
    return;
  end if;

  perform net.http_post(
    url := 'https://ouwyhaozkqvhjalqdsvc.supabase.co/functions/v1/send-event-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key,
      'apikey', v_service_role_key
    ),
    body := jsonb_build_object('action', 'dispatch')
  );
end;
$$;

revoke all on function private.dispatch_event_email_worker() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'dispatch-event-email-outbox';
select cron.schedule(
  'dispatch-event-email-outbox',
  '* * * * *',
  $$select private.dispatch_event_email_worker()$$
);

commit;
