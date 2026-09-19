export type BrevoMessageInput = {
  recipient_email: string;
  subject: string;
  body: string;
  html_body?: string | null;
};

export function nonNegativeIntegerSetting(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export function positiveIntegerSetting(value: string | undefined, fallback: number) {
  return Math.max(1, nonNegativeIntegerSetting(value, fallback));
}

export function isBrevoQuotaResponse(status: number, message: string) {
  return status === 429 || /quota|daily limit|rate limit|too many requests|limit exceeded/i.test(message);
}

export function buildBrevoPayload(
  row: BrevoMessageInput,
  senderEmail: string | undefined,
  senderName: string,
  sandboxMode: boolean
) {
  return {
    sender: { email: senderEmail, name: senderName },
    replyTo: { email: senderEmail, name: senderName },
    to: [{ email: row.recipient_email }],
    subject: row.subject,
    textContent: row.body,
    htmlContent: row.html_body || undefined,
    ...(sandboxMode ? { headers: { "X-Sib-Sandbox": "drop" } } : {})
  };
}
