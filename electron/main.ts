import { app, BrowserWindow, ipcMain, net, protocol, safeStorage } from "electron";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { LocalAttendanceDatabase } from "./localDatabase.js";
import { ScannerCoordinator, type ScannerCertificateStore, type ScannerRootCertificate } from "./scannerCoordinator.js";
import type { LocalAttendanceInput, LocalAttendanceResult, OfflineAttendanceEvent } from "../src/features/offline/types.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
let store: LocalAttendanceDatabase;
let scannerCoordinator: ScannerCoordinator;
let facialService: ChildProcess | undefined;

function publishOfflineAttendance(event: OfflineAttendanceEvent) {
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("offline:attendance-recorded", event));
}

function offlineAttendanceEvent(input: LocalAttendanceInput, result: LocalAttendanceResult): OfflineAttendanceEvent {
  const participant = store.getPreparedEvent(input.eventId)?.participants.find((item) => item.studentId === input.studentId);
  return { eventId: input.eventId, sessionId: input.sessionId, studentId: input.studentId, studentNumber: participant?.studentNumber, displayName: participant?.displayName, action: result.action, recordedAt: result.record.attendanceTimestamp, timeIn: result.record.timeIn, timeOut: result.record.timeOut, syncStatus: result.record.syncStatus, message: result.safeMessage, source:"organizer" };
}

const workspaceRoot = path.resolve(directory, "..", "..");
const facialApiBaseUrl = process.env.PLPASS_FACIAL_API_URL ?? "http://127.0.0.1:8000";
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function backupOfflineDatabaseBeforeIndexRepair(databasePath: string, indexes: string[]) {
  if (!existsSync(databasePath)) return;
  const backupDirectory = path.join(path.dirname(databasePath), "offline-index-repair-backups");
  mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${databasePath}${suffix}`;
    if (!existsSync(source)) continue;
    copyFileSync(source, path.join(backupDirectory, `plpass-offline-${timestamp}${suffix}`));
  }
  console.warn(`Backed up PLPass offline SQLite files before rebuilding indexes: ${indexes.join(", ")}`);
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
}

async function facialServiceReady() {
  try {
    const response = await fetch(`${facialApiBaseUrl}/openapi.json`);
    return response.ok;
  } catch {
    return false;
  }
}

function localPythonPath() {
  const configured = process.env.PLPASS_PYTHON_PATH;
  if (configured && existsSync(configured)) return configured;
  const developmentPython = path.join(workspaceRoot, ".venv", "Scripts", "python.exe");
  return existsSync(developmentPython) ? developmentPython : undefined;
}

function localPythonWindowlessPath() {
  const configured = process.env.PLPASS_PYTHON_PATH;
  if (configured) {
    const windowless = configured.replace(/python(?:\.exe)?$/i, "pythonw.exe");
    if (existsSync(windowless)) return windowless;
  }
  const developmentPython = path.join(workspaceRoot, ".venv", "Scripts", "pythonw.exe");
  return existsSync(developmentPython) ? developmentPython : localPythonPath();
}

async function ensureLocalFacialService() {
  if (await facialServiceReady()) return;
  const python = localPythonPath();
  if (!python) {
    throw new Error("Offline facial recognition needs the PLPass Python runtime. Install it or configure PLPASS_PYTHON_PATH.");
  }
  if (!facialService || facialService.exitCode !== null) {
    facialService = spawn(localPythonWindowlessPath() ?? python, ["-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8000"], {
      cwd: workspaceRoot,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    facialService.unref();
  }
  // The first ArcFace/RetinaFace initialization can take about a minute on a
  // fresh desktop, while later launches use the cached models.
  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await facialServiceReady()) return;
  }
  throw new Error("The local PLPass model service did not start. Check the configured Python runtime and try again.");
}

async function identifyOfflineFace(eventId: string, capture: number[]) {
  await ensureLocalFacialService();
  const cachedCandidates = store.listFaceCandidates(eventId);
  const candidates = cachedCandidates.map((candidate) => ({
    student_id: candidate.studentId,
    embeddings: candidate.faceEmbeddings
  }));
  if (!candidates.length) return null;

  const body = new FormData();
  body.append("capture", new Blob([new Uint8Array(capture)], { type: "image/jpeg" }), "offline-face.jpg");
  body.append("candidates", JSON.stringify(candidates));
  const response = await fetch(`${facialApiBaseUrl}/facial/offline-identify`, { method: "POST", body });
  const payload = await response.json().catch(() => null) as { student_id?: unknown; detail?: { message?: unknown } } | null;
  if (!response.ok) {
    const message = payload?.detail && typeof payload.detail.message === "string"
      ? payload.detail.message
      : "Offline face verification could not be completed.";
    throw new Error(message);
  }
  const studentId = typeof payload?.student_id === "string" ? payload.student_id : null;
  const match = studentId ? cachedCandidates.find((candidate) => candidate.studentId === studentId) : undefined;
  return match
    ? {
        studentId: match.studentId,
        studentNumber: match.studentNumber,
        displayName: match.displayName,
        participantStatus: match.participantStatus,
        qrIdentifier: match.qrIdentifier
      }
    : null;
}

function scannerCertificateStore(userDataPath: string): ScannerCertificateStore {
  const file = path.join(userDataPath, "scanner-root-certificate.json");
  return {
    async load() {
      try {
        if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows encryption is unavailable for the PLPass Scanner certificate.");
        const saved = JSON.parse(await readFile(file, "utf8")) as Omit<ScannerRootCertificate, "privateKey"> & { encryptedPrivateKey: string };
        return { certificate: saved.certificate, fingerprint: saved.fingerprint, expiresAt: saved.expiresAt, privateKey: safeStorage.decryptString(Buffer.from(saved.encryptedPrivateKey, "base64")) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async save(root) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows encryption is unavailable for the PLPass Scanner certificate.");
      await mkdir(userDataPath, { recursive: true });
      const value = JSON.stringify({ certificate: root.certificate, fingerprint: root.fingerprint, expiresAt: root.expiresAt, encryptedPrivateKey: safeStorage.encryptString(root.privateKey).toString("base64") });
      const temporary = `${file}.tmp`; await writeFile(temporary, value, { encoding: "utf8", mode: 0o600 }); await rename(temporary, file);
    },
    async clear() { try { await unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  };
}

function offlineIdentityStore(userDataPath:string) {
  const file=path.join(userDataPath,"offline-organizer-identity.json");
  return {
    async save(identity:{userId:string;role:string;displayName:string;email:string;accountStatus?:string;departmentId?:string}) {
      if(!safeStorage.isEncryptionAvailable()) throw new Error("Windows secure storage is unavailable. Offline sign-in cannot be enabled.");
      if(!identity.userId||identity.role!=="organizer"||identity.accountStatus==="inactive"||identity.accountStatus==="suspended") throw new Error("Only a verified active organizer can enable offline sign-in.");
      await mkdir(userDataPath,{recursive:true});
      const serialized=JSON.stringify({...identity,savedAt:Date.now()});
      const temporary=`${file}.tmp`;
      await writeFile(temporary,safeStorage.encryptString(serialized).toString("base64"),{encoding:"utf8",mode:0o600});
      await rename(temporary,file);
    },
    async get(userId?:string) {
      if(!safeStorage.isEncryptionAvailable()) return null;
      try {
        const stored=await readFile(file,"utf8");
        const identity=JSON.parse(safeStorage.decryptString(Buffer.from(stored,"base64"))) as {userId?:unknown;role?:unknown;displayName?:unknown;email?:unknown;accountStatus?:unknown;departmentId?:unknown;savedAt?:unknown};
        if(typeof identity.userId!=="string"||identity.role!=="organizer"||typeof identity.displayName!=="string"||typeof identity.email!=="string"||!Number.isFinite(identity.savedAt)||Date.now()-Number(identity.savedAt)>24*60*60_000||(userId&&identity.userId!==userId)||["inactive","suspended"].includes(String(identity.accountStatus))) return null;
        return identity;
      } catch { return null; }
    },
    async clear() { try { await unlink(file); } catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT") throw error; } }
  };
}

// This must run before Electron becomes ready. Vite's absolute asset paths and
// React Router need a standard origin instead of a plain file:// document.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "plpass",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function registerHandlers() {
  const identityStore=offlineIdentityStore(app.getPath("userData"));
  const handlers: Record<string, (...args: never[]) => unknown> = {
    "offline:saveIdentity": (identity) => identityStore.save(identity), "offline:getIdentity": (userId) => identityStore.get(userId), "offline:clearIdentity": () => identityStore.clear(),
    "offline:prepare": (pkg, organizerId) => store.prepareEvent(pkg, organizerId), "offline:listPrepared": (organizerId, day) => store.listPreparedEvents(organizerId, day),
    "offline:hasWork": (organizerId) => store.hasUnresolvedWork(organizerId),
    "offline:startSession": (eventId, sessionId, organizerId, day, at) => store.startOfflineSession(eventId, sessionId, organizerId, day, at),
    "offline:endSession": (eventId, sessionId, organizerId, at, reason) => { const result = store.endOfflineSession(eventId, sessionId, organizerId, at, reason); const scanner = scannerCoordinator?.getStatus(); if (scanner?.sessionId === sessionId) void scannerCoordinator.stop(); return result; },
    "offline:setLifecycle": (eventId, sessionId, state) => store.setOfflineLifecycleState(eventId, sessionId, state),
    "offline:status": (id, ownerId) => store.getStatusForOrganizer(id, ownerId), "offline:getPreparedEvent": (id, ownerId) => store.getPreparedEventForOrganizer(id, ownerId), "offline:getPreparedEventBySession": (id, ownerId) => store.getPreparedEventBySessionForOrganizer(id, ownerId),
    "offline:identifyQr": (eventId, qr) => store.identifyQr(eventId, qr), "offline:identifyManual": (eventId, value) => store.identifyManual(eventId, value),
    "offline:identifyFace": (eventId, capture) => identifyOfflineFace(eventId, capture), "offline:record": (input) => { const attendanceInput = input as unknown as LocalAttendanceInput; const result = store.recordAttendance(attendanceInput); publishOfflineAttendance(offlineAttendanceEvent(attendanceInput, result)); return result; },
    "offline:recordScanner": (input, phase) => { const attendanceInput = input as unknown as LocalAttendanceInput; const capturePhase = phase as unknown as "time_in" | "time_out"; const result = capturePhase === "time_out" ? store.recordScannerCheckOut(attendanceInput) : store.recordScannerCheckIn(attendanceInput); publishOfflineAttendance(offlineAttendanceEvent(attendanceInput, result)); return result; },
    "offline:capturePhase": (sessionId, ownerId) => store.getAttendanceCapturePhase(sessionId,ownerId), "offline:advancePhase": (sessionId,ownerId) => store.advanceAttendanceCapturePhase(sessionId,ownerId),
    "offline:queueWalkin": (input) => { const walkInInput = input as unknown as {eventId:string;sessionId:string;studentNumber:string;identificationMethod:"qr"|"manual";capturePhase:"time_in"|"time_out";attendanceTimestamp:string;organizerProfileId:string}; const result = store.queueWalkInScan(walkInInput); publishOfflineAttendance({ eventId: walkInInput.eventId, sessionId: walkInInput.sessionId, studentNumber: result.studentNumber, action: walkInInput.capturePhase === "time_in" ? "checked_in" : "checked_out", recordedAt: walkInInput.attendanceTimestamp, timeIn: result.timeIn, timeOut: result.timeOut, syncStatus: result.syncStatus, message: `${walkInInput.capturePhase === "time_in" ? "Time In" : "Time Out"} saved on this device at ${new Date(walkInInput.attendanceTimestamp).toLocaleTimeString()}; not synced.`,source:"organizer" }); return result; }, "offline:listWalkins": (eventId,ownerId) => store.listPendingWalkInScans(eventId,ownerId),
    "offline:beginWalkinSync": (limit,ownerId,forceRetry) => store.beginWalkInSync(limit,ownerId,forceRetry), "offline:confirmWalkinSync": (id,student) => store.confirmWalkInSync(id,student), "offline:discardWalkinSync": (id,ownerId) => store.discardWalkInSync(id,ownerId), "offline:failWalkinSync": (id,status,error) => store.failWalkInSync(id,status,error),
    "offline:listPending": (eventId, organizerId) => store.listPending(eventId, organizerId), "offline:beginSync": (limit, forceRetry, organizerId) => store.beginSync(limit, forceRetry, organizerId),
    "offline:confirmSync": (uuid, serverId, status, timeOut) => store.confirmSync(uuid, serverId, status, timeOut), "offline:failSync": (uuid,status,error) => store.failSync(uuid,status,error),
    "offline:recover": (organizerId) => store.recoverInterruptedSync(organizerId), "offline:cleanup": (eventId,verified,completed) => store.cleanupEvent(eventId,verified,completed), "offline:integrity": () => store.checkIntegrity(),
    "ml:ensure": () => ensureLocalFacialService()
  };
  handlers["scanner:start"] = (eventId, sessionId, phase, ownerId) => {
    if (!store.getPreparedEventForOrganizer(eventId, ownerId)) throw new Error("The event package is not available to this organizer on this device.");
    if (store.getAttendanceCapturePhase(sessionId,ownerId)!==phase) throw new Error("The scanner phase does not match this event's saved attendance step.");
    return scannerCoordinator.start(eventId, sessionId, phase);
  };
  handlers["scanner:stop"] = () => scannerCoordinator.stop();
  handlers["scanner:status"] = () => scannerCoordinator.getStatus();
  handlers["scanner:certificateStatus"] = () => scannerCoordinator.getCertificateStatus();
  handlers["scanner:replaceCertificate"] = () => scannerCoordinator.replaceCertificate();
  handlers["scanner:remove"] = (stationId) => scannerCoordinator.removeStation(stationId);
  handlers["scanner:setPhase"] = (phase) => { const scanner=scannerCoordinator.getStatus(); if(!scanner.sessionId||!scanner.eventId) throw new Error("No active scanner session is available."); if(phase==="time_in"&&store.getAttendanceCapturePhase(scanner.sessionId,store.getPreparedEvent(scanner.eventId)?.organizerProfileId??"")==="time_out") throw new Error("Time Out is a one-way step; this event cannot return to Time In."); return scannerCoordinator.setCapturePhase(phase); };
  Object.entries(handlers).forEach(([channel, handler]) => ipcMain.handle(channel, (_event, ...args) => handler(...args as never[])));
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  const rendererDirectory = path.resolve(directory, "..", "..", "dist");
  protocol.handle("plpass", (request) => {
    const requestPath = decodeURIComponent(new URL(request.url).pathname);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const requestedPath = path.resolve(rendererDirectory, relativePath);

    if (!requestedPath.startsWith(`${rendererDirectory}${path.sep}`) && requestedPath !== path.join(rendererDirectory, "index.html")) {
      return new Response("Not found", { status: 404 });
    }

    // React Router owns client-side routes such as /forgot-password. Those
    // paths are not physical files in the packaged renderer, so serve the
    // SPA entry point when a requested asset does not exist.
    const targetPath = existsSync(requestedPath) ? requestedPath : path.join(rendererDirectory, "index.html");
    return net.fetch(pathToFileURL(targetPath).toString());
  });
  const dbPath = path.join(app.getPath("userData"), "plpass-offline.sqlite3");
  console.info(`PLPass offline SQLite database: ${dbPath}`);
  const secureStorage= safeStorage.isEncryptionAvailable() ? { encrypt:(value:string)=>safeStorage.encryptString(value).toString("base64"), decrypt:(value:string)=>safeStorage.decryptString(Buffer.from(value,"base64")) } : undefined;
  store = new LocalAttendanceDatabase(
    new DatabaseSync(dbPath),
    secureStorage,
    true,
    (indexes) => backupOfflineDatabaseBeforeIndexRepair(dbPath, indexes)
  );
  scannerCoordinator = new ScannerCoordinator(store, rendererDirectory, (status) => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("scanner:status", status)), scannerCertificateStore(app.getPath("userData")), publishOfflineAttendance);
  registerHandlers();
  const preloadPath = path.join(directory, "preload.cjs");
  if (!existsSync(preloadPath)) console.error(`PLPass desktop preload is missing: ${preloadPath}`);
  const win = new BrowserWindow({ width: 1440, height: 960, webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.on("preload-error", (_event, failedPreloadPath, error) => {
    console.error(`PLPass desktop preload failed (${failedPreloadPath}): ${error.stack ?? error.message}`);
  });
  win.webContents.on("did-finish-load", () => {
    void win.webContents.executeJavaScript("typeof window.plpassDesktop === 'object'").then((available) => {
      if (!available) console.error(`PLPass desktop bridge was not exposed. Expected preload at: ${preloadPath}`);
    }).catch((error: unknown) => {
      console.error(`PLPass desktop bridge check failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  });
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`Renderer failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`Renderer console error at ${sourceId}:${line}: ${message}`);
  });
  const url = process.env.VITE_DEV_SERVER_URL;
  if (url) void win.loadURL(url); else void win.loadURL("plpass://app/");
});

app.on("before-quit", () => { void scannerCoordinator?.stop(); facialService?.kill(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
