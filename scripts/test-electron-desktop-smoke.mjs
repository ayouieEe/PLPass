import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), "plpass-electron-smoke-"));
async function removeSmokeDirectory() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(userDataDirectory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
const organizerId = "00000000-0000-4000-8000-000000000101";
const eventId = "00000000-0000-4000-8000-000000000102";
const sessionId = "00000000-0000-4000-8000-000000000103";
const studentId = "00000000-0000-4000-8000-000000000104";
const startedAt = "2026-09-27T08:00:00.000Z";
const checkedOutAt = "2026-09-27T08:02:00.000Z";

let app;
const smokeTimeoutMs = 20_000;
const withSmokeTimeout = (promise, label, timeoutMs = smokeTimeoutMs) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`Electron smoke timed out during ${label} after ${timeoutMs}ms.`)), timeoutMs))
]);
const waitForRendererReady = (page) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    page.off("close", onClose);
    page.off("requestfailed", onRequestFailed);
    page.off("crash", onCrash);
    callback(value);
  };
  const onClose = () => finish(reject, new Error(`Electron smoke renderer closed before the preload bridge was available (URL: ${page.url() || "unknown"}).`));
  const onRequestFailed = (request) => {
    if (request.isNavigationRequest()) finish(reject, new Error(`Electron smoke renderer navigation failed for ${request.url()}: ${request.failure()?.errorText ?? "unknown"}.`));
  };
  const onCrash = () => finish(reject, new Error(`Electron smoke renderer crashed before the preload bridge was available (URL: ${page.url() || "unknown"}).`));
  page.once("close", onClose);
  page.on("requestfailed", onRequestFailed);
  page.once("crash", onCrash);
  void page.waitForFunction(() => typeof window.plpassDesktop === "object", { timeout: smokeTimeoutMs })
    .then(() => finish(resolve), (error) => finish(reject, error));
});
try {
  console.log("Electron smoke: launching isolated app...");
  app = await withSmokeTimeout(electron.launch({
    args: [projectRoot, `--user-data-dir=${userDataDirectory}`, "--headless", "--disable-gpu", "--disable-gpu-compositing", "--use-angle=swiftshader"],
    cwd: projectRoot,
    // Do not let an organizer's already-running desktop window prevent this
    // isolated smoke application from starting. Its user-data directory is
    // temporary, so it cannot read or modify the organizer's local packages.
    env: {
      ...process.env,
      PLPASS_E2E_ISOLATED: "1",
      PLPASS_API_URL: "http://127.0.0.1:9",
      VITE_DEV_SERVER_URL: "plpass://app/"
    }
  }), "app launch");
  app.process().stdout?.on("data", (chunk) => console.error(`Electron smoke main: ${chunk.toString().trim()}`));
  app.process().stderr?.on("data", (chunk) => console.error(`Electron smoke main: ${chunk.toString().trim()}`));
  const page = await withSmokeTimeout(app.firstWindow(), "first window");
  page.on("console", (message) => console.log(`Electron smoke renderer ${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => console.error(`Electron smoke renderer error: ${error.message}`));
  page.on("close", () => console.error("Electron smoke renderer window closed."));
  page.on("requestfailed", (request) => console.error(`Electron smoke request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
  await waitForRendererReady(page);

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
  if (app) {
    const child = app.process();
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 5_000))
    ]);
    try {
      if (child && !child.killed) child.kill("SIGKILL");
      child?.stdout?.removeAllListeners();
      child?.stderr?.removeAllListeners();
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      child?.unref?.();
    } catch {
      // The Electron application may already have exited after a launch timeout.
    }
  }
  await removeSmokeDirectory();
}
