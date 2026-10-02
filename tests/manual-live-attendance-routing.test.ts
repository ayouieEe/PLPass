import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"),
  "utf8",
);

describe("manual live attendance routing", () => {
  it("records cached participants through the desktop offline attendance queue", () => {
    expect(page).toContain('identifyOfflineStudent(eventId, "manual", normalizedInput)');
    expect(page).toContain('identificationMethod: "manual"');
    expect(page).toContain("recordOfflineAttendance({");
  });

  it("retains a typed valid student number as an offline walk-in", () => {
    expect(page).toContain("valid walk-in student number");
    expect(page).toContain("api.queueWalkInScan({");
    expect(page).toContain("identificationMethod: \"manual\"");
  });

  it("does not fall through to the server lookup when a prepared desktop package rejects the entry", () => {
    expect(page).toContain("const preparedLocally = Boolean(");
    expect(page).toContain("if (preparedLocally) {");
    expect(page).toContain("could not be saved locally");
  });

  it("uses local capture only while the session is offline or locally authoritative", () => {
    expect(page).toContain("if (desktopApi() && (isLocalAuthoritativeSession || isOfflineMode))");
    expect(page).toContain("unknown student numbers must go through the");
  });

  it("does not retain an unknown online student as a Walk-in", () => {
    expect(page).toContain("No active enrolled student matches this number. No Walk-in attendance was recorded.");
  });

  it("reconciles a local Time Out phase before the first post-reconnect scan", () => {
    expect(page).toContain("coordinateAttendancePhase");
    expect(page).toContain("storedPhase: cachedPhase");
    expect(page).toContain("advanceServerPhase: () => advanceServerAttendanceCapturePhase(sessionId)");
    expect(page).toContain("effectiveAttendancePhase = await prepareOnlineAttendanceCapture(sessionId);");
  });

  it("resolves a synchronized walk-in before stale participant membership can request a second admission", () => {
    const resolver = page.indexOf("const scannedStudentNumber = extractStudentNumber(scanCode);");
    const participantMatch = page.indexOf("const matchedStudent = activeParticipantIdentities.find");
    expect(resolver).toBeGreaterThan(-1);
    expect(resolver).toBeLessThan(participantMatch);
    expect(page).toContain('await recordRemoteWalkInTimeOut(existingWalkIn, "QR Code", new Date().toISOString())');
  });

  it("removes the temporary walk-in projection by local UUID and student number after sync", () => {
    expect(page).toContain("removeTemporaryWalkInFromDraftByStudentNumber");
    expect(page).toContain("isTemporaryWalkInForStudentNumber(row, studentNumber)");
    expect(page).toContain("const resolvedWalkInNumbers = new Set(");
  });

  it("submits manual attendance from either input with Enter", () => {
    expect(page).toContain("onSubmit={(event) => {");
    expect(page).toContain("event.preventDefault();");
    expect(page).toContain("void submitManualAttendance();");
    expect(page).toContain('onKeyDown={(event) => {');
    expect(page).toContain('event.key !== "Enter" || event.nativeEvent.isComposing');
    expect(page).toContain('<Button type="submit" className="h-11 rounded-lg px-6" disabled={isCaptureCoolingDown}>');
  });

  it("opens the Manual form with the student field ready for Time In or Time Out", () => {
    expect(page).toContain("function activateManualCapture()");
    expect(page).toContain("window.requestAnimationFrame(() => manualInputRef.current?.focus())");
    expect(page).toContain("ref={manualInputRef}");
  });
});
