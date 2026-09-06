import { DatabaseSync } from "node:sqlite";
import { request } from "node:https";
import { get } from "node:http";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalAttendanceDatabase } from "../electron/localDatabase";
import { MemoryScannerCertificateStore, ScannerCoordinator } from "../electron/scannerCoordinator";
import type { PreparedEventPackage } from "@/features/offline/types";

function eventPackage(): PreparedEventPackage {
  const now = Date.now(); const start = new Date(now - 60_000).toISOString(); const end = new Date(now + 60 * 60_000).toISOString();
  return { cacheVersion: 1, preparedAt: start, event: { id: "event-1", code: "EVT-1", title: "Prepared", status: "ongoing", startsAt: start, endsAt: end }, sessions: [{ id: "session-1", eventId: "event-1", title: "Main", venue: "Hall", status: "ongoing", startsAt: start, endsAt: end, lateCutoffAt: end }], participants: [{ studentId: "student-1", studentNumber: "2026-001", displayName: "Ada Student", participantStatus: "confirmed", qrIdentifier: "qr-1", faceEmbeddings: [] }], attendance: [] };
}
function post(url: string, body: unknown, authorization?: string) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const target = new URL(url); const payload = JSON.stringify(body);
    const req = request({ hostname: target.hostname, port: target.port, path: target.pathname, method: "POST", rejectUnauthorized: false, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload), ...(authorization ? { authorization: `Bearer ${authorization}` } : {}) } }, (response) => { const chunks: Buffer[] = []; response.on("data", (chunk) => chunks.push(Buffer.from(chunk))); response.on("end", () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) })); });
    req.on("error", reject); req.end(payload);
  });
}
function page(url: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    get(url, (response) => { const chunks: Buffer[] = []; response.on("data", (chunk) => chunks.push(Buffer.from(chunk))); response.on("end", () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") })); }).on("error", reject);
  });
}

describe("scanner coordinator", () => {
  it("reuses one trusted root certificate across scanner sessions and replaces it on request", async () => {
    const store = new LocalAttendanceDatabase(new DatabaseSync(":memory:")); store.prepareEvent(eventPackage());
    const certificateStore = new MemoryScannerCertificateStore();
    const first = new ScannerCoordinator(store, path.resolve(process.cwd(), "dist"), () => {}, certificateStore);
    const firstStatus = await first.start("event-1", "session-1"); await first.stop();
    const second = new ScannerCoordinator(store, path.resolve(process.cwd(), "dist"), () => {}, certificateStore);
    try {
      const secondStatus = await second.start("event-1", "session-1");
      expect(secondStatus.certificateFingerprint).toBe(firstStatus.certificateFingerprint);
      expect((await second.getCertificateStatus()).configured).toBe(true);
      await second.replaceCertificate();
      expect((await second.getCertificateStatus()).configured).toBe(false);
      const third = new ScannerCoordinator(store, path.resolve(process.cwd(), "dist"), () => {}, certificateStore);
      try { const thirdStatus = await third.start("event-1", "session-1"); expect(thirdStatus.certificateFingerprint).not.toBe(firstStatus.certificateFingerprint); } finally { await third.stop(); }
    } finally { await second.stop(); }
  });

  it("allows five temporary scanner stations through one shared QR and records idempotent QR scans through the laptop database", async () => {
    const store = new LocalAttendanceDatabase(new DatabaseSync(":memory:")); store.prepareEvent(eventPackage());
    const coordinator = new ScannerCoordinator(store, path.resolve(process.cwd(), "dist"), () => {});
    try {
      const active = await coordinator.start("event-1", "session-1");
      const joinUrl = new URL(active.joinUrl!); const sharedToken = joinUrl.searchParams.get("join");
      const bootstrap = await page(joinUrl.toString()); expect(bootstrap.status).toBe(200); expect(bootstrap.body).toContain("Download PLPass Scanner certificate"); expect(bootstrap.body).toContain("Open scanner");
      const secureBase = active.addresses[0];
      const stations = await Promise.all(Array.from({ length: 5 }, () => post(`${secureBase}/api/join`, { joinToken: sharedToken })));
      expect(stations.every((station) => station.status === 200)).toBe(true); const stationToken = String(stations[0].body.stationToken);
      const sixth = await post(`${secureBase}/api/join`, { joinToken: sharedToken }); expect(sixth.status).toBe(409);
      const scanUrl = `${secureBase}/api/scan`; const scan = await post(scanUrl, { credentialCode: "PLPASS-QR:2026-001:qr-1", scanAttemptId: "attempt-1" }, stationToken);
      expect(scan.body.action).toBe("checked_in");
      const replay = await post(scanUrl, { credentialCode: "PLPASS-QR:2026-001:qr-1", scanAttemptId: "attempt-1" }, stationToken);
      expect(replay.body).toEqual(scan.body);
      const secondScan = await post(scanUrl, { credentialCode: "PLPASS-QR:2026-001:qr-1", scanAttemptId: "attempt-2" }, stationToken);
      expect(secondScan.body.action).toBe("already_recorded");
      expect(secondScan.body.message).toBe("Time In was already recorded.");
      expect(store.listPending()).toHaveLength(1);
      expect(store.listPending()[0].timeOut).toBeUndefined();
    } finally { await coordinator.stop(); }
  });
});
