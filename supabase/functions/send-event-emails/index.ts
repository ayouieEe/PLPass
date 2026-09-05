import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? Deno.env.get("brevo_api_key");
const brevoFromEmail = Deno.env.get("BREVO_FROM_EMAIL") ?? Deno.env.get("brevo_from_email");
const brevoFromName = "PLPass";

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
  recipient_profile_id: string;
  recipient_email: string;
  subject: string;
  body: string;
  html_body?: string | null;
  delivery_status: "pending" | "sent" | "failed" | "skipped";
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Only POST requests are supported." }, 405);
  }

  if (!brevoApiKey || !brevoFromEmail) {
    return json({ error: "BREVO_API_KEY and BREVO_FROM_EMAIL are required." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Authorization is required." }, 401);

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: "The signed-in user could not be verified." }, 401);

  const requestBody = await request.json().catch(() => ({}));
  const eventId = typeof requestBody.eventId === "string" ? requestBody.eventId.trim() : "";
  const action = typeof requestBody.action === "string" ? requestBody.action : "send";
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

  if (action === "retry") {
    if (!retryOutboxId) return json({ error: "outboxId is required to retry an email." }, 400);
    const { data: retryRow, error: retryError } = await supabase
      .from("event_email_outbox")
      .update({ delivery_status: "pending", error_message: null })
      .eq("id", retryOutboxId)
      .eq("event_id", eventId)
      .in("notification_type", ["published", "rescheduled", "participant_added"])
      .eq("delivery_status", "failed")
      .select("id")
      .maybeSingle();
    if (retryError) return json({ error: retryError.message }, 500);
    if (!retryRow) return json({ error: "That invitation is no longer available to retry." }, 404);
  } else if (action !== "send") {
    return json({ error: "Unsupported email action." }, 400);
  }

  let pendingEmailsQuery = supabase
    .from("event_email_outbox")
    .select("id, recipient_profile_id, recipient_email, subject, body, html_body, delivery_status, error_message, sent_at, created_at")
    .eq("delivery_status", "pending")
    .eq("event_id", eventId);
  if (action === "retry") pendingEmailsQuery = pendingEmailsQuery.eq("id", retryOutboxId);
  const { data: rows, error: fetchError } = await pendingEmailsQuery
    .order("created_at", { ascending: true })
    .limit(100);

  if (fetchError) return json({ error: fetchError.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as EventEmailRow[]) {
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
      const { error } = await supabase
        .from("event_email_outbox")
        .update({
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: typeof responseBody.messageId === "string" ? responseBody.messageId : null,
          error_message: null
        })
        .eq("id", row.id)
        .eq("delivery_status", "pending");
      if (error) failed += 1;
      else sent += 1;
    } else {
      const errorMessage = (await response.text()).slice(0, 1000);
      await supabase
        .from("event_email_outbox")
        .update({ delivery_status: "failed", error_message: errorMessage })
        .eq("id", row.id)
        .eq("delivery_status", "pending");
      failed += 1;
    }
  }

  return json({ processed: (rows ?? []).length, sent, failed });
});
