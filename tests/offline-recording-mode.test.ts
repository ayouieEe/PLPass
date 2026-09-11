import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordOfflineAttendance, shouldRecordAttendanceLocally } from "@/features/offline/offlineService";
import type { PLPassDesktopApi } from "@/features/offline/types";

const getUser = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ auth: { getUser } }) }));

const localRecord = {
  localAttendanceUuid: "local-1", eventId: "event-1", sessionId: "session-1", studentId: "student-1",
  identificationMethod: "qr" as const, attendanceTimestamp: "2026-09-05T00:15:00.000Z", attendanceStatus: "present" as const,
  timeIn: "2026-09-05T00:15:00.000Z", syncStatus: "PENDING_SYNC" as const, syncAttempts: 0,
  createdAt: "2026-09-05T00:15:00.000Z", updatedAt: "2026-09-05T00:15:00.000Z"
};

function api(forceLocalAttendance = false) {
  return {
    getOfflineRuntimeConfig: vi.fn().mockResolvedValue({ autoSyncEnabled: false, forceLocalAttendance }),
    recordAttendance: vi.fn().mockResolvedValue({ record: localRecord, action: "checked_in", safeMessage: "Check-in recorded locally; synchronization is pending." })
  } as unknown as PLPassDesktopApi;
}

describe("offline attendance recording mode", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("uses SQLite without a Supabase connectivity call when forced-local mode is enabled", async () => {
    window.plpassDesktop = api(true);
    expect(await shouldRecordAttendanceLocally()).toBe(true);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("uses SQLite when connectivity is unavailable", async () => {
    window.plpassDesktop = api(false);
    getUser.mockRejectedValue(new Error("offline"));
    expect(await shouldRecordAttendanceLocally()).toBe(true);
  });

  it("does not use the local route merely because automatic sync is paused", async () => {
    window.plpassDesktop = api(false);
    getUser.mockResolvedValue({ data: { user: { id: "organizer" } }, error: null });
    expect(await shouldRecordAttendanceLocally()).toBe(false);
  });

  it("returns success only after the local IPC write resolves and makes no Supabase attendance write", async () => {
    const desktop = api(true);
    window.plpassDesktop = desktop;
    await expect(recordOfflineAttendance({ eventId: "event-1", sessionId: "session-1", studentId: "student-1", identificationMethod: "qr", attendanceTimestamp: "2026-09-05T00:15:00.000Z" })).resolves.toMatchObject({ record: { localAttendanceUuid: "local-1", syncStatus: "PENDING_SYNC" } });
    expect(desktop.recordAttendance).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
  });
});
