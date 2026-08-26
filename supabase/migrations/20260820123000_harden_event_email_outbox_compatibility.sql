begin;
alter table public.event_email_outbox
  add column if not exists event_code text,
  add column if not exists event_title text;
drop function if exists private.queue_event_notification_emails();
commit;
