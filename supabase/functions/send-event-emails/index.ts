import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const sendGridApiKey = Deno.env.get("SENDGRID_API_KEY") ?? Deno.env.get("sendgrid_api_key");
const sendGridFromEmail = Deno.env.get("SENDGRID_FROM_EMAIL") ?? Deno.env.get("sendgrid_from_email");

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

  if (!sendGridApiKey || !sendGridFromEmail) {
    return json({ error: "SENDGRID_API_KEY and SENDGRID_FROM_EMAIL are required." }, 500);
  }

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json({ error: "Authorization is required." }, 401);

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return json({ error: "The signed-in user could not be verified." }, 401);

  const requestBody = await request.json().catch(() => ({}));
  const eventId = typeof requestBody.eventId === "string" ? requestBody.eventId.trim() : "";
  if (!eventId) return json({ error: "eventId is required." }, 400);

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, organizers!inner(profile_id)")
    .eq("id", eventId)
    .maybeSingle();
  const organizer = Array.isArray(event?.organizers) ? event.organizers[0] : event?.organizers;
  if (eventError || !event) return json({ error: "Event not found." }, 404);
  if (!organizer || organizer.profile_id !== authData.user.id) return json({ error: "Event access denied." }, 403);

  const { data: rows, error: fetchError } = await supabase
    .from("event_email_outbox")
    .select("id, recipient_email, subject, body")
    .eq("delivery_status", "pending")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (fetchError) return json({ error: fetchError.message }, 500);

  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as EventEmailRow[]) {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendGridApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: row.recipient_email }] }],
        from: { email: sendGridFromEmail, name: "PLPass" },
        subject: row.subject,
        content: [{ type: "text/plain", value: row.body }]
      })
    });

    if (response.ok) {
      const { error } = await supabase
        .from("event_email_outbox")
        .update({ delivery_status: "sent", sent_at: new Date().toISOString(), error_message: null })
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
