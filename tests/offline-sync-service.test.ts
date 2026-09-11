import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifySyncError, synchronizePendingAttendance } from "@/features/offline/offlineService";
import type { PendingAttendanceRecord, PLPassDesktopApi } from "@/features/offline/types";

const rpc = vi.fn(); const maybeSingle = vi.fn(); const getUser = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ auth: { getUser }, rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }) }));
const record: PendingAttendanceRecord = { localAttendanceUuid: "local-1", eventId: "event-1", sessionId: "session-1", studentId: "student-1", identificationMethod: "qr", attendanceTimestamp: "2026-09-05T00:00:00.000Z", attendanceStatus: "present", timeIn: "2026-09-05T00:00:00.000Z", syncStatus: "SYNCING", syncAttempts: 1, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" };
function api(records: PendingAttendanceRecord[] = [record]) {
  return { recoverInterruptedSync: vi.fn().mockResolvedValue(0), beginSync: vi.fn().mockResolvedValue(records.length ? { owner: "lease-1", records } : null), finishSync: vi.fn().mockResolvedValue(undefined), confirmSync: vi.fn().mockResolvedValue(undefined), failSync: vi.fn().mockResolvedValue(undefined) } as unknown as PLPassDesktopApi;
}

describe("offline synchronization", () => {
  beforeEach(() => { vi.clearAllMocks(); getUser.mockResolvedValue({ data: { user: { id: "organizer" } }, error: null }); });

  it("confirms an idempotent upload only under its issued lease", async () => {
    const local = api(); window.plpassDesktop = local; rpc.mockResolvedValue({ data: { id: "server-1", local_attendance_uuid: "local-1" }, error: null });
    await expect(synchronizePendingAttendance()).resolves.toEqual({ confirmed: 1, failed: 0 });
    expect(local.confirmSync).toHaveBeenCalledWith("local-1", "server-1", "lease-1"); expect(local.finishSync).toHaveBeenCalledWith("lease-1");
  });

  it("recovers a lost success response by querying the stable local UUID", async () => {
    const local = api(); window.plpassDesktop = local; rpc.mockRejectedValue(new Error("response lost")); maybeSingle.mockResolvedValue({ data: { id: "server-1", local_attendance_uuid: "local-1" } });
    await expect(synchronizePendingAttendance()).resolves.toEqual({ confirmed: 1, failed: 0 }); expect(local.failSync).not.toHaveBeenCalled();
  });

  it("retains transient failures for bounded retry scheduling", async () => {
    const local = api(); window.plpassDesktop = local; rpc.mockResolvedValue({ data: null, error: { code: "NETWORK" } }); maybeSingle.mockRejectedValue(new Error("offline"));
    await synchronizePendingAttendance(); expect(local.failSync).toHaveBeenCalledWith("local-1", "RETRY", expect.any(String), "lease-1");
  });

  it("keeps 40001 and uniqueness conflicts terminal and operator-visible", async () => {
    const local = api(); window.plpassDesktop = local; rpc.mockResolvedValue({ data: null, error: { code: "40001" } }); maybeSingle.mockResolvedValue({ data: null });
    await synchronizePendingAttendance(); expect(local.failSync).toHaveBeenCalledWith("local-1", "CONFLICT", expect.stringMatching(/operator review/), "lease-1");
    expect(classifySyncError({ code: "23505" }).disposition).toBe("CONFLICT"); expect(classifySyncError({ code: "42501" }).disposition).toBe("FAILED");
  });

  it("does not invoke the server when another renderer owns the process-wide batch", async () => {
    const local = api([]); window.plpassDesktop = local; await expect(synchronizePendingAttendance()).resolves.toEqual({ confirmed: 0, failed: 0 }); expect(rpc).not.toHaveBeenCalled();
  });
});
