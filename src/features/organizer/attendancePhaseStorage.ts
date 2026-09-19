import type { AttendanceCapturePhase } from "@/features/offline/types";

const storageKey = (sessionId: string) => `plpass:attendance-phase:${sessionId}`;

export function readAttendancePhase(storage: Pick<Storage, "getItem">, sessionId: string): AttendanceCapturePhase {
  try {
    return storage.getItem(storageKey(sessionId)) === "time_out" ? "time_out" : "time_in";
  } catch {
    return "time_in";
  }
}

export function writeAttendancePhase(storage: Pick<Storage, "setItem">, sessionId: string, phase: AttendanceCapturePhase): void {
  try {
    storage.setItem(storageKey(sessionId), phase);
  } catch {
    // In desktop mode the active scanner coordinator remains a fallback source.
  }
}

export function clearAttendancePhase(storage: Pick<Storage, "removeItem">, sessionId: string): void {
  try {
    storage.removeItem(storageKey(sessionId));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}
