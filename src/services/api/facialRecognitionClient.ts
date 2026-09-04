import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type FacialIdentificationResult = {
  student_id: string;
  student_number: string;
  display_name: string;
  similarity: number;
  action: "checked_in" | "checked_out" | "already_recorded";
  attendance_status: "present" | "late";
  recorded_at?: string;
};

export async function identifyLiveFace(eventSessionId: string, intendedAction: "check_in" | "check_out", captures: Blob[]): Promise<FacialIdentificationResult> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Your organizer session expired. Sign in again.");

  const body = new FormData();
  body.append("event_session_id", eventSessionId);
  body.append("intended_action", intendedAction);
  captures.forEach((capture, index) => body.append("captures", capture, `live-face-${index + 1}.jpg`));
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/facial/identify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body
    });
  } catch {
    throw new Error("The facial recognition service is offline. Start the PLPass API and try again.");
  }
  const payload = await response.json().catch(() => null) as FacialIdentificationResult | { detail?: string } | null;
  if (!response.ok) {
    throw new Error(payload && "detail" in payload && payload.detail ? payload.detail : "Facial identification failed.");
  }
  return payload as FacialIdentificationResult;
}
