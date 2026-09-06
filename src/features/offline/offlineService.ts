import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractQrCredentialId } from "@/lib/credentials/qrCredential";
import { extractFaceDescriptor, faceSimilarity } from "@/lib/biometrics/humanFace";
import type { LocalAttendanceInput, LocalAttendanceResult, OfflineIdentificationMethod, OfflineStatus, PreparedEventPackage, PreparedEventParticipant } from "./types";

const FACE_MATCH_THRESHOLD = 0.72;

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

export async function identifyOfflineStudent(eventId: string, method: OfflineIdentificationMethod, identifier: string | HTMLVideoElement | HTMLCanvasElement): Promise<PreparedEventParticipant | null> {
  const api = desktopApi(); if (!api) return null;
  if (method === "qr" && typeof identifier === "string") return api.identifyQr(eventId, extractQrCredentialId(identifier));
  if (method === "manual" && typeof identifier === "string") return api.identifyManual(eventId, identifier);
  if (method !== "facial" || typeof identifier === "string") return null;
  const candidate = await extractFaceDescriptor(identifier);
  const candidates = await api.listFaceCandidates(eventId);
  const matches = candidates.map((person) => ({ person, score: Math.max(0, ...person.faceEmbeddings.map((embedding) => faceSimilarity(embedding, candidate.descriptor))) })).sort((a,b) => b.score-a.score);
  if (!matches[0] || matches[0].score < FACE_MATCH_THRESHOLD || (matches[1] && matches[0].score-matches[1].score < 0.03)) return null;
  return matches[0].person;
}

export async function recordOfflineAttendance(input: LocalAttendanceInput): Promise<LocalAttendanceResult> {
  const api=desktopApi(); if(!api) throw new Error("Local attendance requires the PLPass desktop app.");
  return api.recordAttendance(input);
}

function safeSyncError(error: unknown) { return error && typeof error === "object" && "code" in error && String(error.code) === "40001" ? "The central record differs from the offline record." : "Synchronization could not be confirmed; the local record was retained."; }

export async function synchronizePendingAttendance(batchSize=20): Promise<{confirmed:number;failed:number}> {
  const api=desktopApi(); if(!api || !(await confirmSupabaseConnectivity())) return {confirmed:0,failed:0};
  await api.recoverInterruptedSync();
  const records=await api.beginSync(batchSize); let confirmed=0,failed=0;
  for(const record of records){
    try {
      const client=getSupabaseBrowserClient();
      const {data,error}=await client.rpc("sync_offline_event_attendance",{p_local_attendance_uuid:record.localAttendanceUuid,p_session_id:record.sessionId,p_student_id:record.studentId,p_identification_method:record.identificationMethod,p_attendance_status:record.attendanceStatus,p_time_in:record.timeIn,...(record.timeOut?{p_time_out:record.timeOut}:{}),...(record.checkoutIdentificationMethod?{p_checkout_identification_method:record.checkoutIdentificationMethod}:{}),...(record.remarks?{p_remarks:record.remarks}:{}),...(record.lateReason?{p_late_reason:record.lateReason}:{})});
      if(error) throw error;
      const row=data as {id?:string;local_attendance_uuid?:string|null}|null;
      if(!row?.id || row.local_attendance_uuid!==record.localAttendanceUuid) throw new Error("Server confirmation did not match the local record.");
      await api.confirmSync(record.localAttendanceUuid,row.id); confirmed+=1;
    } catch(error) {
      // The request may have committed before its response was lost. Verify by UUID before retaining for retry.
      try {
        const {data}=await getSupabaseBrowserClient().from("attendance_records").select("id, local_attendance_uuid").eq("local_attendance_uuid",record.localAttendanceUuid).maybeSingle();
        if(data?.id && data.local_attendance_uuid===record.localAttendanceUuid){ await api.confirmSync(record.localAttendanceUuid,data.id); confirmed+=1; continue; }
      } catch { /* Retain locally below. */ }
      const code=error && typeof error==="object" && "code" in error ? String(error.code) : "";
      await api.failSync(record.localAttendanceUuid,code==="23505"||code==="40001"?"CONFLICT":"RETRY",safeSyncError(error)); failed+=1;
    }
  }
  return {confirmed,failed};
}

