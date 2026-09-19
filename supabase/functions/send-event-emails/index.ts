import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildBrevoPayload,
  isBrevoQuotaResponse,
  nonNegativeIntegerSetting,
  positiveIntegerSetting
} from "../_shared/emailWorkerPolicy.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? Deno.env.get("brevo_api_key");
const brevoFromEmail = Deno.env.get("BREVO_FROM_EMAIL") ?? Deno.env.get("brevo_from_email");
const brevoFromName = "PLPass";
const dailySendCap = nonNegativeIntegerSetting(Deno.env.get("PLPASS_EMAIL_DAILY_CAP"), 250);
const quotaDeferMinutes = positiveIntegerSetting(Deno.env.get("PLPASS_EMAIL_QUOTA_DEFER_MINUTES"), 60);
const developmentMode = Deno.env.get("PLPASS_EMAIL_DEVELOPMENT_MODE") === "true";
const sandboxMode = developmentMode && Deno.env.get("PLPASS_BREVO_SANDBOX_MODE") === "true";
const developmentAllowlist = new Set(
  (Deno.env.get("PLPASS_EMAIL_RECIPIENT_ALLOWLIST") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type EventEmailRow = {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  html_body?: string | null;
  processing_token: string;
};

type RequestEmailRow = {
  id: string;
  recipient_email: string;
  subject: string;
  body: string;
  processing_token: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function recipientAllowed(email: string) {
  return !developmentMode || developmentAllowlist.has(email.trim().toLowerCase());
}

async function sentTodayCount() {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const [eventResult, requestResult] = await Promise.all([
    supabase.from("event_email_outbox").select("id", { count: "exact", head: true }).eq("delivery_status", "sent").gte("sent_at", since.toISOString()),
    supabase.from("request_email_outbox").select("id", { count: "exact", head: true }).eq("delivery_status", "sent").gte("sent_at", since.toISOString())
  ]);
  if (eventResult.error) throw new Error(eventResult.error.message);
  if (requestResult.error) throw new Error(requestResult.error.message);
  return (eventResult.count ?? 0) + (requestResult.count ?? 0);
}

async function deferEventRow(row: EventEmailRow, reason: string) {
  const { error } = await supabase.rpc("defer_event_email_outbox_delivery", {
    p_outbox_id: row.id,
    p_processing_token: row.processing_token,
    p_defer_until: new Date(Date.now() + quotaDeferMinutes * 60_000).toISOString(),
    p_reason: reason
  });
  if (error) throw new Error(error.message);
}

async function deferRequestRow(row: RequestEmailRow, reason: string) {
  const { error } = await supabase.rpc("defer_request_email_outbox_delivery", {
    p_outbox_id: row.id,
    p_processing_token: row.processing_token,
    p_defer_until: new Date(Date.now() + quotaDeferMinutes * 60_000).toISOString(),
    p_reason: reason
  });
  if (error) throw new Error(error.message);
}

async function deferAllDueRows(until: Date, reason: string) {
  const { error } = await supabase.rpc("defer_due_email_outbox_deliveries", {
    p_defer_until: until.toISOString(),
    p_reason: reason
  });
  if (error) throw new Error(error.message);
}

// A quota result applies to every row this invocation already leased. Release
// those exact leases now instead of leaving them in `processing` for five
// minutes and making a later worker recover them.
async function deferRemainingEventRows(rows: EventEmailRow[], startIndex: number, reason: string) {
  for (const row of rows.slice(startIndex)) await deferEventRow(row, reason);
}

async function deferRemainingRequestRows(rows: RequestEmailRow[], startIndex: number, reason: string) {
  for (const row of rows.slice(startIndex)) await deferRequestRow(row, reason);
}

async function failEventRow(row: EventEmailRow, message: string) {
  const { error } = await supabase.rpc("fail_event_email_outbox_delivery", {
    p_outbox_id: row.id,
    p_processing_token: row.processing_token,
    p_error_message: message
  });
  if (error) throw new Error(error.message);
}

async function failRequestRow(row: RequestEmailRow, message: string) {
  const { error } = await supabase.rpc("fail_request_email_outbox_delivery", {
    p_outbox_id: row.id,
    p_processing_token: row.processing_token,
    p_error_message: message
  });
  if (error) throw new Error(error.message);
}

function nextUtcDay() {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

async function dispatchQueuedEmails() {
  const sentToday = await sentTodayCount();
  if (sentToday >= dailySendCap) {
    await deferAllDueRows(nextUtcDay(), "Deferred because the PLPass daily email budget has been reached.");
    return { processed: 0, sent: 0, failed: 0, deferred: 0, quotaLimited: true };
  }
  const { data, error } = await supabase.rpc("claim_event_email_outbox_batch_with_daily_cap", { p_limit: 25, p_daily_cap: dailySendCap });
  if (error) throw new Error(error.message);

  const { data: settings } = await supabase
    .from("system_settings")
    .select("notification_preferences")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const notificationPreferences = settings?.notification_preferences && typeof settings.notification_preferences === "object"
    ? settings.notification_preferences as Record<string, unknown>
    : {};

  const rows = (data ?? []) as EventEmailRow[];
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  for (const row of rows) {
    try {
      if (!recipientAllowed(row.recipient_email)) {
        await deferEventRow(row, "Development recipient is not on the configured allowlist.");
        deferred += 1;
        continue;
      }
      const eventNotificationsEnabled = notificationPreferences.notificationEventsEnabled !== false;
      if (!eventNotificationsEnabled) {
        const { error: skipError } = await supabase
          .from("event_email_outbox")
          .update({ delivery_status: "skipped", error_message: "Suppressed by administrator notification policy.", processing_started_at: null, processing_token: null })
          .eq("id", row.id)
          .eq("processing_token", row.processing_token)
          .eq("delivery_status", "processing");
        if (skipError) throw new Error(skipError.message);
        continue;
      }
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey ?? "",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(buildBrevoPayload(row, brevoFromEmail, brevoFromName, sandboxMode))
      });

      if (response.ok) {
        const responseBody = await response.json().catch(() => ({}));
        const { error: completeError } = await supabase.rpc("complete_event_email_outbox_delivery", {
          p_outbox_id: row.id,
          p_processing_token: row.processing_token,
          p_provider_message_id: typeof responseBody.messageId === "string" ? responseBody.messageId : undefined
        });
        if (completeError) throw new Error(completeError.message);
        sent += 1;
      } else {
        const errorMessage = (await response.text()).slice(0, 1000);
        if (isBrevoQuotaResponse(response.status, errorMessage)) {
          const reason = `Brevo quota/rate limit: ${errorMessage || response.status}`;
          await deferRemainingEventRows(rows, rows.indexOf(row), reason);
          await deferAllDueRows(new Date(Date.now() + quotaDeferMinutes * 60_000), "Deferred because Brevo reported a quota or rate limit.");
          deferred += rows.length - rows.indexOf(row);
          break;
        }
        await failEventRow(row, errorMessage || `Email provider returned ${response.status}.`);
        failed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed.";
      if (isBrevoQuotaResponse(0, message)) {
        const reason = `Brevo quota/rate limit: ${message}`;
        await deferRemainingEventRows(rows, rows.indexOf(row), reason);
        await deferAllDueRows(new Date(Date.now() + quotaDeferMinutes * 60_000), "Deferred because Brevo reported a quota or rate limit.");
        deferred += rows.length - rows.indexOf(row);
        break;
      }
      await failEventRow(row, message);
      failed += 1;
    }
  }

  return { processed: rows.length, sent, failed, deferred, quotaLimited: deferred > 0 };
}

async function dispatchQueuedRequestEmails() {
  const sentToday = await sentTodayCount();
  if (sentToday >= dailySendCap) {
    await deferAllDueRows(nextUtcDay(), "Deferred because the PLPass daily email budget has been reached.");
    return { processed: 0, sent: 0, failed: 0, deferred: 0, quotaLimited: true };
  }
  const { data, error } = await supabase.rpc("claim_request_email_outbox_batch_with_daily_cap", { p_limit: 25, p_daily_cap: dailySendCap });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as RequestEmailRow[];
  let sent = 0;
  let failed = 0;
  let deferred = 0;
  for (const row of rows) {
    try {
      if (!recipientAllowed(row.recipient_email)) {
        await deferRequestRow(row, "Development recipient is not on the configured allowlist.");
        deferred += 1;
        continue;
      }
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevoApiKey ?? "", "Content-Type": "application/json" },
        body: JSON.stringify(buildBrevoPayload(row, brevoFromEmail, brevoFromName, sandboxMode))
      });

      if (response.ok) {
        const responseBody = await response.json().catch(() => ({}));
        const { error: completeError } = await supabase.rpc("complete_request_email_outbox_delivery", {
          p_outbox_id: row.id,
          p_processing_token: row.processing_token,
          p_provider_message_id: typeof responseBody.messageId === "string" ? responseBody.messageId : undefined
        });
        if (completeError) throw new Error(completeError.message);
        sent += 1;
      } else {
        const errorMessage = (await response.text()).slice(0, 1000);
        if (isBrevoQuotaResponse(response.status, errorMessage)) {
          const reason = `Brevo quota/rate limit: ${errorMessage || response.status}`;
          await deferRemainingRequestRows(rows, rows.indexOf(row), reason);
          await deferAllDueRows(new Date(Date.now() + quotaDeferMinutes * 60_000), "Deferred because Brevo reported a quota or rate limit.");
          deferred += rows.length - rows.indexOf(row);
          break;
        }
        await failRequestRow(row, errorMessage || `Email provider returned ${response.status}.`);
        failed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed.";
      if (isBrevoQuotaResponse(0, message)) {
        const reason = `Brevo quota/rate limit: ${message}`;
        await deferRemainingRequestRows(rows, rows.indexOf(row), reason);
        await deferAllDueRows(new Date(Date.now() + quotaDeferMinutes * 60_000), "Deferred because Brevo reported a quota or rate limit.");
        deferred += rows.length - rows.indexOf(row);
        break;
      }
      await failRequestRow(row, message);
      failed += 1;
    }
  }

  return { processed: rows.length, sent, failed, deferred, quotaLimited: deferred > 0 };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Only POST requests are supported." }, 405);

  const requestBody = await request.json().catch(() => ({}));
  const action = typeof requestBody.action === "string" ? requestBody.action : "";
  const authorization = request.headers.get("Authorization");
  const apiKey = request.headers.get("apikey");
  // The database worker supplies both headers. Requiring both avoids making a
  // scheduling endpoint reachable through the user-authentication path.
  const isWorker = authorization === `Bearer ${serviceRoleKey}` && apiKey === serviceRoleKey;

  if (action === "dispatch") {
    if (!isWorker) return json({ error: "Worker authorization is required." }, 403);
    if (!brevoApiKey || !brevoFromEmail) return json({ error: "Email provider credentials are not configured." }, 500);
    try {
      const eventEmails = await dispatchQueuedEmails();
      const requestEmails = eventEmails.quotaLimited ? { processed: 0, sent: 0, failed: 0, deferred: 0, quotaLimited: true } : await dispatchQueuedRequestEmails();
      return json({
        processed: eventEmails.processed + requestEmails.processed,
        sent: eventEmails.sent + requestEmails.sent,
        failed: eventEmails.failed + requestEmails.failed,
        deferred: eventEmails.deferred + requestEmails.deferred,
        eventEmails,
        requestEmails
      });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Email dispatch failed." }, 500);
    }
  }

  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Authorization is required." }, 401);
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: "The signed-in user could not be verified." }, 401);

  if (action === "health") {
    const { data: adminProfile, error: adminProfileError } = await supabase
      .from("profiles")
      .select("id, role, account_status")
      .eq("id", authData.user.id)
      .eq("role", "admin")
      .eq("account_status", "active")
      .maybeSingle();
    if (adminProfileError) return json({ error: "Health authorization could not be verified." }, 500);
    if (!adminProfile) return json({ error: "Administrator access is required." }, 403);
    return json({ ok: true, service: "send-event-emails" });
  }

  const eventId = typeof requestBody.eventId === "string" ? requestBody.eventId.trim() : "";
  const retryOutboxId = typeof requestBody.outboxId === "string" ? requestBody.outboxId.trim() : "";
  if (!eventId) return json({ error: "eventId is required." }, 400);

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizers!inner(profile_id)")
    .eq("id", eventId)
    .maybeSingle();
  const organizer = Array.isArray(event?.organizers) ? event.organizers[0] : event?.organizers;
  if (eventError || !event) return json({ error: "Event not found." }, 404);
  if (!organizer || organizer.profile_id !== authData.user.id) return json({ error: "Event access denied." }, 403);

  if (action === "status") {
    const { data: statusRows, error: statusError } = await supabase
      .from("event_email_outbox")
      .select("id, recipient_profile_id, delivery_status, error_message, sent_at, created_at")
      .eq("event_id", eventId)
      .in("notification_type", ["published", "rescheduled", "participant_added"])
      .order("created_at", { ascending: false })
      .limit(500);
    if (statusError) return json({ error: statusError.message }, 500);

    const latestStatuses = new Map<string, Record<string, unknown>>();
    for (const row of statusRows ?? []) {
      if (!latestStatuses.has(row.recipient_profile_id)) {
        latestStatuses.set(row.recipient_profile_id, {
          id: row.id,
          recipientProfileId: row.recipient_profile_id,
          deliveryStatus: row.delivery_status,
          errorMessage: row.error_message,
          sentAt: row.sent_at,
          createdAt: row.created_at
        });
      }
    }
    return json({ statuses: [...latestStatuses.values()] });
  }

  if (action !== "retry" || !retryOutboxId) return json({ error: "Unsupported email action." }, 400);
  const { data: retryRow, error: retryError } = await supabase
    .from("event_email_outbox")
    .select("id, created_at, last_attempt_at, notification_type")
    .eq("id", retryOutboxId)
    .eq("event_id", eventId)
    .eq("delivery_status", "failed")
    .maybeSingle();
  if (retryError) return json({ error: retryError.message }, 500);
  if (!retryRow) return json({ error: "That invitation is no longer available to retry." }, 404);
  if (retryRow.notification_type !== "participant_added") return json({ error: "Only participant invitation emails may be retried here." }, 403);
  if (new Date(retryRow.created_at).getTime() < Date.now() - 24 * 60 * 60 * 1000) return json({ error: "Only invitations from the last 24 hours may be retried." }, 400);
  if (retryRow.last_attempt_at && new Date(retryRow.last_attempt_at).getTime() > Date.now() - 15 * 60 * 1000) return json({ error: "This invitation is still within its retry cooldown." }, 429);
  const { data: queuedRow, error: queueError } = await supabase
    .from("event_email_outbox")
    .update({
      delivery_status: "pending",
      error_message: null,
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
      processing_started_at: null,
      processing_token: null
    })
    .eq("id", retryOutboxId)
    .eq("event_id", eventId)
    .eq("notification_type", "participant_added")
    .eq("delivery_status", "failed")
    .select("id")
    .maybeSingle();
  if (queueError) return json({ error: queueError.message }, 500);
  if (!queuedRow) return json({ error: "That invitation is no longer available to retry." }, 404);
  return json({ queued: true });
});
