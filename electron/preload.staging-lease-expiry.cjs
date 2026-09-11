const { contextBridge, ipcRenderer } = require("electron");

// This file is copied only by the explicit staging lease-expiry build script.
// It deliberately exposes one additional, narrowly named test action.
contextBridge.exposeInMainWorld("plpassDesktop", {
  getOfflineRuntimeConfig: () => ipcRenderer.invoke("offline:runtimeConfig"),
  prepareEvent: (input) => ipcRenderer.invoke("offline:prepare", input),
  activatePreparedSession: (input) => ipcRenderer.invoke("offline:activateSession", input),
  getStatus: (id) => ipcRenderer.invoke("offline:status", id),
  getPreparedEvent: (id) => ipcRenderer.invoke("offline:getPreparedEvent", id),
  getPreparedEventBySession: (id) => ipcRenderer.invoke("offline:getPreparedEventBySession", id),
  identifyQr: (eventId, qr) => ipcRenderer.invoke("offline:identifyQr", eventId, qr),
  identifyManual: (eventId, value) => ipcRenderer.invoke("offline:identifyManual", eventId, value),
  identifyOfflineFace: (eventId, capture) => ipcRenderer.invoke("offline:identifyFace", eventId, capture),
  recordAttendance: (input) => ipcRenderer.invoke("offline:record", input),
  listPending: (eventId) => ipcRenderer.invoke("offline:listPending", eventId),
  beginSync: (limit) => ipcRenderer.invoke("offline:beginSync", limit),
  finishSync: (owner) => ipcRenderer.invoke("offline:finishSync", owner),
  confirmSync: (uuid, id, owner) => ipcRenderer.invoke("offline:confirmSync", uuid, id, owner),
  failSync: (uuid, status, error, owner) => ipcRenderer.invoke("offline:failSync", uuid, status, error, owner),
  recoverInterruptedSync: () => ipcRenderer.invoke("offline:recover"),
  cleanupEvent: (eventId, verified, completed) => ipcRenderer.invoke("offline:cleanup", eventId, verified, completed),
  claimLeaseAndExitForStagingTest: () => ipcRenderer.invoke("offline:claimLeaseAndExitForStagingTest"),
  openConcurrentWindowForStagingTest: () => ipcRenderer.invoke("offline:openConcurrentWindowForStagingTest"),
  joinConcurrentSyncBarrierForStagingTest: () => ipcRenderer.invoke("offline:joinConcurrentSyncBarrierForStagingTest"),
  startScannerStations: (eventId, sessionId, phase) => ipcRenderer.invoke("scanner:start", eventId, sessionId, phase),
  stopScannerStations: () => ipcRenderer.invoke("scanner:stop"),
  getScannerStations: () => ipcRenderer.invoke("scanner:status"),
  getScannerCertificateStatus: () => ipcRenderer.invoke("scanner:certificateStatus"),
  replaceScannerCertificate: () => ipcRenderer.invoke("scanner:replaceCertificate"),
  removeScannerStation: (stationId) => ipcRenderer.invoke("scanner:remove", stationId),
  setScannerCapturePhase: (phase) => ipcRenderer.invoke("scanner:setPhase", phase),
  onScannerStatus: (listener) => { const handler = (_event, status) => listener(status); ipcRenderer.on("scanner:status", handler); return () => ipcRenderer.removeListener("scanner:status", handler); }
});
