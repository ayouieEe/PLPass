import { contextBridge, ipcRenderer } from "electron";
import type { PLPassDesktopApi } from "../src/features/offline/types.js";

const api: PLPassDesktopApi = {
  prepareEvent: (input, organizerId) => ipcRenderer.invoke("offline:prepare", input, organizerId),
  listPreparedEvents: (organizerId, day) => ipcRenderer.invoke("offline:listPrepared", organizerId, day),
  hasUnresolvedWork: (organizerId) => ipcRenderer.invoke("offline:hasWork", organizerId),
  startOfflineSession: (eventId, sessionId, organizerId, day, at) => ipcRenderer.invoke("offline:startSession", eventId, sessionId, organizerId, day, at),
  endOfflineSession: (eventId, sessionId, organizerId, at, reason) => ipcRenderer.invoke("offline:endSession", eventId, sessionId, organizerId, at, reason),
  setOfflineLifecycleState: (eventId, sessionId, state) => ipcRenderer.invoke("offline:setLifecycle", eventId, sessionId, state),
  getStatus: (id, ownerId) => ipcRenderer.invoke("offline:status", id, ownerId), getPreparedEvent: (id, ownerId) => ipcRenderer.invoke("offline:getPreparedEvent", id, ownerId), getPreparedEventBySession: (id, ownerId) => ipcRenderer.invoke("offline:getPreparedEventBySession", id, ownerId),
  identifyQr: (eventId, qr) => ipcRenderer.invoke("offline:identifyQr", eventId, qr), identifyManual: (eventId, value) => ipcRenderer.invoke("offline:identifyManual", eventId, value),
  identifyOfflineFace: (eventId, capture) => ipcRenderer.invoke("offline:identifyFace", eventId, capture), recordAttendance: (input) => ipcRenderer.invoke("offline:record", input),
  recordScannerAttendance: (input, phase) => ipcRenderer.invoke("offline:recordScanner", input, phase),
  listPending: (eventId, organizerId) => ipcRenderer.invoke("offline:listPending", eventId, organizerId), beginSync: (limit, forceRetry, organizerId) => ipcRenderer.invoke("offline:beginSync", limit, forceRetry, organizerId),
  confirmSync: (uuid, id) => ipcRenderer.invoke("offline:confirmSync", uuid, id), failSync: (uuid,status,error) => ipcRenderer.invoke("offline:failSync", uuid,status,error),
  recoverInterruptedSync: (organizerId) => ipcRenderer.invoke("offline:recover", organizerId), cleanupEvent: (eventId,verified,completed) => ipcRenderer.invoke("offline:cleanup", eventId,verified,completed),
  startScannerStations: (eventId,sessionId,phase,ownerId) => ipcRenderer.invoke("scanner:start",eventId,sessionId,phase,ownerId),
  stopScannerStations: () => ipcRenderer.invoke("scanner:stop"), getScannerStations: () => ipcRenderer.invoke("scanner:status"),
  getScannerCertificateStatus: () => ipcRenderer.invoke("scanner:certificateStatus"), replaceScannerCertificate: () => ipcRenderer.invoke("scanner:replaceCertificate"),
  removeScannerStation: (stationId) => ipcRenderer.invoke("scanner:remove",stationId), setScannerCapturePhase: (phase) => ipcRenderer.invoke("scanner:setPhase",phase),
  onScannerStatus: (listener) => { const handler = (_event: unknown,status: import("../src/features/offline/types.js").ScannerCoordinatorStatus) => listener(status); ipcRenderer.on("scanner:status",handler); return () => ipcRenderer.removeListener("scanner:status",handler); }
};
contextBridge.exposeInMainWorld("plpassDesktop", api);
