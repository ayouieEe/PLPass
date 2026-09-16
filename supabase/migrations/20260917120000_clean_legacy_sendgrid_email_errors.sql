begin;

-- Preserve the outbox rows and their failed status, but remove misleading
-- provider-specific errors left by the previous SendGrid configuration.
-- These jobs are intentionally not requeued automatically: an admin should
-- verify Brevo first, then retry only the messages that should be delivered.
update public.event_email_outbox
set error_message = 'Email failed under the previous provider configuration. Verify Brevo, then retry if delivery is still needed.'
where delivery_status = 'failed'
  and error_message ilike '%sendgrid%';

update public.request_email_outbox
set error_message = 'Email failed under the previous provider configuration. Verify Brevo, then retry if delivery is still needed.'
where delivery_status = 'failed'
  and error_message ilike '%sendgrid%';

commit;
