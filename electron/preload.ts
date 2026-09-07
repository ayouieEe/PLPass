import { contextBridge, ipcRenderer } from "electron";
import type { PLPassDesktopApi } from "../src/features/offline/types.js";

const api: PLPassDesktopApi = {
  prepareEvent: (input) => ipcRenderer.invoke("offline:prepare", input), getStatus: (id) => ipcRenderer.invoke("offline:status", id), getPreparedEvent: (id) => ipcRenderer.invoke("offline:getPreparedEvent", id), getPreparedEventBySession: (id) => ipcRenderer.invoke("offline:getPreparedEventBySession", id),
  identifyQr: (eventId, qr) => ipcRenderer.invoke("offline:identifyQr", eventId, qr), identifyManual: (eventId, value) => ipcRenderer.invoke("offline:identifyManual", eventId, value),
  listFaceCandidates: (eventId) => ipcRenderer.invoke("offline:faceCandidates", eventId), recordAttendance: (input) => ipcRenderer.invoke("offline:record", input),
  listPending: (eventId) => ipcRenderer.invoke("offline:listPending", eventId), beginSync: (limit) => ipcRenderer.invoke("offline:beginSync", limit),
  confirmSync: (uuid, id) => ipcRenderer.invoke("offline:confirmSync", uuid, id), failSync: (uuid,status,error) => ipcRenderer.invoke("offline:failSync", uuid,status,error),
  recoverInterruptedSync: () => ipcRenderer.invoke("offline:recover"), cleanupEvent: (eventId,verified,completed) => ipcRenderer.invoke("offline:cleanup", eventId,verified,completed)
};
contextBridge.exposeInMainWorld("plpassDesktop", api);
