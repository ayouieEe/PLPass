import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type FacialIdentificationResult = {
  student_id: string;
  student_number: string;
  display_name: string;
  distance: number;
  action: "checked_in" | "checked_out" | "already_recorded";
  attendance_status: "present" | "late";
  recorded_at?: string;
};

export type FacialEnrollmentResult = { pose: "front" | "left" | "right"; complete: boolean; completed_poses: string[] };

async function accessToken() {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  if (!data.session?.access_token) throw new Error("Your session expired. Sign in again.");
  return data.session.access_token;
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail && typeof (detail as { message?: unknown }).message === "string") return (detail as { message: string }).message;
  }
  return fallback;
}

export async function identifyLiveFace(eventSessionId: string, intendedAction: "check_in" | "check_out", captures: Blob[]): Promise<FacialIdentificationResult> {
  const token = await accessToken();

  const body = new FormData();
  body.append("event_session_id", eventSessionId);
  body.append("intended_action", intendedAction);
  captures.forEach((capture, index) => body.append("captures", capture, `live-face-${index + 1}.jpg`));
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/facial/identify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body
    });
  } catch {
    throw new Error("The facial recognition service is offline. Start the PLPass API and try again.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(errorMessage(payload, "Facial identification failed."));
  }
  return payload as FacialIdentificationResult;
}

export async function enrollFacePose(pose: "front" | "left" | "right", capture: Blob): Promise<FacialEnrollmentResult> {
  const token = await accessToken();
  const body = new FormData();
  body.append("pose", pose);
  body.append("capture", capture, `face-${pose}.jpg`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/facial/enroll`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
  } catch {
    throw new Error("The facial recognition service is offline. Start the PLPass API and try again.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, "Face enrollment failed."));
  return payload as FacialEnrollmentResult;
}
