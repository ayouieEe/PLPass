import { describe, expect, it, vi } from "vitest";
import { coordinateAttendancePhase, resolveForwardOnlyAttendancePhase } from "@/features/organizer/attendancePhaseAuthority";

describe("resolveForwardOnlyAttendancePhase", () => {
  it("never downgrades a durable Time Out when a delayed server read says Time In", () => {
    expect(resolveForwardOnlyAttendancePhase("time_out", "time_in")).toBe("time_out");
    expect(resolveForwardOnlyAttendancePhase(undefined, "time_out", "time_in")).toBe("time_out");
  });

  it("keeps Time In only when every source remains at Time In", () => {
    expect(resolveForwardOnlyAttendancePhase(undefined, "time_in", "time_in")).toBe("time_in");
  });

  it("does not query the server while offline", async () => {
    const readServerPhase = vi.fn();
    const result = await coordinateAttendancePhase({
      localPhase: "time_in",
      storedPhase: "time_out",
      online: false,
      readServerPhase,
      advanceServerPhase: vi.fn(),
    });
    expect(result).toMatchObject({ phase: "time_out", serverConfirmed: false });
    expect(readServerPhase).not.toHaveBeenCalled();
  });

  it("promotes a stale server phase before online capture", async () => {
    const advanceServerPhase = vi.fn().mockResolvedValue("time_out");
    const result = await coordinateAttendancePhase({
      localPhase: "time_out",
      online: true,
      readServerPhase: vi.fn().mockResolvedValue("time_in"),
      advanceServerPhase,
    });
    expect(result).toMatchObject({ phase: "time_out", serverConfirmed: true });
    expect(advanceServerPhase).toHaveBeenCalledOnce();
  });

  it("retains local Time Out when reconnect promotion loses transport", async () => {
    const result = await coordinateAttendancePhase({
      localPhase: "time_out",
      online: true,
      readServerPhase: vi.fn().mockResolvedValue("time_in"),
      advanceServerPhase: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    });
    expect(result).toMatchObject({ phase: "time_out", serverConfirmed: false, transportFailure: true });
  });
});
