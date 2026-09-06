import { app, BrowserWindow, ipcMain, net, protocol, safeStorage } from "electron";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { LocalAttendanceDatabase } from "./localDatabase.js";
import { ScannerCoordinator, type ScannerCertificateStore, type ScannerRootCertificate } from "./scannerCoordinator.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
let store: LocalAttendanceDatabase;
let scannerCoordinator: ScannerCoordinator;

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
    "offline:prepare": (pkg) => store.prepareEvent(pkg), "offline:status": (id) => store.getStatus(id), "offline:getPreparedEvent": (id) => store.getPreparedEvent(id), "offline:getPreparedEventBySession": (id) => store.getPreparedEventBySession(id),
    "offline:identifyQr": (eventId, qr) => store.identifyQr(eventId, qr), "offline:identifyManual": (eventId, value) => store.identifyManual(eventId, value),
    "offline:faceCandidates": (eventId) => store.listFaceCandidates(eventId), "offline:record": (input) => store.recordAttendance(input),
    "offline:listPending": (eventId) => store.listPending(eventId), "offline:beginSync": (limit) => store.beginSync(limit),
    "offline:confirmSync": (uuid, serverId) => store.confirmSync(uuid, serverId), "offline:failSync": (uuid,status,error) => store.failSync(uuid,status,error),
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

app.on("before-quit", () => { void scannerCoordinator?.stop(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
