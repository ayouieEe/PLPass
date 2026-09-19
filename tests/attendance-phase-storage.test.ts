import { describe, expect, it, vi } from "vitest";
import { clearAttendancePhase, readAttendancePhase, writeAttendancePhase } from "@/features/organizer/attendancePhaseStorage";

describe("attendance phase persistence", () => {
  it("keeps the capture phase separate for each live session", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); }
    };

    writeAttendancePhase(storage, "session-1", "time_out");

    expect(readAttendancePhase(storage, "session-1")).toBe("time_out");
    expect(readAttendancePhase(storage, "session-2")).toBe("time_in");
  });

  it("defaults invalid values to Time In and clears a finished session", () => {
    const values = new Map<string, string>([["plpass:attendance-phase:session-1", "invalid"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); }
    };

    expect(readAttendancePhase(storage, "session-1")).toBe("time_in");
    writeAttendancePhase(storage, "session-1", "time_out");
    clearAttendancePhase(storage, "session-1");
    expect(readAttendancePhase(storage, "session-1")).toBe("time_in");
  });

  it("fails safely when browser storage is unavailable", () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("storage blocked"); }),
      setItem: vi.fn(() => { throw new Error("storage blocked"); }),
      removeItem: vi.fn(() => { throw new Error("storage blocked"); })
    };

    expect(readAttendancePhase(storage, "session-1")).toBe("time_in");
    expect(() => writeAttendancePhase(storage, "session-1", "time_out")).not.toThrow();
    expect(() => clearAttendancePhase(storage, "session-1")).not.toThrow();
  });
});
