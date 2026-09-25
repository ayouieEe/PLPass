const { contextBridge, ipcRenderer } = require("electron");

// This is deliberately a small, named IPC surface. The renderer receives no
// Node, SQL, filesystem, or unrestricted Electron access.
contextBridge.exposeInMainWorld("plpassDesktop", {
  saveOfflineOrganizerIdentity: (identity) => ipcRenderer.invoke("offline:saveIdentity", identity),
  getOfflineOrganizerIdentity: (userId) => ipcRenderer.invoke("offline:getIdentity", userId),
  clearOfflineOrganizerIdentity: () => ipcRenderer.invoke("offline:clearIdentity"),
  prepareEvent: (input, organizerId) => ipcRenderer.invoke("offline:prepare", input, organizerId),
  listPreparedEvents: (organizerId, day) => ipcRenderer.invoke("offline:listPrepared", organizerId, day),
  hasUnresolvedWork: (organizerId) => ipcRenderer.invoke("offline:hasWork", organizerId),
  startOfflineSession: (eventId, sessionId, organizerId, day, at) => ipcRenderer.invoke("offline:startSession", eventId, sessionId, organizerId, day, at),
  endOfflineSession: (eventId, sessionId, organizerId, at, reason) => ipcRenderer.invoke("offline:endSession", eventId, sessionId, organizerId, at, reason),
  setOfflineLifecycleState: (eventId, sessionId, state) => ipcRenderer.invoke("offline:setLifecycle", eventId, sessionId, state),
  getStatus: (id, organizerId) => ipcRenderer.invoke("offline:status", id, organizerId),
  getPreparedEvent: (id, organizerId) => ipcRenderer.invoke("offline:getPreparedEvent", id, organizerId),
  getPreparedEventBySession: (id, organizerId) => ipcRenderer.invoke("offline:getPreparedEventBySession", id, organizerId),
  identifyQr: (eventId, qr) => ipcRenderer.invoke("offline:identifyQr", eventId, qr),
  identifyManual: (eventId, value) => ipcRenderer.invoke("offline:identifyManual", eventId, value),
  identifyOfflineFace: (eventId, capture) => ipcRenderer.invoke("offline:identifyFace", eventId, capture),
  recordAttendance: (input) => ipcRenderer.invoke("offline:record", input),
  recordScannerAttendance: (input, phase) => ipcRenderer.invoke("offline:recordScanner", input, phase),
  getAttendanceCapturePhase: (sessionId, ownerId) => ipcRenderer.invoke("offline:capturePhase", sessionId, ownerId),
  advanceAttendanceCapturePhase: (sessionId, ownerId) => ipcRenderer.invoke("offline:advancePhase", sessionId, ownerId),
  queueWalkInScan: (input) => ipcRenderer.invoke("offline:queueWalkin", input),
  listPendingWalkInScans: (eventId, ownerId, activeSessionId) => ipcRenderer.invoke("offline:listWalkins", eventId, ownerId, activeSessionId),
  beginWalkInSync: (limit, ownerId, forceRetry) => ipcRenderer.invoke("offline:beginWalkinSync", limit, ownerId, forceRetry),
  confirmWalkInSync: (id, student) => ipcRenderer.invoke("offline:confirmWalkinSync", id, student),
  discardWalkInSync: (id, ownerId) => ipcRenderer.invoke("offline:discardWalkinSync", id, ownerId),
  failWalkInSync: (id, status, error) => ipcRenderer.invoke("offline:failWalkinSync", id, status, error),
  listPending: (eventId, organizerId) => ipcRenderer.invoke("offline:listPending", eventId, organizerId),
  beginSync: (limit, forceRetry, organizerId) => ipcRenderer.invoke("offline:beginSync", limit, forceRetry, organizerId),
  confirmSync: (uuid, id, status, timeOut) => ipcRenderer.invoke("offline:confirmSync", uuid, id, status, timeOut),
  failSync: (uuid, status, error) => ipcRenderer.invoke("offline:failSync", uuid, status, error),
  recoverInterruptedSync: (organizerId) => ipcRenderer.invoke("offline:recover", organizerId),
  cleanupEvent: (eventId, verified, completed) => ipcRenderer.invoke("offline:cleanup", eventId, verified, completed),
  checkIntegrity: () => ipcRenderer.invoke("offline:integrity"),
  ensureMlService: () => ipcRenderer.invoke("ml:ensure")
  ,startScannerStations: (eventId, sessionId, phase, organizerId) => ipcRenderer.invoke("scanner:start", eventId, sessionId, phase, organizerId)
  ,stopScannerStations: () => ipcRenderer.invoke("scanner:stop")
  ,getScannerStations: () => ipcRenderer.invoke("scanner:status")
  ,getScannerCertificateStatus: () => ipcRenderer.invoke("scanner:certificateStatus")
  ,replaceScannerCertificate: () => ipcRenderer.invoke("scanner:replaceCertificate")
  ,removeScannerStation: (stationId) => ipcRenderer.invoke("scanner:remove", stationId)
  ,setScannerCapturePhase: (phase) => ipcRenderer.invoke("scanner:setPhase", phase)
  ,onScannerStatus: (listener) => { const handler = (_event, status) => listener(status); ipcRenderer.on("scanner:status", handler); return () => ipcRenderer.removeListener("scanner:status", handler); }
  ,onOfflineAttendanceRecorded: (listener) => { const handler = (_event, result) => listener(result); ipcRenderer.on("offline:attendance-recorded", handler); return () => ipcRenderer.removeListener("offline:attendance-recorded", handler); }
});
