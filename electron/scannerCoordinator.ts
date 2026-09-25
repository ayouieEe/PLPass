import { createServer, type Server as HttpsServer } from "node:https";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import selfsigned from "selfsigned";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalAttendanceDatabase } from "./localDatabase.js";
import type { OfflineAttendanceEvent } from "../src/features/offline/types.js";
import { extractSchoolStudentNumber } from "../src/lib/credentials/qrCredential.js";

export type ScannerStation = { id: string; name: string; joinedAt: string; lastSeenAt: string; lastScanAt?: string };
export type ScannerCoordinatorStatus = {
  active: boolean; eventId?: string; sessionId?: string; port?: number; addresses: string[];
  joinUrl?: string; stations: ScannerStation[]; capturePhase?: AttendanceCapturePhase; certificateFingerprint?: string; certificateExpiresAt?: string;
};
export type ScannerCertificateStatus = { configured: boolean; fingerprint?: string; expiresAt?: string };
export type AttendanceCapturePhase = "time_in" | "time_out";
export type ScannerRootCertificate = { certificate: string; privateKey: string; fingerprint: string; expiresAt: string };
export interface ScannerCertificateStore { load(): Promise<ScannerRootCertificate | null>; save(root: ScannerRootCertificate): Promise<void>; clear(): Promise<void>; }
export class MemoryScannerCertificateStore implements ScannerCertificateStore {
  private root: ScannerRootCertificate | null = null;
  async load() { return this.root; }
  async save(root: ScannerRootCertificate) { this.root = root; }
  async clear() { this.root = null; }
}

type ActiveStation = ScannerStation & { token: string; clientId: string; socket?: WebSocket };

const json = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
};
const token = () => randomBytes(32).toString("base64url");

function privateAddresses() {
  const addresses = Object.values(networkInterfaces()).flat().filter((item): item is NonNullable<typeof item> => Boolean(item && item.family === "IPv4" && !item.internal)).map((item) => item.address);
  // Windows Mobile Hotspot normally uses 192.168.137.1.  Prefer it for the
  // join QR so a phone connected to the hotspot is not sent to the laptop's
  // unrelated upstream Wi-Fi network.
  return addresses.sort((a, b) => {
    const rank = (ip: string) => ip.startsWith("192.168.137.") ? 0 : ip.startsWith("192.168.") ? 1 : ip.startsWith("10.") ? 2 : 3;
    return rank(a) - rank(b);
  });
}

export class ScannerCoordinator {
  private server: HttpsServer | null = null;
  private setupServer: HttpServer | null = null;
  private sockets = new WebSocketServer({ noServer: true });
  private eventId = "";
  private sessionId = "";
  private joinToken = "";
  private joinExpiresAt = 0;
  private readonly stations = new Map<string, ActiveStation>();
  private readonly attempts = new Map<string, unknown>();
  private status: ScannerCoordinatorStatus = { active: false, addresses: [], stations: [] };
  private certificate = "";
  private root: ScannerRootCertificate | null = null;
  private capturePhase: AttendanceCapturePhase = "time_in";

  constructor(private readonly store: LocalAttendanceDatabase, private readonly assetRoot: string, private readonly onStatus: (status: ScannerCoordinatorStatus) => void, private readonly certificateStore: ScannerCertificateStore = new MemoryScannerCertificateStore(), private readonly onAttendance: (event: OfflineAttendanceEvent) => void = () => undefined) {
    this.sockets.on("connection", (socket, request) => {
      const url = new URL(request.url ?? "/", "https://scanner.local");
      const station = this.stationFromToken(url.searchParams.get("token") ?? "");
      if (!station) return socket.close(1008, "Unauthorized scanner station");
      station.socket = socket;
      station.lastSeenAt = new Date().toISOString();
      socket.on("close", () => {
        // A reload can replace the station socket before the old socket emits
        // close. Only remove the station if this is still its active socket.
        if (station.socket === socket) {
          station.socket = undefined;
          this.stations.delete(station.id);
          this.publish();
        }
      });
      socket.on("error", () => socket.close());
      this.send(socket, { type: "status", status: this.publicStatus() });
    });
  }

  async start(eventId: string, sessionId: string, capturePhase: AttendanceCapturePhase = "time_in"): Promise<ScannerCoordinatorStatus> {
    if (this.server) await this.stop();
    const prepared = this.store.getPreparedEvent(eventId);
    if (!prepared?.sessions.some((session) => session.id === sessionId && session.status === "ongoing")) throw new Error("Prepare the active event for offline use before starting scanner stations.");
    this.eventId = eventId; this.sessionId = sessionId; this.capturePhase = capturePhase; this.joinToken = token(); this.joinExpiresAt = Number.POSITIVE_INFINITY;
    const localIps = privateAddresses();
    const root = await this.getOrCreateRoot();
    const pems = await selfsigned.generate([{ name: "commonName", value: "PLPass offline scanner" }], {
      algorithm: "sha256", keySize: 2048, days: 1,
      ca: { key: root.privateKey, cert: root.certificate },
      extensions: [{ name: "basicConstraints", cA: false }, { name: "keyUsage", digitalSignature: true, keyEncipherment: true }, { name: "extKeyUsage", serverAuth: true }, { name: "subjectAltName", altNames: localIps.map((ip) => ({ type: 7, ip })) }]
    } as selfsigned.GenerateOptions);
    this.certificate = root.certificate;
    this.server = createServer({ key: pems.private, cert: `${pems.cert}\n${root.certificate}` }, (request, response) => void this.handle(request, response));
    this.setupServer = createHttpServer((request, response) => void this.handleSetup(request, response));
    this.server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "https://scanner.local");
      if (url.pathname !== "/ws" || !this.stationFromToken(url.searchParams.get("token") ?? "")) return socket.destroy();
      this.sockets.handleUpgrade(request, socket, head, (ws) => this.sockets.emit("connection", ws, request));
    });
    await new Promise<void>((resolve, reject) => this.server?.once("error", reject).listen(0, "0.0.0.0", resolve));
    await new Promise<void>((resolve, reject) => this.setupServer?.once("error", reject).listen(0, "0.0.0.0", resolve));
    const address = this.server.address(); const port = typeof address === "object" && address ? address.port : undefined;
    const setupAddress = this.setupServer.address(); const setupPort = typeof setupAddress === "object" && setupAddress ? setupAddress.port : undefined;
    const addresses = localIps.map((ip) => `https://${ip}:${port}`);
    const setupBase = localIps[0] ? `http://${localIps[0]}:${setupPort}` : undefined;
    this.status = { active: true, eventId, sessionId, port, addresses, joinUrl: setupBase ? `${setupBase}/join?join=${this.joinToken}` : undefined, stations: [], capturePhase, certificateFingerprint: root.fingerprint, certificateExpiresAt: root.expiresAt };
    this.publish();
    return this.publicStatus();
  }

  async stop() {
    this.joinToken = ""; this.joinExpiresAt = 0; this.stations.clear(); this.attempts.clear();
    this.sockets.clients.forEach((socket) => socket.close(1001, "Scanner session ended"));
    await new Promise<void>((resolve) => this.server ? this.server.close(() => resolve()) : resolve());
    await new Promise<void>((resolve) => this.setupServer ? this.setupServer.close(() => resolve()) : resolve());
    this.server = null; this.setupServer = null; this.status = { active: false, addresses: [], stations: [] }; this.publish();
  }
  getStatus() { return this.publicStatus(); }
  async getCertificateStatus(): Promise<ScannerCertificateStatus> {
    const root = this.root ?? await this.certificateStore.load();
    if (!root || Date.parse(root.expiresAt) <= Date.now()) return { configured: false };
    return { configured: true, fingerprint: root.fingerprint, expiresAt: root.expiresAt };
  }
  async replaceCertificate() { await this.stop(); this.root = null; await this.certificateStore.clear(); return { configured: false } satisfies ScannerCertificateStatus; }
  removeStation(stationId: string) { this.stations.delete(stationId); this.publish(); }
  setCapturePhase(phase: AttendanceCapturePhase) { if (!this.server) throw new Error("Start scanner stations before changing the attendance phase."); this.capturePhase = phase; this.status = { ...this.status, capturePhase: phase }; this.publish(); return this.publicStatus(); }
  private async getOrCreateRoot(): Promise<ScannerRootCertificate> {
    const stored = this.root ?? await this.certificateStore.load();
    if (stored && Date.parse(stored.expiresAt) > Date.now()) { this.root = stored; return stored; }
    if (stored) await this.certificateStore.clear();
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60_000).toISOString();
    const pems = await selfsigned.generate([{ name: "commonName", value: "PLPass Scanner Root" }], {
      algorithm: "sha256", keySize: 2048, days: 365,
      extensions: [{ name: "basicConstraints", cA: true, pathLenConstraint: 0, critical: true }, { name: "keyUsage", digitalSignature: true, keyCertSign: true, cRLSign: true, critical: true }]
    });
    const root = { certificate: pems.cert, privateKey: pems.private, fingerprint: pems.fingerprint, expiresAt };
    await this.certificateStore.save(root); this.root = root; return root;
  }
  private publicStatus(): ScannerCoordinatorStatus {
    return {
      ...this.status,
      stations: [...this.stations.values()].map((station) => {
        const { token, clientId, socket, ...publicStation } = station;
        void token;
        void clientId;
        void socket;
        return publicStation;
      })
    };
  }
  private publish() { const status = this.publicStatus(); this.onStatus(status); this.sockets.clients.forEach((socket) => this.send(socket, { type: "status", status })); }
  private send(socket: WebSocket, body: unknown) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(body)); }
  private stationFromToken(value: string) { return [...this.stations.values()].find((station) => station.token === value); }
  private async body(request: IncomingMessage) { const chunks: Buffer[] = []; for await (const chunk of request) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).byteLength > 32_000) throw new Error("Request too large"); } return JSON.parse(Buffer.concat(chunks).toString("utf8")); }

  private async handle(request: IncomingMessage, response: ServerResponse) {
    try {
      const url = new URL(request.url ?? "/", "https://scanner.local");
      if (request.method === "GET" && url.pathname === "/scanner") return this.page(response, "scanner.html");
      if (request.method === "POST" && url.pathname === "/api/join") {
        const input = await this.body(request) as { joinToken?: string; scannerId?: string };
        if (!input.joinToken || input.joinToken !== this.joinToken || Date.now() > this.joinExpiresAt) return json(response, 401, { error: "This scanner session is no longer active. Scan the organizer's current Join scanner stations QR." });
        const scannerId = input.scannerId?.trim();
        const existing = scannerId ? [...this.stations.values()].find((station) => station.clientId === scannerId) : undefined;
        if (existing) {
          existing.lastSeenAt = new Date().toISOString();
          return json(response, 200, { station: { id: existing.id, name: existing.name }, stationToken: existing.token, sessionId: this.sessionId, capturePhase: this.capturePhase });
        }
        if (this.stations.size >= 5) return json(response, 409, { error: "All five scanner stations are already connected. Ask the organizer to remove a station before joining." });
        const station: ActiveStation = { id: randomUUID(), clientId: scannerId || randomUUID(), name: `Scanner ${this.stations.size + 1}`, token: token(), joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
        this.stations.set(station.id, station); this.publish(); return json(response, 200, { station: { id: station.id, name: station.name }, stationToken: station.token, sessionId: this.sessionId, capturePhase: this.capturePhase });
      }
      if (request.method === "POST" && url.pathname === "/api/ping") {
        const auth = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
        const station = this.stationFromToken(auth);
        if (!station) return json(response, 401, { error: "Scanner station is no longer connected. Rejoin from the organizer session QR." });
        station.lastSeenAt = new Date().toISOString();
        return json(response, 200, { ok: true, capturePhase: this.capturePhase });
      }
      if (request.method === "POST" && url.pathname === "/api/walk-in") {
        const auth=request.headers.authorization?.replace(/^Bearer\s+/i,"")??"";const station=this.stationFromToken(auth);
        if(!station||!this.eventId||!this.sessionId) return json(response,401,{error:"Scanner station is no longer connected. Rejoin from the organizer session QR."});
        const input=await this.body(request) as {studentNumber?:string};
        const studentNumber=input.studentNumber?.trim()??"";
        if(!/^\d{2}-\d{5}$/.test(studentNumber)) return json(response,400,{error:"A valid student number is required for walk-in review."});
        const pkg=this.store.getPreparedEvent(this.eventId);
        if(!pkg?.organizerProfileId) return json(response,409,{error:"The organizer-owned offline event package is unavailable."});
        const recordedAt=new Date().toISOString();
        try {
          // Keep the phone coordinator and the local session cache on the
          // same one-way phase. This also repairs a stale coordinator after
          // the organizer page is reloaded or restored from server state.
          const localPhase=this.store.getAttendanceCapturePhase(this.sessionId,pkg.organizerProfileId);
          if(this.capturePhase==="time_out"&&localPhase==="time_in") this.store.advanceAttendanceCapturePhase(this.sessionId,pkg.organizerProfileId);
          else if(localPhase!==this.capturePhase){this.capturePhase=localPhase;this.status={...this.status,capturePhase:localPhase};this.publish();}
          const queued=this.store.queueWalkInScan({eventId:this.eventId,sessionId:this.sessionId,studentNumber,identificationMethod:"qr",capturePhase:this.capturePhase,attendanceTimestamp:recordedAt,organizerProfileId:pkg.organizerProfileId});
          station.lastSeenAt=recordedAt;station.lastScanAt=recordedAt;
          const action: OfflineAttendanceEvent["action"] = queued.action ?? (this.capturePhase === "time_in" ? "checked_in" : "checked_out");
          const resultRecordedAt = action === "already_recorded" ? queued.timeIn : recordedAt;
          const result={accepted:action !== "already_recorded",action,studentNumber:queued.studentNumber,recordedAt:resultRecordedAt,message:action === "already_recorded" ? "This walk-in already has Time In recorded." : `${this.capturePhase==="time_in"?"Time In":"Time Out"} saved on this device at ${new Date(recordedAt).toLocaleTimeString()}; not synced. Identity is unverified.`};
          this.onAttendance({eventId:this.eventId,sessionId:this.sessionId,studentNumber:queued.studentNumber,action:result.action,recordedAt:resultRecordedAt,timeIn:queued.timeIn,timeOut:queued.timeOut,syncStatus:queued.syncStatus,message:result.message,source:"phone_scanner"});
          this.publish();this.sockets.clients.forEach((socket)=>this.send(socket,{type:"scan",result}));return json(response,200,result);
        }catch(error){return json(response,409,{accepted:false,error:error instanceof Error?error.message:"Walk-in scan could not be saved."});}
      }
      if (request.method === "POST" && url.pathname === "/api/scan") {
        const auth = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? ""; const station = this.stationFromToken(auth);
        if (!station) return json(response, 401, { error: "Scanner station is no longer connected. Rejoin from the organizer session QR." });
        const input = await this.body(request) as { credentialCode?: string; scanAttemptId?: string };
        if (!input.credentialCode?.trim() || !input.scanAttemptId?.trim()) return json(response, 400, { error: "A QR credential and scan attempt ID are required." });
        const prior = this.attempts.get(input.scanAttemptId); if (prior) return json(response, 200, prior);
        station.lastSeenAt = new Date().toISOString(); station.lastScanAt = station.lastSeenAt;
        // Student QR payloads contain only the printed student number or full
        // name. Opaque credential IDs and PLPASS-QR wrappers are rejected by
        // the participant lookup.
        const student = this.store.identifyQr(this.eventId, input.credentialCode.trim());
        const cachedAttendance = student?.isParticipant !== false ? (student ? this.store.getAttendanceState(this.sessionId, student.studentId) : null) : null;
        const unlistedStudentNumber=!student?extractSchoolStudentNumber(input.credentialCode):"";
        const recordedAt=new Date().toISOString();
        const result = student?.isParticipant === false ? { accepted:false, requiresWalkInConfirmation:true, verifiedStudent:true, studentName:student.displayName, studentNumber:student.studentNumber, message:`${student.displayName} is not on this event's participant list. Confirm to save this verified student as a walk-in.` } : !student ? { accepted: false, ...(unlistedStudentNumber?{requiresWalkInConfirmation:true,studentNumber:unlistedStudentNumber}:{}), message: unlistedStudentNumber?"Student is not in the cached student directory. Ask the organizer whether to save this as an unverified walk-in.":"Invalid or ineligible student QR credential." } : cachedAttendance?.timeIn && this.capturePhase === "time_in" ? {
          accepted: false,
          action: "already_recorded" as const,
          message: "Time In was already recorded.",
          studentName: student.displayName,
          studentNumber: student.studentNumber
        } : (() => {
          try { const attendance = this.capturePhase === "time_in" ? this.store.recordScannerCheckIn({ eventId: this.eventId, sessionId: this.sessionId, studentId: student.studentId, identificationMethod: "qr", attendanceTimestamp: recordedAt, deviceId: station.id }) : this.store.recordScannerCheckOut({ eventId: this.eventId, sessionId: this.sessionId, studentId: student.studentId, identificationMethod: "qr", attendanceTimestamp: recordedAt, deviceId: station.id }); const label = this.capturePhase === "time_in" ? "Time In" : "Time Out"; const event={eventId:this.eventId,sessionId:this.sessionId,studentId:student.studentId,studentNumber:student.studentNumber,displayName:student.displayName,action:attendance.action,recordedAt:attendance.record.attendanceTimestamp,timeIn:attendance.record.timeIn,timeOut:attendance.record.timeOut,syncStatus:attendance.record.syncStatus,message:attendance.action === "already_recorded" ? `${label} was already recorded.` : `${label} saved on this device at ${new Date(attendance.record.attendanceTimestamp).toLocaleTimeString()}; not synced.`,source:"phone_scanner"} satisfies OfflineAttendanceEvent; this.onAttendance(event); return { accepted: attendance.action !== "already_recorded", action: attendance.action, recordedAt:attendance.record.attendanceTimestamp, studentName: student.displayName, studentNumber: student.studentNumber, message: event.message }; } catch (error) { return { accepted: false, message: error instanceof Error ? error.message : "Attendance could not be recorded." }; }
        })();
        this.attempts.set(input.scanAttemptId, result); if (this.attempts.size > 500) this.attempts.delete(this.attempts.keys().next().value as string);
        this.publish(); this.sockets.clients.forEach((socket) => this.send(socket, { type: "scan", result })); return json(response, 200, result);
      }
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/scanner.html")) return this.page(response, "scanner.html");
      if (request.method === "GET" && url.pathname.startsWith("/assets/")) return this.page(response, url.pathname.slice(1));
      json(response, 404, { error: "Not found" });
    } catch { json(response, 400, { error: "The scanner request could not be processed." }); }
  }
  private async handleSetup(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://scanner.local");
    if (request.method === "GET" && url.pathname === "/certificate.cer") { response.writeHead(200, { "content-type": "application/x-x509-ca-cert", "content-disposition": "attachment; filename=plpass-scanner-event.cer" }); return response.end(this.certificate); }
    if (request.method === "GET" && (url.pathname === "/join" || url.pathname === "/")) {
      const join = url.searchParams.get("join") ?? "";
      if (!join || join !== this.joinToken || Date.now() > this.joinExpiresAt) return json(response, 410, { error: "This scanner session has ended. Ask the organizer to start scanner stations again." });
      const scannerUrl = `${this.status.addresses[0]}/scanner?join=${encodeURIComponent(join)}`;
      return this.setupPage(response, scannerUrl);
    }
    json(response, 404, { error: "Not found" });
  }
  private setupPage(response: ServerResponse, scannerUrl: string) {
    const safeUrl = scannerUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const trustKey = `plpass-scanner-trusted:${this.root?.fingerprint ?? "unknown"}`;
    const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Join PLPass scanner</title><style>body{margin:0;background:#f6faf5;color:#1d2a20;font:17px system-ui,-apple-system,sans-serif}.card{max-width:520px;margin:12vh auto;padding:32px;border:1px solid #d7e5d5;border-radius:24px;background:white;box-shadow:0 12px 36px #1d2a2014}h1{margin:0 0 12px}p,li{line-height:1.55;color:#526056}.button{display:block;margin:16px 0;padding:14px 18px;border-radius:12px;background:#3e7743;color:white;text-align:center;font-weight:700;text-decoration:none}.secondary{background:white;color:#285d32;border:1px solid #b9d4ba}.small{font-size:14px}</style></head><body><main class="card"><h1>Join PLPass scanner</h1><p>Use this same QR on up to five phones. Keep this phone connected to the organizer laptop’s Wi-Fi hotspot.</p><p><strong>First time on this phone?</strong> Trust the PLPass Scanner certificate once so this browser can use its camera offline.</p><a class="button" href="/certificate.cer">Download PLPass Scanner certificate</a><ol class="small"><li>Install the downloaded certificate profile.</li><li>On iPhone, enable full trust in Settings after installation. On Android, install it as a CA certificate if asked.</li><li>Return here and open the scanner.</li></ol><a id="open-scanner" class="button secondary" href="${safeUrl}">Open scanner</a><p class="small">This certificate is valid for future PLPass scanner sessions on this laptop until it expires or the organizer replaces it.</p></main><script>const openScanner=document.getElementById('open-scanner'),trustKey=${JSON.stringify(trustKey)};if(localStorage.getItem(trustKey)==='1'){location.replace(openScanner.href)}else{openScanner.addEventListener('click',()=>localStorage.setItem(trustKey,'1'))}</script></body></html>`;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(body);
  }
  private async page(response: ServerResponse, relative: string) {
    const safe = path.resolve(this.assetRoot, relative); if (!safe.startsWith(this.assetRoot)) return json(response, 404, { error: "Not found" });
    const body = await readFile(safe); const type = safe.endsWith(".html") ? "text/html; charset=utf-8" : safe.endsWith(".js") ? "text/javascript; charset=utf-8" : safe.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream";
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" }); response.end(body);
  }
}
