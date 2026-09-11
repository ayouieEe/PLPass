import { contextBridge, ipcRenderer } from "electron";
import type { PLPassDesktopApi } from "../src/features/offline/types.js";

const api: PLPassDesktopApi = {
  getOfflineRuntimeConfig: () => ipcRenderer.invoke("offline:runtimeConfig"),
  prepareEvent: (input) => ipcRenderer.invoke("offline:prepare", input), activatePreparedSession: (input) => ipcRenderer.invoke("offline:activateSession", input), getStatus: (id) => ipcRenderer.invoke("offline:status", id), getPreparedEvent: (id) => ipcRenderer.invoke("offline:getPreparedEvent", id), getPreparedEventBySession: (id) => ipcRenderer.invoke("offline:getPreparedEventBySession", id),
  identifyQr: (eventId, qr) => ipcRenderer.invoke("offline:identifyQr", eventId, qr), identifyManual: (eventId, value) => ipcRenderer.invoke("offline:identifyManual", eventId, value),
  identifyOfflineFace: (eventId, capture) => ipcRenderer.invoke("offline:identifyFace", eventId, capture), recordAttendance: (input) => ipcRenderer.invoke("offline:record", input),
  listPending: (eventId) => ipcRenderer.invoke("offline:listPending", eventId), beginSync: (limit) => ipcRenderer.invoke("offline:beginSync", limit), finishSync: (owner) => ipcRenderer.invoke("offline:finishSync", owner),
  confirmSync: (uuid, id, owner) => ipcRenderer.invoke("offline:confirmSync", uuid, id, owner), failSync: (uuid,status,error,owner) => ipcRenderer.invoke("offline:failSync", uuid,status,error,owner),
  recoverInterruptedSync: () => ipcRenderer.invoke("offline:recover"), cleanupEvent: (eventId,verified,completed) => ipcRenderer.invoke("offline:cleanup", eventId,verified,completed)
};
contextBridge.exposeInMainWorld("plpassDesktop", api);
