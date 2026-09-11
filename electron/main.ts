import { app, BrowserWindow, ipcMain, net, protocol, safeStorage } from "electron";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { LocalAttendanceDatabase } from "./localDatabase.js";
import { ScannerCoordinator, type ScannerCertificateStore, type ScannerRootCertificate } from "./scannerCoordinator.js";
import { isAutoSyncEnabled, isForceLocalAttendanceEnabled } from "../src/features/offline/autoSyncConfig.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
let store: LocalAttendanceDatabase;
let scannerCoordinator: ScannerCoordinator;
let facialService: ChildProcess | undefined;
let activeSyncBatch: { owner: string; expiresAt: number } | undefined;

// One Electron process owns a SQLite outbox. A second process could otherwise
// race the same pending records despite WAL's transactional protections.
if (!app.requestSingleInstanceLock()) app.quit();

const workspaceRoot = path.resolve(directory, "..", "..");
const facialApiBaseUrl = process.env.PLPASS_FACIAL_API_URL ?? "http://127.0.0.1:8000";
// Phase 0 containment switch. Set PLPASS_AUTO_SYNC_ENABLED=false before
// starting the desktop app to pause only timer-driven synchronization.
// Local attendance recording and an organizer's deliberate Retry Sync action
// remain available, and pending SQLite rows are never deleted by this flag.
const autoSyncEnabled = isAutoSyncEnabled(process.env.PLPASS_AUTO_SYNC_ENABLED);
const forceLocalAttendance = isForceLocalAttendanceEnabled(process.env.PLPASS_FORCE_LOCAL_ATTENDANCE);

function claimSyncBatch(limit: number) {
  const now = Date.now();
  if (activeSyncBatch && activeSyncBatch.expiresAt > now) return null;
  const claim = store.beginSync(limit, randomUUID(), new Date(now));
  activeSyncBatch = claim.records.length ? { owner: claim.owner, expiresAt: now + 5 * 60_000 } : undefined;
  return claim;
}

function finishSyncBatch(owner: string) {
  if (activeSyncBatch?.owner === owner) activeSyncBatch = undefined;
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

async function ensureLocalFacialService() {
  if (await facialServiceReady()) return;
  const python = localPythonPath();
  if (!python) {
    throw new Error("Offline facial recognition needs the PLPass Python runtime. Install it or configure PLPASS_PYTHON_PATH.");
  }
  if (!facialService || facialService.exitCode !== null) {
    facialService = spawn(python, ["-m", "uvicorn", "api.main:app", "--host", "127.0.0.1", "--port", "8000"], {
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
  throw new Error("The local facial recognition service did not start. Use QR or manual attendance.");
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
  const handlers: Record<string, (...args: never[]) => unknown> = {
    "offline:runtimeConfig": () => ({ autoSyncEnabled, forceLocalAttendance }),
    "offline:prepare": (pkg) => store.prepareEvent(pkg), "offline:activateSession": (input) => store.activatePreparedSession(input), "offline:status": (id) => store.getStatus(id), "offline:getPreparedEvent": (id) => store.getPreparedEvent(id), "offline:getPreparedEventBySession": (id) => store.getPreparedEventBySession(id),
    "offline:identifyQr": (eventId, qr) => store.identifyQr(eventId, qr), "offline:identifyManual": (eventId, value) => store.identifyManual(eventId, value),
    "offline:identifyFace": (eventId, capture) => identifyOfflineFace(eventId, capture), "offline:record": (input) => store.recordAttendance(input),
    "offline:listPending": (eventId) => store.listPending(eventId), "offline:beginSync": (limit) => claimSyncBatch(limit), "offline:finishSync": (owner) => finishSyncBatch(owner),
    "offline:confirmSync": (uuid, serverId, owner) => store.confirmSync(uuid, serverId, owner), "offline:failSync": (uuid,status,error,owner) => store.failSync(uuid,status,error,owner),
    "offline:recover": () => store.recoverInterruptedSync(), "offline:cleanup": (eventId,verified,completed) => store.cleanupEvent(eventId,verified,completed)
  };
  handlers["scanner:start"] = (eventId, sessionId, phase) => scannerCoordinator.start(eventId, sessionId, phase);
  handlers["scanner:stop"] = () => scannerCoordinator.stop();
  handlers["scanner:status"] = () => scannerCoordinator.getStatus();
  handlers["scanner:certificateStatus"] = () => scannerCoordinator.getCertificateStatus();
  handlers["scanner:replaceCertificate"] = () => scannerCoordinator.replaceCertificate();
  handlers["scanner:remove"] = (stationId) => scannerCoordinator.removeStation(stationId);
  handlers["scanner:setPhase"] = (phase) => scannerCoordinator.setCapturePhase(phase);
  Object.entries(handlers).forEach(([channel, handler]) => ipcMain.handle(channel, (_event, ...args) => handler(...args as never[])));
}

app.whenReady().then(() => {
  const rendererDirectory = path.resolve(directory, "..", "..", "dist");
  protocol.handle("plpass", (request) => {
    const requestPath = decodeURIComponent(new URL(request.url).pathname);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    const targetPath = path.resolve(rendererDirectory, relativePath);

    if (!targetPath.startsWith(`${rendererDirectory}${path.sep}`) && targetPath !== path.join(rendererDirectory, "index.html")) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(targetPath).toString());
  });
  const dbPath = path.join(app.getPath("userData"), "plpass-offline.sqlite3");
  store = new LocalAttendanceDatabase(new DatabaseSync(dbPath));
  scannerCoordinator = new ScannerCoordinator(store, rendererDirectory, (status) => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("scanner:status", status)), scannerCertificateStore(app.getPath("userData")));
  registerHandlers();
  const win = new BrowserWindow({ width: 1440, height: 960, webPreferences: { preload: path.join(directory,"preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
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
