import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const management = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"), "utf8");
const attendance = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventAttendancePage.tsx"), "utf8");
const offlineService = readFileSync(resolve(process.cwd(), "src/features/offline/offlineService.ts"), "utf8");
const phoneScanner = readFileSync(resolve(process.cwd(), "src/scanner/main.ts"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260926161505_reconcile_invited_offline_walkins.sql"), "utf8");
const duplicateGuardMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260926161817_reject_existing_nonmatching_offline_walkin.sql"), "utf8");

describe("Walk-in safety guards", () => {
  it("notifies from the actual permanent-discard path", () => {
    expect(offlineService).toContain('offlineWalkInDiscardedEvent = "plpass:offline-walkin-discarded"');
    expect(offlineService).toContain("notifyOfflineWalkInDiscarded(scan.studentNumber,payload.reasonCode,scan.localScanUuid);");
  });

  it("does not use an online error as permission to save a local record", () => {
    expect(attendance).toContain("if(isConnectivityFailure(error)&&canUsePreparedCache&&event)");
    expect(attendance).toContain("student&&student.isParticipant!==false");
    expect(attendance).toContain("selectedStudent&&selectedStudent.isParticipant!==false");
  });

  it("routes an admitted Walk-in checkout through the guarded RPC", () => {
    expect(management).toContain("const existingWalkIn = await findRemoteWalkIn(matchedStudent.studentNumber);");
    expect(management).toContain('await recordRemoteWalkInTimeOut(existingWalkIn, "QR Code", new Date().toISOString());');
    expect(attendance).toContain("if (existingWalkIn || !participantStudents.some");
    expect(attendance).toContain("if (!isCheckingOut && !await walkInWarning.confirm");
  });

  it("rejects unknown online student numbers before organizer approval", () => {
    expect(management).toContain("No active enrolled student matches this number. No Walk-in attendance was recorded.");
    expect(attendance).toContain("if (!knownStudent) {");
  });

  it("uses the styled Walk-in review in the phone scanner", () => {
    expect(phoneScanner).toContain("function confirmWalkIn(");
    expect(phoneScanner).toContain("Allow as Walk-in");
    expect(phoneScanner).not.toContain("window.confirm(");
  });

  it("converts a stale offline Walk-in into invited attendance and audits actual discards", () => {
    expect(migration).toContain("v_disposition := 'confirmed_invited'");
    expect(migration).toContain("'attendance.offline_invited_reconciled'");
    expect(migration).toContain("'attendance.offline_walkin_discarded'");
    expect(offlineService).toContain('payload?.disposition!=="confirmed_invited"');
    expect(offlineService).toContain("notifyOfflineWalkInResolved({");
  });

  it("finalizes a locally queued duplicate instead of retrying against central attendance", () => {
    expect(duplicateGuardMigration).toContain("v_record.local_attendance_uuid is distinct from p_local_scan_uuid");
    expect(duplicateGuardMigration).toContain("'duplicate_student'");
  });

  it("does not let a stale pending-queue refresh restore a reconciled Walk-in row", () => {
    expect(management).toContain("finalizedLocalWalkInIdsRef.current.add(localScanUuid);");
    expect(management).toContain("!finalizedLocalWalkInIdsRef.current.has(scan.localScanUuid)");
  });

  it("purges temporary Walk-in rows from both live state and the saved browser draft", () => {
    expect(management).toContain("function removeTemporaryWalkInFromDraft(");
    expect(management).toContain("localWalkInScanId(row) !== localScanUuid");
    expect(management).toContain("removeTemporaryWalkInFromDraft(activeScannerSessionId, activeEvent.id, localScanUuid)");
    expect(management).toContain("const localScanUuid = localWalkInScanId(row);");
  });
});
