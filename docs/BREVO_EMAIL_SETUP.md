# Brevo Email Setup

PLPass queues participant email notifications in `event_email_outbox` when an event is published. The `send-event-emails` Supabase Edge Function processes that queue.

## Configure Brevo

1. Create or open a Brevo account and enable Transactional Email.
2. Verify the sender email or school domain in Brevo. Configure SPF and DKIM as instructed by Brevo.
	For `plpasig.edu.ph`, also publish a DMARC record such as
	`v=DMARC1; p=none; rua=mailto:dmarc@plpasig.edu.ph` while validating delivery.
	Move to `p=quarantine` or `p=reject` after reviewing the reports.
3. Create an API key in Brevo.
4. Set these Supabase project secrets:

```text
EMAIL_PROVIDER=brevo
BREVO_API_KEY=<your Brevo API key>
BREVO_FROM_EMAIL=<verified sender email>
```

Do not place `BREVO_API_KEY` in `.env` values exposed to the browser or in frontend source code.

## Deploy the function

From a machine with an authenticated Supabase CLI:

```bash
supabase functions deploy send-event-emails
```

The function requires the existing Supabase-managed `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets.

## Test the flow

1. Publish an event with at least one participant.
2. Confirm rows are created in `event_email_outbox` with `delivery_status = 'pending'`.
3. The Create Event flow invokes `send-event-emails` after a successful publish. You can also invoke the function manually for pending rows.
4. Confirm the rows become `sent` and contain `provider_message_id`.
5. Check the participant mailbox and Brevo transactional logs.

The event sender is displayed as `PLPass` and uses `BREVO_FROM_EMAIL` as its
address. Brevo must show that address or its domain as authenticated. The
application cannot force Gmail or another mailbox provider to place a message
in the Inbox; SPF, DKIM, DMARC alignment, sender reputation, and mailbox rules
control that decision. The Supabase Auth password-reset sender is configured
separately under Authentication > SMTP Settings.

Failed sends are marked `failed` with the provider response in `error_message`. Review and retry them only after correcting the provider or recipient issue.

## Rollback

To temporarily return to SendGrid, set:

```text
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<existing SendGrid API key>
SENDGRID_FROM_EMAIL=<verified sender email>
```

Then redeploy the function. No database or frontend changes are required for the provider switch.
