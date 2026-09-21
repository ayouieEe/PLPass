-- Current-only repair: qualify the outbox ids used by the shared daily-cap
-- reservation query. The claim functions expose an output column named id,
-- which otherwise makes the unqualified source id ambiguous in PL/pgSQL.
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
    select e.id from public.event_email_outbox e
    where (e.delivery_status = 'sent' and e.sent_at >= v_day_start)
       or (e.delivery_status = 'processing' and e.processing_started_at >= v_day_start)
    union all
    select r.id from public.request_email_outbox r
    where (r.delivery_status = 'sent' and r.sent_at >= v_day_start)
       or (r.delivery_status = 'processing' and r.processing_started_at >= v_day_start)
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
    select e.id from public.event_email_outbox e
    where (e.delivery_status = 'sent' and e.sent_at >= v_day_start)
       or (e.delivery_status = 'processing' and e.processing_started_at >= v_day_start)
    union all
    select r.id from public.request_email_outbox r
    where (r.delivery_status = 'sent' and r.sent_at >= v_day_start)
       or (r.delivery_status = 'processing' and r.processing_started_at >= v_day_start)
  ) as reserved;
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50, greatest(coalesce(p_daily_cap, 250), 0) - v_reserved);
  if v_limit <= 0 then return; end if;
  return query select * from public.claim_request_email_outbox_batch(v_limit);
end;
$$;

revoke all on function public.claim_event_email_outbox_batch_with_daily_cap(integer, integer) from public, anon, authenticated;
revoke all on function public.claim_request_email_outbox_batch_with_daily_cap(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_event_email_outbox_batch_with_daily_cap(integer, integer) to service_role;
grant execute on function public.claim_request_email_outbox_batch_with_daily_cap(integer, integer) to service_role;
