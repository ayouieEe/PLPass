import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LocalAttendanceInput, LocalAttendanceResult, OfflineIdentificationMethod, OfflineStatus, PreparedEventPackage, PreparedEventParticipant } from "./types";

export function desktopApi() { return window.plpassDesktop; }

export async function confirmSupabaseConnectivity(): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseBrowserClient().auth.getUser();
    return !error && Boolean(data.user);
  } catch { return false; }
}

export async function prepareEventForOffline(eventId: string): Promise<OfflineStatus> {
  const api = desktopApi();
  if (!api) throw new Error("Offline preparation is available in the PLPass desktop app.");
  if (!(await confirmSupabaseConnectivity())) throw new Error("A confirmed Supabase connection is required to prepare an event.");
  const { data, error } = await getSupabaseBrowserClient().rpc("prepare_offline_event_package", { p_event_id: eventId });
  if (error) throw error;
  const pkg = data as unknown as PreparedEventPackage;
  if (!pkg?.event?.id || !Array.isArray(pkg.sessions) || !pkg.sessions.length || !Array.isArray(pkg.participants) || !pkg.participants.length) {
    throw new Error("The event package is incomplete and was not saved.");
  }
  return api.prepareEvent(pkg);
}

async function captureOfflineFace(input: HTMLVideoElement | HTMLCanvasElement) {
  const canvas = input instanceof HTMLCanvasElement ? input : document.createElement("canvas");
  if (input instanceof HTMLVideoElement) {
    if (!input.videoWidth || !input.videoHeight) throw new Error("Wait for the camera preview before verifying attendance.");
    const longestEdge = Math.max(input.videoWidth, input.videoHeight);
    const scale = Math.min(1, 720 / longestEdge);
    canvas.width = Math.max(1, Math.round(input.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(input.videoHeight * scale));
    canvas.getContext("2d")?.drawImage(input, 0, 0, canvas.width, canvas.height);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("The camera frame could not be captured.");
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

export async function identifyOfflineStudent(eventId: string, method: OfflineIdentificationMethod, identifier: string | HTMLVideoElement | HTMLCanvasElement): Promise<PreparedEventParticipant | null> {
  const api = desktopApi(); if (!api) return null;
  if (method === "qr" && typeof identifier === "string") return api.identifyQr(eventId, identifier);
  if (method === "manual" && typeof identifier === "string") return api.identifyManual(eventId, identifier);
  if (method !== "facial" || typeof identifier === "string") return null;
  const match = await api.identifyOfflineFace(eventId, await captureOfflineFace(identifier));
  return match ? { ...match, faceEmbeddings: [] } : null;
}

export async function recordOfflineAttendance(input: LocalAttendanceInput): Promise<LocalAttendanceResult> {
  const api=desktopApi(); if(!api) throw new Error("Local attendance requires the PLPass desktop app.");
  return api.recordAttendance(input);
}

function errorCode(error: unknown) { return error && typeof error === "object" && "code" in error ? String(error.code) : ""; }
function errorText(error: unknown) { return error && typeof error === "object" && "message" in error ? String(error.message) : String(error ?? ""); }
function safeSyncError(error: unknown) {
  const code = errorCode(error);
  if (code === "55006") return "Synchronization was rate limited; the local record was retained for a later retry.";
  if (code === "40001" && /central attendance record conflicts|central record differs/i.test(errorText(error))) return "The central record differs from the offline record.";
  if (["42501", "22023", "23503", "23514"].includes(code)) return "The offline record needs manual review before synchronization can continue.";
  return "Synchronization was temporarily unavailable; the local record was retained for retry.";
}
function syncFailureStatus(error: unknown): "RETRY" | "CONFLICT" {
  const code = errorCode(error);
  const text = errorText(error);
  const transientSerialization = code === "40001" && /could not serialize|serialization failure|deadlock|lock timeout/i.test(text);
  const permanentRequest = ["42501", "22023", "23503", "23514"].includes(code);
  return permanentRequest || code === "23505" || (code === "40001" && !transientSerialization) ? "CONFLICT" : "RETRY";
}

let activeSync: Promise<{confirmed:number;failed:number}> | null = null;
const syncBackoffBaseMs = 5_000;
const syncBackoffMaxMs = 5 * 60_000;
const syncInterRecordDelayMs = 125;
let syncBackoffExponent = 0;
let nextSyncAllowedAt = 0;

export type OfflineSyncMetrics = {
  attempts: number;
  successfulRecords: number;
  transientFailures: number;
  permanentFailures: number;
  lastRetryDelayMs: number;
  activeSyncs: number;
  lastAttemptAt?: string;
};

const syncMetrics: OfflineSyncMetrics = {
  attempts: 0,
  successfulRecords: 0,
  transientFailures: 0,
  permanentFailures: 0,
  lastRetryDelayMs: 0,
  activeSyncs: 0
};

export function getOfflineSyncMetrics(): OfflineSyncMetrics { return { ...syncMetrics }; }

function registerSyncResult(result: { confirmed: number; failed: number }) {
  if (result.failed === 0) {
    syncBackoffExponent = 0;
    nextSyncAllowedAt = 0;
    syncMetrics.lastRetryDelayMs = 0;
    return;
  }
  const delay = Math.min(syncBackoffMaxMs, syncBackoffBaseMs * 2 ** syncBackoffExponent);
  syncBackoffExponent = Math.min(syncBackoffExponent + 1, 10);
  nextSyncAllowedAt = Date.now() + delay;
  syncMetrics.lastRetryDelayMs = delay;
}

export async function synchronizePendingAttendance(batchSize=20, forceRetry=false): Promise<{confirmed:number;failed:number}> {
  if (activeSync) return activeSync;
  if (!forceRetry && Date.now() < nextSyncAllowedAt) return { confirmed: 0, failed: 0 };
  const boundedBatchSize = Math.min(20, Math.max(1, Math.floor(batchSize) || 20));
  syncMetrics.attempts += 1;
  syncMetrics.activeSyncs += 1;
  syncMetrics.lastAttemptAt = new Date().toISOString();
  activeSync = synchronizePendingAttendanceOnce(boundedBatchSize, forceRetry).then((result) => {
    registerSyncResult(result);
    syncMetrics.successfulRecords += result.confirmed;
    return result;
  });
  try { return await activeSync; } finally { activeSync = null; syncMetrics.activeSyncs = Math.max(0, syncMetrics.activeSyncs - 1); }
}

async function synchronizePendingAttendanceOnce(batchSize: number, forceRetry: boolean): Promise<{confirmed:number;failed:number}> {
  const api=desktopApi(); if(!api || !(await confirmSupabaseConnectivity())) return {confirmed:0,failed:0};
  await api.recoverInterruptedSync();
  const records=await api.beginSync(batchSize, forceRetry); const inFlight=new Set<string>(); let confirmed=0,failed=0; let lastRpcAt=0;
  for(const record of records){
    if (inFlight.has(record.localAttendanceUuid)) continue;
    inFlight.add(record.localAttendanceUuid);
    try {
      const waitMs = Math.max(0, lastRpcAt + syncInterRecordDelayMs - Date.now());
      if (waitMs > 0) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      lastRpcAt = Date.now();
      const client=getSupabaseBrowserClient();
      const {data,error}=await client.rpc("sync_offline_event_attendance",{p_local_attendance_uuid:record.localAttendanceUuid,p_session_id:record.sessionId,p_student_id:record.studentId,p_identification_method:record.identificationMethod,p_attendance_status:record.attendanceStatus,p_time_in:record.timeIn,...(record.timeOut?{p_time_out:record.timeOut}:{}),...(record.checkoutIdentificationMethod?{p_checkout_identification_method:record.checkoutIdentificationMethod}:{}),...(record.remarks?{p_remarks:record.remarks}:{}),...(record.lateReason?{p_late_reason:record.lateReason}:{})});
      if(error) throw error;
      if (!data) {
        const rateLimited = { code: "55006", message: "Offline synchronization was rate limited." };
        syncMetrics.transientFailures += 1;
        await api.failSync(record.localAttendanceUuid, "RETRY", safeSyncError(rateLimited));
        failed += 1;
        continue;
      }
      const row=data as {id?:string;local_attendance_uuid?:string|null}|null;
      if(!row?.id || row.local_attendance_uuid!==record.localAttendanceUuid) throw new Error("Server confirmation did not match the local record.");
      await api.confirmSync(record.localAttendanceUuid,row.id); confirmed+=1;
      } catch(error) {
      // The request may have committed before its response was lost. Verify by UUID before retaining for retry.
      try {
        const {data}=await getSupabaseBrowserClient().from("attendance_records").select("id, local_attendance_uuid").eq("local_attendance_uuid",record.localAttendanceUuid).maybeSingle();
        if(data?.id && data.local_attendance_uuid===record.localAttendanceUuid){ await api.confirmSync(record.localAttendanceUuid,data.id); confirmed+=1; continue; }
      } catch { /* Retain locally below. */ }
      const status = syncFailureStatus(error);
      if (status === "CONFLICT") syncMetrics.permanentFailures += 1;
      else syncMetrics.transientFailures += 1;
      await api.failSync(record.localAttendanceUuid,status,safeSyncError(error)); failed+=1;
    }
  }
  return {confirmed,failed};
}

