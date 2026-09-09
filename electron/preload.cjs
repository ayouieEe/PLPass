const { contextBridge, ipcRenderer } = require("electron");

// This is deliberately a small, named IPC surface. The renderer receives no
// Node, SQL, filesystem, or unrestricted Electron access.
contextBridge.exposeInMainWorld("plpassDesktop", {
  prepareEvent: (input) => ipcRenderer.invoke("offline:prepare", input),
  getStatus: (id) => ipcRenderer.invoke("offline:status", id),
  getPreparedEvent: (id) => ipcRenderer.invoke("offline:getPreparedEvent", id),
  getPreparedEventBySession: (id) => ipcRenderer.invoke("offline:getPreparedEventBySession", id),
  identifyQr: (eventId, qr) => ipcRenderer.invoke("offline:identifyQr", eventId, qr),
  identifyManual: (eventId, value) => ipcRenderer.invoke("offline:identifyManual", eventId, value),
  identifyOfflineFace: (eventId, capture) => ipcRenderer.invoke("offline:identifyFace", eventId, capture),
  recordAttendance: (input) => ipcRenderer.invoke("offline:record", input),
  listPending: (eventId) => ipcRenderer.invoke("offline:listPending", eventId),
  beginSync: (limit) => ipcRenderer.invoke("offline:beginSync", limit),
  confirmSync: (uuid, id) => ipcRenderer.invoke("offline:confirmSync", uuid, id),
  failSync: (uuid, status, error) => ipcRenderer.invoke("offline:failSync", uuid, status, error),
  recoverInterruptedSync: () => ipcRenderer.invoke("offline:recover"),
  cleanupEvent: (eventId, verified, completed) => ipcRenderer.invoke("offline:cleanup", eventId, verified, completed)
  ,startScannerStations: (eventId, sessionId, phase) => ipcRenderer.invoke("scanner:start", eventId, sessionId, phase)
  ,stopScannerStations: () => ipcRenderer.invoke("scanner:stop")
  ,getScannerStations: () => ipcRenderer.invoke("scanner:status")
  ,getScannerCertificateStatus: () => ipcRenderer.invoke("scanner:certificateStatus")
  ,replaceScannerCertificate: () => ipcRenderer.invoke("scanner:replaceCertificate")
  ,removeScannerStation: (stationId) => ipcRenderer.invoke("scanner:remove", stationId)
  ,setScannerCapturePhase: (phase) => ipcRenderer.invoke("scanner:setPhase", phase)
  ,onScannerStatus: (listener) => { const handler = (_event, status) => listener(status); ipcRenderer.on("scanner:status", handler); return () => ipcRenderer.removeListener("scanner:status", handler); }
});
