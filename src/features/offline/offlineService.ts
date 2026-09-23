import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LocalAttendanceInput, LocalAttendanceResult, OfflineIdentificationMethod, OfflinePreparedEventSummary, OfflineStatus, PreparedEventPackage, PreparedEventParticipant } from "./types";

export function desktopApi() { return window.plpassDesktop; }

export function getManilaCalendarDate(at = new Date()) {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(at);
  const part=(name:string)=>parts.find((item)=>item.type===name)?.value??"";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function listOfflineEvents(organizerProfileId: string): Promise<OfflinePreparedEventSummary[]> {
  return desktopApi()?.listPreparedEvents(organizerProfileId, getManilaCalendarDate()) ?? [];
}

export async function confirmSupabaseConnectivity(): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseBrowserClient().auth.getUser();
    return !error && Boolean(data.user);
  } catch { return false; }
}

export async function prepareEventForOffline(eventId: string, organizerProfileId: string): Promise<OfflineStatus> {
  const api = desktopApi();
  if (!api) throw new Error("Offline preparation is available in the PLPass desktop app.");
  const { data, error } = await getSupabaseBrowserClient().rpc("prepare_offline_event_package", { p_event_id: eventId });
  if (error) throw error;
  const pkg = data as unknown as PreparedEventPackage;
  if (!pkg?.event?.id || !Array.isArray(pkg.sessions) || !pkg.sessions.length || !Array.isArray(pkg.participants) || !pkg.participants.length) {
    throw new Error("The event package is incomplete and was not saved.");
  }
  return api.prepareEvent(pkg, organizerProfileId);
}

export async function startOfflineEvent(eventId:string,sessionId:string,organizerProfileId:string) {
  const api=desktopApi(); if(!api) throw new Error("Offline event sessions require the PLPass desktop app.");
  return api.startOfflineSession(eventId,sessionId,organizerProfileId,getManilaCalendarDate(),new Date().toISOString());
}

export async function endOfflineEvent(eventId:string,sessionId:string,organizerProfileId:string,reason?:string) {
  const api=desktopApi(); if(!api) throw new Error("Offline event sessions require the PLPass desktop app.");
  return api.endOfflineSession(eventId,sessionId,organizerProfileId,new Date().toISOString(),reason);
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

export async function recordOfflineAttendance(input: LocalAttendanceInput, phase?:"time_in"|"time_out"): Promise<LocalAttendanceResult> {
  const api=desktopApi(); if(!api) throw new Error("Local attendance requires the PLPass desktop app.");
  return phase ? api.recordScannerAttendance(input,phase) : api.recordAttendance(input);
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
function safeWalkInSyncError(error: unknown) {
  if (errorCode(error) === "55006") return "Walk-in synchronization was rate limited; the local scan was retained for a later retry.";
  return "The server did not confirm this walk-in yet; the local scan was retained for retry.";
}
function syncFailureStatus(error: unknown): "RETRY" | "CONFLICT" {
  const code = errorCode(error);
  const text = errorText(error);
  const transientSerialization = code === "40001" && /could not serialize|serialization failure|deadlock|lock timeout/i.test(text);
  const permanentRequest = ["42501", "22023", "23503", "23514"].includes(code);
  return permanentRequest || code === "23505" || (code === "40001" && !transientSerialization) ? "CONFLICT" : "RETRY";
}

type ServerSessionState = { id: string; eventId: string; status: string; actualEnd?: string | null };

async function readServerSessionStates(eventIds: string[]): Promise<ServerSessionState[]> {
  if (!eventIds.length) return [];
  const client = getSupabaseBrowserClient() as unknown as { from?: (table: string) => { select: (fields: string) => { in?: (column: string, values: string[]) => Promise<{ data?: unknown[] | null; error?: unknown | null }> } } };
  if (typeof client.from !== "function") return [];
  const selected = client.from("event_sessions").select("id,event_id,session_status,actual_end");
  if (typeof selected.in !== "function") return [];
  const { data, error } = await selected.in("event_id", eventIds);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return { id: String(item.id ?? ""), eventId: String(item.event_id ?? ""), status: String(item.session_status ?? ""), actualEnd: item.actual_end == null ? null : String(item.actual_end) };
  }).filter((item) => item.id && item.eventId);
}

async function isServerSessionCompleted(eventId: string, sessionId: string): Promise<boolean> {
  const sessions = await readServerSessionStates([eventId]);
  return sessions.some((session) => session.id === sessionId && session.eventId === eventId && session.status === "completed");
}

let activeSync: Promise<{confirmed:number;failed:number;discarded:number}> | null = null;
let activeLifecycleSync: Promise<{completed:boolean;message:string}> | null = null;
const syncBackoffBaseMs = 5_000;
const syncBackoffMaxMs = 5 * 60_000;
const syncInterRecordDelayMs = 125;
let syncBackoffExponent = 0;
let nextSyncAllowedAt = 0;

export type OfflineSyncMetrics = {
  attempts: number;
  successfulRecords: number;
  discardedWalkIns: number;
  transientFailures: number;
  permanentFailures: number;
  lastRetryDelayMs: number;
  activeSyncs: number;
  lastAttemptAt?: string;
};

const syncMetrics: OfflineSyncMetrics = {
  attempts: 0,
  successfulRecords: 0,
  discardedWalkIns: 0,
  transientFailures: 0,
  permanentFailures: 0,
  lastRetryDelayMs: 0,
  activeSyncs: 0
};

export function getOfflineSyncMetrics(): OfflineSyncMetrics { return { ...syncMetrics }; }

export async function reconcileOfflineEventLifecycle(organizerProfileId:string,connectionAlreadyConfirmed=false,forceRetry=false):Promise<{completed:boolean;message:string}> {
  if(activeLifecycleSync) return activeLifecycleSync;
  activeLifecycleSync=(async()=>{
    const api=desktopApi();
    if(!api || (!connectionAlreadyConfirmed && !(await confirmSupabaseConnectivity()))) return {completed:false,message:"A verified connection is required. Local attendance remains saved."};
    const events=await api.listPreparedEvents(organizerProfileId,getManilaCalendarDate());
    // listPreparedEvents is intentionally event-oriented and may return only
    // the latest session summary. Reconciliation, however, must account for
    // every locally unresolved session in the package; otherwise an older
    // START_PENDING/END_PENDING session can keep the global banner stuck.
    const packages=(await Promise.all(events.map(async (summary)=>({summary,pkg:typeof api.getPreparedEvent === "function" ? await api.getPreparedEvent(summary.event.id,organizerProfileId) : null}))))
      .filter((item): item is {summary: typeof events[number]; pkg: PreparedEventPackage} => Boolean(item.pkg));
    const unresolvedSessions=packages.flatMap(({pkg})=>pkg.sessions
      .filter((session)=>["START_PENDING","END_PENDING"].includes(session.offlineLifecycle ?? ""))
      .map((session)=>({pkg,local:session})));
    const failures:string[]=[];
    try {
      const serverSessions=await readServerSessionStates(packages.map(({pkg})=>pkg.event.id));
      for (const {pkg} of packages) {
        const localSessions = pkg.sessions.filter((session) => session.eventId === pkg.event.id);
        const serverOngoing = serverSessions.filter((session) => session.eventId === pkg.event.id && session.status === "ongoing");
        // The end RPC is idempotent server-side, but a response can be lost
        // after the server has already completed the session.  A local
        // CONFLICT must not keep the saved-work banner alive in that case.
        // Only a fresh, matching *completed* server session can resolve it;
        // no end request is issued from this recovery branch.
        for (const local of localSessions.filter((session) => ["END_PENDING", "CONFLICT"].includes(session.offlineLifecycle ?? ""))) {
          const server = serverSessions.find((candidate) => candidate.id === local.id && candidate.eventId === pkg.event.id);
          if (server?.status === "completed") {
            await api.setOfflineLifecycleState(pkg.event.id, local.id, "ENDED");
          }
        }
        for (const server of serverOngoing) {
          const local = localSessions.find((session) => session.id === server.id);
          if (!local) {
            failures.push(`${pkg.event.code}: server session ${server.id} has no matching local prepared session`);
          } else if (!["START_PENDING", "STARTED", "END_PENDING"].includes(local.offlineLifecycle ?? "")) {
            failures.push(`${pkg.event.code}: server session ${server.id} is still ongoing but no local end record exists`);
          }
        }
      }
    } catch (error) {
      failures.push(`Server session state could not be verified${errorCode(error) ? ` (${errorCode(error)})` : ""}`);
    }
    // Reconcile every saved start first. Attendance uploads are gated in the
    // local database until the server knows that its session has started.
    for(const {pkg,local} of unresolvedSessions){
      if(local.offlineStartReconciledAt) continue;
      try {
        if(!local.offlineStartedAt) throw new Error("The local event start time is missing.");
        const {error}=await getSupabaseBrowserClient().rpc("reconcile_offline_event_session_start",{p_session_id:local.id,p_actual_start:local.offlineStartedAt});
        if(error) throw error;
        await api.setOfflineLifecycleState(pkg.event.id,local.id,"STARTED");
      } catch(error) {
        const code=errorCode(error);
        if(["42501","22023","23503","23514"].includes(code)) await api.setOfflineLifecycleState(pkg.event.id,local.id,"CONFLICT");
        failures.push(`${pkg.event.code}: session start could not be confirmed${code ? ` (${code})` : ""}`);
      }
    }

    // Upload attendance independently of lifecycle transitions. In
    // particular, a session already marked STARTED still has queued scans.
    let discardedWalkIns=0;
    for(let i=0;i<5;i++) {
      const result=await synchronizePendingAttendance(20,forceRetry,true,organizerProfileId);
      discardedWalkIns+=result.discarded;
      if(result.failed || result.confirmed + result.discarded<20) break;
    }

    // Reload package/session state. Start reconciliation may have changed a
    // START_PENDING session into END_PENDING, and the original snapshot must
    // never decide whether a server end is safe.
    const refreshedEvents=await api.listPreparedEvents(organizerProfileId,getManilaCalendarDate());
    const refreshedPackages=(await Promise.all(refreshedEvents.map(async (summary)=>({summary,pkg:typeof api.getPreparedEvent === "function" ? await api.getPreparedEvent(summary.event.id,organizerProfileId) : null})))).filter((item): item is {summary: typeof refreshedEvents[number]; pkg: PreparedEventPackage} => Boolean(item.pkg));
    const refreshedEndSessions=refreshedPackages.flatMap(({pkg})=>pkg.sessions
      .filter((session)=>session.offlineLifecycle === "END_PENDING")
      .map((local)=>({pkg,local})));

    // Only commit an offline end after every saved attendance row for that
    // event has a server confirmation.
    for(const {pkg,local} of refreshedEndSessions){
      if(local.offlineLifecycle!=="END_PENDING") continue;
      try {
        if((await api.listPending(pkg.event.id,organizerProfileId)).length) {
          failures.push(`${pkg.event.code}: attendance is still awaiting confirmation`);
          continue;
        }
        if(typeof api.listPendingWalkInScans==="function" && (await api.listPendingWalkInScans(pkg.event.id,organizerProfileId)).some((scan)=>scan.syncStatus!=="CONFIRMED")) {
          failures.push(`${pkg.event.code}: walk-in attendance is still awaiting confirmation`);
          continue;
        }
        if(!local.offlineEndedAt) throw new Error("The local event end time is missing.");
        const {error}=await getSupabaseBrowserClient().rpc("reconcile_offline_event_session_end",{
          p_session_id:local.id,
          p_actual_end:local.offlineEndedAt,
          p_reason:"Organizer ended this session offline.",
          p_expected_student_ids:pkg.participants.filter((participant)=>participant.participantStatus!=="removed").map((participant)=>participant.studentId)
        });
        if(error) throw error;
        await api.setOfflineLifecycleState(pkg.event.id,local.id,"ENDED");
      } catch(error) {
        // A timeout or transport failure can occur after the server commits
        // the idempotent end RPC. Verify the exact server session once before
        // classifying local evidence as conflicting; this prevents a false
        // permanent conflict from a lost successful response.
        try {
          if (await isServerSessionCompleted(pkg.event.id, local.id)) {
            await api.setOfflineLifecycleState(pkg.event.id,local.id,"ENDED");
            continue;
          }
        } catch {
          // Preserve the original failure below when the follow-up read is
          // unavailable. The local end evidence remains retryable.
        }
        const code=errorCode(error);
        if(["42501","22023","23503","23514"].includes(code)) await api.setOfflineLifecycleState(pkg.event.id,local.id,"CONFLICT");
        failures.push(`${pkg.event.code}: session end could not be confirmed${code ? ` (${code})` : ""}`);
      }
    }

    const pending=await api.hasUnresolvedWork(organizerProfileId);
    const discardDetail=discardedWalkIns ? ` ${discardedWalkIns} invalid offline walk-in record${discardedWalkIns === 1 ? " was" : "s were"} discarded automatically.` : "";
    if (pending || failures.length) {
      const detail=failures.length ? ` ${failures.join("; ")}.` : "";
      return {completed:false,message:`Some offline work is still awaiting confirmation.${detail}${discardDetail}`};
    }
    return {completed:true,message:`Offline event sessions and attendance are confirmed.${discardDetail}`};
  })().finally(()=>{activeLifecycleSync=null;});
  return activeLifecycleSync;
}

function registerSyncResult(result: { confirmed: number; failed: number; discarded: number }) {
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

export async function synchronizePendingAttendance(batchSize=20, forceRetry=false, connectionAlreadyConfirmed=false,organizerProfileId?:string): Promise<{confirmed:number;failed:number;discarded:number}> {
  if (activeSync) return activeSync;
  if (!forceRetry && Date.now() < nextSyncAllowedAt) return { confirmed: 0, failed: 0, discarded: 0 };
  const boundedBatchSize = Math.min(20, Math.max(1, Math.floor(batchSize) || 20));
  syncMetrics.attempts += 1;
  syncMetrics.activeSyncs += 1;
  syncMetrics.lastAttemptAt = new Date().toISOString();
  activeSync = synchronizePendingAttendanceOnce(boundedBatchSize, forceRetry, connectionAlreadyConfirmed,organizerProfileId).then((result) => {
    registerSyncResult(result);
    syncMetrics.successfulRecords += result.confirmed;
    syncMetrics.discardedWalkIns += result.discarded;
    return result;
  });
  try { return await activeSync; } finally { activeSync = null; syncMetrics.activeSyncs = Math.max(0, syncMetrics.activeSyncs - 1); }
}

async function synchronizePendingAttendanceOnce(batchSize: number, forceRetry: boolean, connectionAlreadyConfirmed=false,organizerProfileId?:string): Promise<{confirmed:number;failed:number;discarded:number}> {
  const api=desktopApi(); if(!api || !organizerProfileId || (!connectionAlreadyConfirmed && !(await confirmSupabaseConnectivity()))) return {confirmed:0,failed:0,discarded:0};
  await api.recoverInterruptedSync(organizerProfileId);
  const records=await api.beginSync(batchSize, forceRetry,organizerProfileId); const inFlight=new Set<string>(); let confirmed=0,failed=0,discarded=0; let lastRpcAt=0;
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
      const row=data as {id?:string;local_attendance_uuid?:string|null;attendance_status?:string;time_out?:string|null}|null;
      if(!row?.id || row.local_attendance_uuid!==record.localAttendanceUuid) throw new Error("Server confirmation did not match the local record.");
      if(row.attendance_status===undefined&&row.time_out===undefined) await api.confirmSync(record.localAttendanceUuid,row.id);
      else await api.confirmSync(record.localAttendanceUuid,row.id,row.attendance_status,row.time_out);
      confirmed+=1;
      } catch(error) {
      // The request may have committed before its response was lost. Verify by UUID before retaining for retry.
      try {
        const {data}=await getSupabaseBrowserClient().from("attendance_records").select("id, local_attendance_uuid, attendance_status, time_out").eq("local_attendance_uuid",record.localAttendanceUuid).maybeSingle();
        if(data?.id && data.local_attendance_uuid===record.localAttendanceUuid){
          if(data.attendance_status===undefined&&data.time_out===undefined) await api.confirmSync(record.localAttendanceUuid,data.id);
          else await api.confirmSync(record.localAttendanceUuid,data.id,data.attendance_status,data.time_out);
          confirmed+=1; continue;
        }
      } catch { /* Retain locally below. */ }
      const status = syncFailureStatus(error);
      if (status === "CONFLICT") syncMetrics.permanentFailures += 1;
      else syncMetrics.transientFailures += 1;
      await api.failSync(record.localAttendanceUuid,status,safeSyncError(error)); failed+=1;
    }
  }
  const walkIns=typeof api.beginWalkInSync==="function" ? await api.beginWalkInSync(batchSize,organizerProfileId,forceRetry) : [];
  for(const scan of walkIns){
    try {
      const waitMs=Math.max(0,lastRpcAt+syncInterRecordDelayMs-Date.now());
      if(waitMs>0) await new Promise((resolve)=>window.setTimeout(resolve,waitMs));
      lastRpcAt=Date.now();
      const {data,error}=await getSupabaseBrowserClient().rpc("sync_offline_walkin_attendance",{
        p_local_scan_uuid:scan.localScanUuid,p_event_id:scan.eventId,p_session_id:scan.sessionId,
        p_student_number:scan.studentNumber,p_identification_method:scan.identificationMethod,
        p_time_in:scan.timeIn,...(scan.timeOut?{p_time_out:scan.timeOut}:{})
      });
      if(error) throw error;
      const payload=data as {disposition?:"confirmed_registered"|"discarded_permanent_conflict";reasonCode?:string;attendance?:{id?:string;local_attendance_uuid?:string|null;attendance_status?:string;time_in?:string|null;time_out?:string|null};student?:{id?:string;studentNumber?:string;displayName?:string};unverifiedWalkIn?:{localScanUuid?:string}}|null;
      if(payload?.disposition==="discarded_permanent_conflict"){
        await api.discardWalkInSync(scan.localScanUuid,organizerProfileId);
        discarded++;
        continue;
      }
      if(payload?.unverifiedWalkIn?.localScanUuid===scan.localScanUuid){ await api.confirmWalkInSync(scan.localScanUuid); confirmed++; continue; }
      if(payload?.disposition!=="confirmed_registered"||!payload.attendance?.id||payload.attendance.local_attendance_uuid!==scan.localScanUuid||!payload.student?.id||!payload.student.studentNumber){
        throw new Error("The server did not confirm this walk-in scan.");
      }
      await api.confirmWalkInSync(scan.localScanUuid,{
        id:payload.student.id,studentNumber:payload.student.studentNumber,displayName:payload.student.displayName??"Verified student",
        attendanceStatus:payload.attendance.attendance_status??"absent",timeIn:payload.attendance.time_in??scan.timeIn,
        ...(payload.attendance.time_out?{timeOut:payload.attendance.time_out}:{})
      });
      confirmed++;
    }catch(error){
      // A walk-in is removed only when the server returned its explicit
      // permanent-discard disposition. Transport and unexpected failures are
      // always retained for retry rather than becoming a dead-end conflict.
      syncMetrics.transientFailures++;
      await api.failWalkInSync(scan.localScanUuid,"RETRY",safeWalkInSyncError(error));
      failed++;
    }
  }
  return {confirmed,failed,discarded};
}

export async function getOfflineSessionEndState(eventId:string,sessionId:string,organizerProfileId:string) {
  const pkg=await desktopApi()?.getPreparedEvent(eventId,organizerProfileId);
  const session=pkg?.sessions.find((item)=>item.id===sessionId);
  if(!session) return {isLocallyEnded:false,session:null};
  return {isLocallyEnded:Boolean(session.offlineEndedAt)||["END_PENDING","ENDED","CONFLICT"].includes(session.offlineLifecycle??""),session};
}

