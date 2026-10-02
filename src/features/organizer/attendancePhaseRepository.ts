import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AttendanceCapturePhase } from "@/features/offline/types";
import { withRequestTimeout } from "@/lib/async/requestTimeout";

type PhaseRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

function phaseRpcClient(): PhaseRpcClient {
  return getSupabaseBrowserClient() as unknown as PhaseRpcClient;
}

function mapPhase(value: unknown): AttendanceCapturePhase {
  return value === "time_out" ? "time_out" : "time_in";
}

export async function getServerAttendanceCapturePhase(sessionId: string): Promise<AttendanceCapturePhase> {
  const { data, error } = await withRequestTimeout(phaseRpcClient().rpc("get_event_attendance_capture_phase", { p_session_id: sessionId }), 30_000, "Checking the attendance step took too long. Check the connection and try again.");
  if (error) throw error;
  return mapPhase(data);
}

export async function advanceServerAttendanceCapturePhase(sessionId: string): Promise<AttendanceCapturePhase> {
  const { data, error } = await withRequestTimeout(phaseRpcClient().rpc("advance_event_attendance_capture_phase", { p_session_id: sessionId }), 30_000, "Opening Time Out took too long. Check the connection and try again.");
  if (error) throw error;
  return mapPhase(data);
}
