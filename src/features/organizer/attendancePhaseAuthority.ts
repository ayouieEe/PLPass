import type { AttendanceCapturePhase } from "@/features/offline/types";

export type AttendancePhaseCoordinationResult = {
  phase: AttendanceCapturePhase;
  serverConfirmed: boolean;
  transportFailure: boolean;
};

/**
 * Attendance capture only moves forward within a live session. A delayed
 * server read must not turn a locally opened Time Out back into Time In.
 */
export function resolveForwardOnlyAttendancePhase(...phases: Array<AttendanceCapturePhase | undefined>): AttendanceCapturePhase {
  return phases.includes("time_out") ? "time_out" : "time_in";
}

function isTransportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return typeof navigator === "undefined"
    || !navigator.onLine
    || error instanceof TypeError
    || /failed to fetch|network|offline|timeout|connection|temporarily unavailable/i.test(message);
}

/**
 * One phase policy for both organizer attendance routes. A local Time Out is
 * never downgraded by a delayed server Time In response.
 */
export async function coordinateAttendancePhase(input: {
  localPhase?: AttendanceCapturePhase;
  storedPhase?: AttendanceCapturePhase;
  currentPhase?: AttendanceCapturePhase;
  online: boolean;
  readServerPhase: () => Promise<AttendanceCapturePhase>;
  advanceServerPhase: () => Promise<AttendanceCapturePhase>;
}): Promise<AttendancePhaseCoordinationResult> {
  const localPhase = resolveForwardOnlyAttendancePhase(input.localPhase, input.storedPhase, input.currentPhase);
  if (!input.online) return { phase: localPhase, serverConfirmed: false, transportFailure: false };
  try {
    let serverPhase = await input.readServerPhase();
    if (localPhase === "time_out" && serverPhase === "time_in") {
      serverPhase = await input.advanceServerPhase();
    }
    return {
      phase: resolveForwardOnlyAttendancePhase(localPhase, serverPhase),
      serverConfirmed: serverPhase === "time_out" || localPhase === "time_in",
      transportFailure: false,
    };
  } catch (error) {
    if (!isTransportFailure(error)) throw error;
    return { phase: localPhase, serverConfirmed: false, transportFailure: true };
  }
}
