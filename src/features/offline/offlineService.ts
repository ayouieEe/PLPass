import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractQrCredentialId } from "@/lib/credentials/qrCredential";
import type { LocalAttendanceInput, LocalAttendanceResult, OfflineIdentificationMethod, OfflineRuntimeConfig, OfflineStatus, PreparedEventPackage, PreparedEventParticipant, SyncFailureDisposition } from "./types";

export function desktopApi() { return window.plpassDesktop; }

export async function getOfflineRuntimeConfig(): Promise<OfflineRuntimeConfig> {
  const api = desktopApi();
  if (!api) return { autoSyncEnabled: false, forceLocalAttendance: false };
  return api.getOfflineRuntimeConfig();
}

/**
 * Choose SQLite before any attendance write only when connectivity is absent or
 * a deliberate operator test mode is active. A paused sync timer alone never
 * changes the normal online attendance path.
 */
export async function shouldRecordAttendanceLocally(): Promise<boolean> {
  const runtime = await getOfflineRuntimeConfig();
  return runtime.forceLocalAttendance || !(await confirmSupabaseConnectivity());
}

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
  if (method === "qr" && typeof identifier === "string") return api.identifyQr(eventId, extractQrCredentialId(identifier));
  if (method === "manual" && typeof identifier === "string") return api.identifyManual(eventId, identifier);
  if (method !== "facial" || typeof identifier === "string") return null;
  const match = await api.identifyOfflineFace(eventId, await captureOfflineFace(identifier));
  return match ? { ...match, faceEmbeddings: [] } : null;
}

export async function recordOfflineAttendance(input: LocalAttendanceInput): Promise<LocalAttendanceResult> {
  const api=desktopApi(); if(!api) throw new Error("Local attendance requires the PLPass desktop app.");
  return api.recordAttendance(input);
}

export function classifySyncError(error: unknown): { disposition: SyncFailureDisposition; message: string } {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "40001" || code === "23505") return { disposition: "CONFLICT", message: "The central record differs from the offline record and requires operator review." };
  if (["42501", "28000", "PGRST301"].includes(code)) return { disposition: "FAILED", message: "Synchronization is not authorized and requires operator review." };
  return { disposition: "RETRY", message: "Synchronization could not be confirmed; the local record was retained." };
}

export async function synchronizePendingAttendance(batchSize=20): Promise<{confirmed:number;failed:number}> {
  const api=desktopApi(); if(!api || !(await confirmSupabaseConnectivity())) return {confirmed:0,failed:0};
  await api.recoverInterruptedSync();
  const claim=await api.beginSync(batchSize); if(!claim) return {confirmed:0,failed:0};
  const { owner, records }=claim; let confirmed=0,failed=0;
  try { for(const record of records){
    try {
      const client=getSupabaseBrowserClient();
      const {data,error}=await client.rpc("sync_offline_event_attendance",{p_local_attendance_uuid:record.localAttendanceUuid,p_session_id:record.sessionId,p_student_id:record.studentId,p_identification_method:record.identificationMethod,p_attendance_status:record.attendanceStatus,p_time_in:record.timeIn,...(record.timeOut?{p_time_out:record.timeOut}:{}),...(record.checkoutIdentificationMethod?{p_checkout_identification_method:record.checkoutIdentificationMethod}:{}),...(record.remarks?{p_remarks:record.remarks}:{}),...(record.lateReason?{p_late_reason:record.lateReason}:{})});
      if(error) throw error;
      const row=data as {id?:string;local_attendance_uuid?:string|null}|null;
      if(!row?.id || row.local_attendance_uuid!==record.localAttendanceUuid) throw new Error("Server confirmation did not match the local record.");
      await api.confirmSync(record.localAttendanceUuid,row.id,owner); confirmed+=1;
    } catch(error) {
      // The request may have committed before its response was lost. Verify by UUID before retaining for retry.
      try {
        const {data}=await getSupabaseBrowserClient().from("attendance_records").select("id, local_attendance_uuid").eq("local_attendance_uuid",record.localAttendanceUuid).maybeSingle();
        if(data?.id && data.local_attendance_uuid===record.localAttendanceUuid){ await api.confirmSync(record.localAttendanceUuid,data.id,owner); confirmed+=1; continue; }
      } catch { /* Retain locally below. */ }
      const failure=classifySyncError(error);
      await api.failSync(record.localAttendanceUuid,failure.disposition,failure.message,owner); failed+=1;
    }
  }} finally { await api.finishSync(owner); }
  return {confirmed,failed};
}

