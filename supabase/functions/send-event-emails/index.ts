import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const secretKeys = (() => {
  try {
    const value = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return Object.values(value).filter((key): key is string => typeof key === "string");
  } catch {
    return [];
  }
})();
const serviceKey = secretKeys.find((key) => key.startsWith("sb_secret_"))
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? Deno.env.get("brevo_api_key");
const brevoFromEmail = Deno.env.get("BREVO_FROM_EMAIL") ?? Deno.env.get("brevo_from_email");
const brevoFromName = "PLPass";

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and a server API key are required.");
}

const supabase = createClient(supabaseUrl, serviceKey, {
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function dispatchQueuedEmails() {
  const { data, error } = await supabase.rpc("claim_event_email_outbox_batch", { p_limit: 25 });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as EventEmailRow[];
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey ?? "",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sender: { email: brevoFromEmail, name: brevoFromName },
          replyTo: { email: brevoFromEmail, name: brevoFromName },
          to: [{ email: row.recipient_email }],
          subject: row.subject,
          textContent: row.body,
          htmlContent: row.html_body || undefined
        })
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
        await supabase.rpc("fail_event_email_outbox_delivery", {
          p_outbox_id: row.id,
          p_processing_token: row.processing_token,
          p_error_message: errorMessage || `Email provider returned ${response.status}.`
        });
        failed += 1;
      }
    } catch (error) {
      await supabase.rpc("fail_event_email_outbox_delivery", {
        p_outbox_id: row.id,
        p_processing_token: row.processing_token,
        p_error_message: error instanceof Error ? error.message : "Email delivery failed."
      });
      failed += 1;
    }
  }

  return { processed: rows.length, sent, failed };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Only POST requests are supported." }, 405);

  const requestBody = await request.json().catch(() => ({}));
  const action = typeof requestBody.action === "string" ? requestBody.action : "";
  const authorization = request.headers.get("Authorization");
  // The platform verifies the secret key before this handler runs. Keeping the
  // worker credential in `apikey` avoids the deprecated legacy-JWT path.
  const isWorker = (request.headers.get("apikey") ?? "").startsWith("sb_secret_");

  if (action === "dispatch") {
    if (!isWorker) return json({ error: "Worker authorization is required." }, 403);
    if (!brevoApiKey || !brevoFromEmail) return json({ error: "Email provider credentials are not configured." }, 500);
    try {
      return json(await dispatchQueuedEmails());
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Email dispatch failed." }, 500);
    }
  }

  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Authorization is required." }, 401);
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: "The signed-in user could not be verified." }, 401);

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
    .in("notification_type", ["published", "rescheduled", "participant_added"])
    .eq("delivery_status", "failed")
    .select("id")
    .maybeSingle();
  if (retryError) return json({ error: retryError.message }, 500);
  if (!retryRow) return json({ error: "That invitation is no longer available to retry." }, 404);
  return json({ queued: true });
});
