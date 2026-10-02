import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatAttendanceMethod } from "@/features/organizer/data/organizerUiStore";

const repository = readFileSync(resolve(process.cwd(), "src/services/supabase/repositories.ts"), "utf8");
const eventManagement = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"), "utf8");
const desktopPreload = readFileSync(resolve(process.cwd(), "electron/preload.cjs"), "utf8");
const summaries = readFileSync(resolve(process.cwd(), "src/features/organizer/hooks/useEventAttendance.ts"), "utf8");
const offlineService = readFileSync(resolve(process.cwd(), "src/features/offline/offlineService.ts"), "utf8");
const approvedWalkInMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260926100000_approved_walkin_attendance.sql"), "utf8");

describe("paired attendance methods", () => {
  it("renders Time In and Time Out methods in chronological order", () => {
    expect(formatAttendanceMethod({ attendanceMethod: "QR Code" })).toBe("QR Code");
    expect(formatAttendanceMethod({ attendanceMethod: "QR Code", checkoutAttendanceMethod: "Manual" })).toBe("QR Code / Manual");
    expect(formatAttendanceMethod({ attendanceMethod: "Manual", checkoutAttendanceMethod: "Manual" })).toBe("Manual");
  });

  it("passes the active session through Electron's runtime preload before restoring walk-ins", () => {
    expect(desktopPreload).toContain('listPendingWalkInScans: (eventId, ownerId, activeSessionId) => ipcRenderer.invoke("offline:listWalkins", eventId, ownerId, activeSessionId)');
  });

  it("persists a QR checkout separately without replacing the check-in method", () => {
    expect(repository).toContain("checkout_verification_method: input.method");
  });

  it("keeps the saved check-in and checkout methods when updating the live table", () => {
    expect(eventManagement).toContain("attendanceMethod: isCheckout && currentRow ? currentRow.attendanceMethod");
    expect(eventManagement).toContain('checkoutAttendanceMethod: "Manual" as const');
    expect(summaries).toContain("checkout_verification_method");
  });

  it("does not let a stale desktop refresh erase a QR checkout already shown in the live table", () => {
    expect(eventManagement).toContain("const preservesExistingCheckOut = preservesExistingCheckIn");
    expect(eventManagement).toContain("return phoneRows.reduce(upsertAttendanceRow, retainedRows);");
    expect(eventManagement).toContain("return restoredRows.reduce(upsertAttendanceRow, withoutResolvedTemporaryWalkIns);");
  });

  it("removes a locally rendered walk-in after reconciliation permanently discards it", () => {
    expect(eventManagement).toContain("a permanent reconciliation");
    expect(eventManagement).toContain("const retainedRows = rows.filter");
    expect(eventManagement).not.toContain("if (records.length || walkIns.length)");
  });

  it("synchronizes an approved offline walk-in checkout method separately", () => {
    expect(offlineService).toContain("record_approved_event_walkin");
    expect(offlineService).toContain("p_checkout_identification_method:scan.checkoutIdentificationMethod");
  });

  it("keeps server-side approved walk-ins check-outable after offline preparation", () => {
    expect(summaries).toContain("attendance_origin");
    expect(eventManagement).toContain('rpc("record_approved_event_walkin"');
    expect(eventManagement).toContain("await findRemoteWalkIn(studentNumber)");
    expect(eventManagement).toContain('.eq("event_session_id", activeScannerSessionId)');
    expect(eventManagement).toContain('.eq("attendance_origin", "walk_in")');
    expect(approvedWalkInMigration).toContain("create or replace function public.record_approved_event_walkin");
    expect(approvedWalkInMigration).toContain("p_checkout_identification_method");
  });

  it("uses the original saved walk-in methods after a QR retry or checkout", () => {
    expect(eventManagement).toContain("attendanceMethod:attendanceMethodFromVerification(queued.identificationMethod)");
    expect(eventManagement).toContain("checkoutAttendanceMethod: attendanceMethodFromVerification(queued.checkoutIdentificationMethod)");
    expect(eventManagement).not.toContain('attendanceMethod:"QR Code",checkInAt:queued.timeIn');
  });

  it("restores server walk-ins and checkout methods after the live page restarts", () => {
    expect(eventManagement).toContain("useAttendanceSummaries(activeEvent?.id ? [activeEvent.id] : [], !isLocalAuthoritativeSession)");
    expect(eventManagement).toContain("const persistedRows = summary.rows");
    expect(eventManagement).toContain("checkoutAttendanceMethod: row.checkoutAttendanceMethod");
    expect(eventManagement).toContain("studentId: row.studentId");
  });

  it("converts only uniquely resolvable legacy rows and removes the obsolete queue", () => {
    expect(approvedWalkInMigration).toContain("if v_matches=1 then");
    expect(approvedWalkInMigration).toContain("attendance_origin='walk_in'");
    expect(approvedWalkInMigration).toContain("drop table if exists public.unverified_walkin_attendance;");
  });

  it("labels duplicate Time In and completed-attendance retries accurately", () => {
    expect(eventManagement).toContain("function alreadyRecordedAttendanceLabel");
    expect(eventManagement).toContain("alreadyRecordedAttendanceLabel(local.record.timeOut)");
    expect(eventManagement).toContain("alreadyRecordedAttendanceLabel(queued.timeOut)");
    expect(eventManagement).toContain("existing?.checkOutAt");
  });
});
