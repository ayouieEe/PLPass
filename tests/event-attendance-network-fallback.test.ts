import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"), "utf8");
const attendancePage = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventAttendancePage.tsx"), "utf8");
const localDatabase = readFileSync(resolve(process.cwd(), "electron/localDatabase.ts"), "utf8");

describe("event attendance transport fallback", () => {
  it("uses one transport-failure classifier for capture fallback and facial guidance", () => {
    expect(page).toContain("function isAttendanceTransportFailure(error: unknown)");
    expect(page).toContain("const networkFailure = isAttendanceTransportFailure(error);");
    expect(page).toContain("tryRecordManualLocallyAfterTransportFailure");
    expect(page).toContain("QR/manual attendance.");
    expect(page).toContain("cacheOnlineAttendanceForOffline");
  });

  it("mirrors confirmed online attendance before a hybrid connection loss", () => {
    expect(page).toContain("await api.cacheOnlineAttendance({");
    expect(page).toContain("await cacheOnlineAttendanceForOffline({");
    expect(page).toContain("timeIn: record.timeIn ?? \"\"");
    expect(page).toContain("timeIn: saved.timeIn ?? \"\"");
  });

  it("falls back from manual phase, walk-in, and attendance failures to the prepared package", () => {
    const helper = page.indexOf("const tryRecordManualLocallyAfterTransportFailure");
    const onlineManualSubmission = page.indexOf("manualAttendanceMutation.mutateAsync", helper);
    expect(helper).toBeGreaterThan(-1);
    expect(page.indexOf("await prepareOnlineAttendanceCapture(sessionId)", helper)).toBeGreaterThan(-1);
    expect(page.indexOf("record_approved_event_walkin", helper)).toBeGreaterThan(-1);
    expect(onlineManualSubmission).toBeGreaterThan(helper);
    expect(page.indexOf("if (await tryRecordManualLocallyAfterTransportFailure(error)) return;", onlineManualSubmission)).toBeGreaterThan(onlineManualSubmission);
  });

  it("lets explicit attendance retries bypass backoff without retrying quarantined conflicts", () => {
    expect(localDatabase).toContain('const due = forceRetry ? "" : " AND (p.next_attempt_at IS NULL OR p.next_attempt_at <= datetime(\'now\'))"');
    expect(localDatabase).toContain("p.sync_status IN ('PENDING_SYNC','RETRY')");
    expect(localDatabase).not.toContain("void forceRetry");
  });

  it("mirrors walk-in and facial attendance on the legacy live attendance route too", () => {
    expect(attendancePage).toContain("async function cacheOnlineAttendanceForOffline");
    expect(attendancePage).toContain("participantStatus: \"walk_in\"");
    expect(attendancePage).toContain("participantStatus: \"invited\"");
    expect(attendancePage).toContain("await api.cacheOnlineAttendance({");
  });
});
