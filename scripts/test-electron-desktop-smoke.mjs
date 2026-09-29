import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), "plpass-electron-smoke-"));
const organizerId = "00000000-0000-4000-8000-000000000101";
const eventId = "00000000-0000-4000-8000-000000000102";
const sessionId = "00000000-0000-4000-8000-000000000103";
const studentId = "00000000-0000-4000-8000-000000000104";
const startedAt = "2026-09-27T08:00:00.000Z";
const checkedOutAt = "2026-09-27T08:02:00.000Z";

let app;
try {
  app = await electron.launch({
    args: [projectRoot, `--user-data-dir=${userDataDirectory}`],
    cwd: projectRoot,
    // Do not let an organizer's already-running desktop window prevent this
    // isolated smoke application from starting. Its user-data directory is
    // temporary, so it cannot read or modify the organizer's local packages.
    env: {
      ...process.env,
      PLPASS_E2E_ISOLATED: "1",
      PLPASS_FACIAL_API_URL: "http://127.0.0.1:9"
    }
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => typeof window.plpassDesktop === "object");

  const result = await page.evaluate(async ({ organizerId, eventId, sessionId, studentId, startedAt, checkedOutAt }) => {
    const desktop = window.plpassDesktop;
    if (!desktop) throw new Error("PLPass desktop bridge was not exposed.");
    const prepared = await desktop.prepareEvent({
      cacheVersion: 1,
      organizerProfileId: organizerId,
      event: {
        id: eventId,
        code: "DESKTOP-SMOKE",
        title: "Desktop smoke test",
        status: "scheduled",
        startsAt: startedAt,
        endsAt: "2026-09-27T09:00:00.000Z"
      },
      sessions: [{
        id: sessionId,
        eventId,
        title: "Desktop smoke session",
        venue: "Test lab",
        status: "scheduled",
        startsAt: startedAt,
        endsAt: "2026-09-27T09:00:00.000Z",
        lateCutoffAt: "2026-09-27T08:15:00.000Z"
      }],
      participants: [{
        studentId,
        studentNumber: "26-99999",
        displayName: "Desktop Smoke Student",
        participantStatus: "invited",
        qrIdentifier: "desktop-smoke-qr",
        faceEmbeddings: [],
        isParticipant: true
      }],
      attendance: [],
      preparedAt: startedAt
    }, organizerId);
    const started = await desktop.startOfflineSession(eventId, sessionId, organizerId, "2026-09-27", startedAt);
    const checkIn = await desktop.recordAttendance({
      eventId, sessionId, studentId, identificationMethod: "manual", attendanceTimestamp: startedAt
    });
    const phaseBefore = await desktop.getAttendanceCapturePhase(sessionId, organizerId);
    const phaseAfter = await desktop.advanceAttendanceCapturePhase(sessionId, organizerId);
    const checkOut = await desktop.recordScannerAttendance({
      eventId, sessionId, studentId, identificationMethod: "qr", attendanceTimestamp: checkedOutAt
    }, "time_out");
    const pending = await desktop.listPending(eventId, organizerId);
    const ended = await desktop.endOfflineSession(eventId, sessionId, organizerId, checkedOutAt, "desktop smoke test");
    const integrity = await desktop.checkIntegrity();
    return { prepared, started, checkIn, phaseBefore, phaseAfter, checkOut, pending, ended, integrity };
  }, { organizerId, eventId, sessionId, studentId, startedAt, checkedOutAt });

  assert.equal(result.checkIn.action, "checked_in");
  assert.equal(result.phaseBefore, "time_in");
  assert.equal(result.phaseAfter, "time_out");
  assert.equal(result.checkOut.action, "checked_out");
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].timeIn, startedAt);
  assert.equal(result.pending[0].timeOut, checkedOutAt);
  assert.equal(result.pending[0].checkoutIdentificationMethod, "qr");
  assert.equal(result.integrity.integrity, "ok");
  console.log("Desktop smoke passed: preload, SQLite, lifecycle, Time In, Time Out, and integrity checks succeeded.");
} finally {
  await app?.close();
  await rm(userDataDirectory, { recursive: true, force: true });
}
