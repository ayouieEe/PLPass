begin;

alter table public.event_email_outbox
  add column if not exists event_code text,
  add column if not exists event_title text;

drop trigger if exists queue_email_on_participant_insert on public.event_participants;
drop function if exists private.queue_event_notification_emails();
drop function if exists private.queue_email_on_participant_insert();

commit;