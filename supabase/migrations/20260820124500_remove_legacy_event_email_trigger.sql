begin;

drop trigger if exists queue_email_on_participant_insert on public.event_participants;
drop function if exists private.queue_email_on_participant_insert();

commit;