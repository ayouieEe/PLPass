import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LocalAttendanceInput, LocalAttendanceResult, OfflineIdentificationMethod, OfflinePreparedEventSummary, OfflineStatus, PreparedEventPackage, PreparedEventParticipant } from "./types";

export function desktopApi() { return window.plpassDesktop; }

export const offlineWalkInDiscardedEvent = "plpass:offline-walkin-discarded";
export const offlineWalkInResolvedEvent = "plpass:offline-walkin-resolved";

function notifyOfflineWalkInDiscarded(studentNumber: string, reasonCode?: string, localScanUuid?: string) {
  window.dispatchEvent(new CustomEvent(offlineWalkInDiscardedEvent, { detail: { studentNumber, reasonCode, localScanUuid } }));
}
function notifyOfflineWalkInResolved(detail: { localScanUuid: string; studentNumber: string; displayName: string; disposition: "confirmed_walk_in" | "confirmed_invited" }) {
  window.dispatchEvent(new CustomEvent(offlineWalkInResolvedEvent, { detail }));
}

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

export type OfflinePackageRefreshResult = "not_prepared" | "refreshed" | "blocked" | "failed";

/**
 * Refresh an existing package after an online event change without turning an
 * optional continuity update into a failed event mutation. The desktop store
 * remains the final guard against replacing a package with pending attendance.
 */
export async function refreshPreparedEventAfterChange(eventId: string, organizerProfileId?: string): Promise<OfflinePackageRefreshResult> {
  const api = desktopApi();
  if (!api || !organizerProfileId) return "not_prepared";

  try {
    const existingPackage = await api.getPreparedEvent(eventId, organizerProfileId);
    if (!existingPackage) return "not_prepared";
    await prepareEventForOffline(eventId, organizerProfileId);
    return "refreshed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (/offline work awaiting reconciliation|cannot be refreshed yet|active session/i.test(message)) {
      return "blocked";
    }
    return "failed";
  }
}

export async function startOfflineEvent(eventId:string,sessionId:string,organizerProfileId:string) {
  const api=desktopApi(); if(!api) throw new Error("Offline event sessions require the PLPass desktop app.");
  return api.startOfflineSession(eventId,sessionId,organizerProfileId,getManilaCalendarDate(),new Date().toISOString());
}

export async function endOfflineEvent(eventId:string,sessionId:string,organizerProfileId:string,reason?:string) {
  const api=desktopApi(); if(!api) throw new Error("Offline event sessions require the PLPass desktop app.");
  return api.endOfflineSession(eventId,sessionId,organizerProfileId,new Date().toISOString(),reason);
}

export async function identifyOfflineStudent(eventId: string, method: OfflineIdentificationMethod, identifier: string | HTMLVideoElement | HTMLCanvasElement): Promise<PreparedEventParticipant | null> {
  const api = desktopApi(); if (!api) return null;
  if (method === "qr" && typeof identifier === "string") return api.identifyQr(eventId, identifier);
  if (method === "manual" && typeof identifier === "string") return api.identifyManual(eventId, identifier);
  return null;
}

export async function recordOfflineAttendance(input: LocalAttendanceInput, phase?:"time_in"|"time_out"): Promise<LocalAttendanceResult> {
  const api=desktopApi(); if(!api) throw new Error("Local attendance requires the PLPass desktop app.");
  return phase ? api.recordScannerAttendance(input,phase) : api.recordAttendance(input);
}

function errorCode(error: unknown) { return error && typeof error === "object" && "code" in error ? String(error.code) : ""; }
function errorText(error: unknown) { return error && typeof error === "object" && "message" in error ? String(error.message) : String(error ?? ""); }
function safeSyncError(error: unknown) {
  const code = errorCode(error);
  const centralConflict = /central attendance record conflicts|central record differs/i.test(errorText(error));
  if (code === "55006") return "Synchronization was rate limited; the local record was retained for a later retry.";
  if (centralConflict) return "The central record differs from the offline record.";
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
  if (/central attendance record conflicts|central record differs/i.test(text)) return "CONFLICT";
  const transientSerialization = code === "40001" && /could not serialize|serialization failure|deadlock|lock timeout/i.test(text);
  const permanentRequest = ["42501", "22023", "23503", "23514"].includes(code);
  return permanentRequest || code === "23505" || (code === "40001" && !transientSerialization) ? "CONFLICT" : "RETRY";
}

function sameTimestamp(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return left === right;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) ? leftMs === rightMs : left === right;
}

type ServerSessionState = { id: string; eventId: string; status: string; actualEnd?: string | null };

function isPrematureStartConflict(error?: string) {
  return /offline record needs manual review before synchronization can continue/i.test(error ?? "");
}

async function recoverPrematureStartConflicts(
  api: ReturnType<typeof desktopApi>,
  eventId: string,
  sessionId: string,
  organizerProfileId: string,
) {
  if (!api) return;
  const records = await api.listPending(eventId, organizerProfileId);
  for (const record of records) {
    if (record.sessionId === sessionId && record.syncStatus === "CONFLICT" && isPrematureStartConflict(record.lastSyncError)) {
      await api.failSync(record.localAttendanceUuid, "RETRY", "The server session is being started; this attendance will be retried safely.");
    }
  }
  if (typeof api.listPendingWalkInScans !== "function" || typeof api.failWalkInSync !== "function") return;
  const walkIns = await api.listPendingWalkInScans(eventId, organizerProfileId);
  for (const scan of walkIns) {
    if (scan.sessionId === sessionId && scan.syncStatus === "CONFLICT" && isPrematureStartConflict(scan.lastSyncError)) {
      await api.failWalkInSync(scan.localScanUuid, "RETRY", "The server session is being started; this walk-in will be retried safely.");
    }
  }
}

async function readServerSessionStates(eventIds: string[]): Promise<ServerSessionState[]> {
  if (!eventIds.length) return [];
  const client = getSupabaseBrowserClient() as unknown as { from?: (table: string) => { select: (fields: string) => { in?: (column: string, values: string[]) => Promise<{ data?: unknown[] | null; error?: unknown | null }> } } };
  if (typeof client.from !== "function") return [];
  const selected = client.from("event_sessions").select("id,event_id,session_status,actual_end");
  if (typeof selected.in !== "function") return [];
  const { data, error } = await withOfflineSyncDeadline(selected.in("event_id", eventIds));
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

/** Remove only server-confirmed, fully reconciled packages after the 24-hour safety window. */
export async function cleanupExpiredReconciledEvents(organizerProfileId: string, connectionAlreadyConfirmed = false): Promise<number> {
  const api = desktopApi();
  if (!api || (!connectionAlreadyConfirmed && !(await confirmSupabaseConnectivity()))) return 0;

  try {
    const summaries = await api.listPreparedEvents(organizerProfileId, getManilaCalendarDate());
    const packages = (await Promise.all(summaries.map(async (summary) => ({
      eventId: summary.event.id,
      pkg: await api.getPreparedEvent(summary.event.id, organizerProfileId)
    })))).filter((item): item is { eventId: string; pkg: PreparedEventPackage } => Boolean(item.pkg));
    const candidates = packages.filter(({ pkg }) => {
      if (!pkg.sessions.length || !pkg.sessions.every((session) => session.offlineLifecycle === "ENDED" && session.offlineEndedAt)) return false;
      const latestEnd = Math.max(...pkg.sessions.map((session) => Date.parse(session.offlineEndedAt ?? "")));
      return Number.isFinite(latestEnd) && Date.now() - latestEnd >= offlineCleanupGraceMs;
    });
    if (!candidates.length) return 0;

    const serverSessions = await readServerSessionStates(candidates.map(({ pkg }) => pkg.event.id));
    let cleaned = 0;
    for (const { eventId, pkg } of candidates) {
      const sessionsConfirmed = pkg.sessions.every((session) => serverSessions.some((server) => server.id === session.id && server.eventId === eventId && server.status === "completed"));
      if (!sessionsConfirmed) continue;
      if ((await api.listPending(eventId, organizerProfileId)).some((record) => record.sessionId && pkg.sessions.some((session) => session.id === record.sessionId))) continue;
      if (typeof api.listPendingWalkInScans === "function" && (await api.listPendingWalkInScans(eventId, organizerProfileId)).some((scan) => scan.syncStatus !== "CONFIRMED")) continue;
      const result = await api.cleanupEvent(eventId, true, true);
      if (result.cleaned) cleaned += 1;
    }
    return cleaned;
  } catch {
    // A failed verification leaves the package for the next authenticated sweep.
    return 0;
  }
}

let activeSync: Promise<{confirmed:number;failed:number;discarded:number}> | null = null;
export type OfflineReconciliationStage = "idle" | "confirming_session" | "uploading_attendance" | "finalizing_event" | "blocked";

let activeLifecycleSync: Promise<{completed:boolean;message:string}> | null = null;
const syncInterRecordDelayMs = 125;
const offlineSyncRpcDeadlineMs = 30_000;
const offlineLifecycleDeadlineMs = 120_000;
export const offlineCleanupGraceMs = 24 * 60 * 60 * 1000;

function withOfflineSyncDeadline<T>(operation: PromiseLike<T>, timeoutMs = offlineSyncRpcDeadlineMs): Promise<T> {
  let timer: number | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("Offline synchronization request timed out.")), timeoutMs);
  });
  return Promise.race([Promise.resolve(operation), deadline]).finally(() => {
    if (timer !== undefined) window.clearTimeout(timer);
  });
}

export async function reconcileOfflineEventLifecycle(
  organizerProfileId:string,
  connectionAlreadyConfirmed=false,
  forceRetry=false,
  onProgress?: (stage: OfflineReconciliationStage) => void
):Promise<{completed:boolean;message:string}> {
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
    let serverSessions: ServerSessionState[] = [];
    const lifecycleDeadlineAt = Date.now() + offlineLifecycleDeadlineMs;
    const deadlineExceeded = () => Date.now() >= lifecycleDeadlineAt;
    try {
       serverSessions=await readServerSessionStates(packages.map(({pkg})=>pkg.event.id));
      for (const {pkg} of packages) {
        if (deadlineExceeded()) { failures.push("Synchronization deadline reached; saved work will resume with the next retry."); break; }
        const localSessions = pkg.sessions.filter((session) => session.eventId === pkg.event.id);
        const serverOngoing = serverSessions.filter((session) => session.eventId === pkg.event.id && session.status === "ongoing");
        // The end RPC is idempotent server-side, but a response can be lost
        // after the server has already completed the session.  A local
        // CONFLICT must not keep the saved-work banner alive in that case.
        // Only a fresh, matching *completed* server session can resolve it;
        // no end request is issued from this recovery branch.
        for (const local of localSessions.filter((session) => ["START_PENDING", "STARTED", "END_PENDING", "CONFLICT"].includes(session.offlineLifecycle ?? ""))) {
          const server = serverSessions.find((candidate) => candidate.id === local.id && candidate.eventId === pkg.event.id);
          if (server?.status === "completed") {
            const pendingAttendance = (await api.listPending(pkg.event.id, organizerProfileId)).filter((record) => record.sessionId === local.id);
            const pendingWalkIns = typeof api.listPendingWalkInScans === "function"
              ? (await api.listPendingWalkInScans(pkg.event.id, organizerProfileId)).filter((scan) => scan.sessionId === local.id)
              : [];
            if (pendingAttendance.length || pendingWalkIns.some((scan) => scan.syncStatus !== "CONFIRMED")) {
              failures.push(`${pkg.event.code}: server session is completed while local attendance still awaits review`);
            } else {
              await api.setOfflineLifecycleState(pkg.event.id, local.id, "ENDED");
            }
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
    } catch {
      // This is a diagnostic read only. A connection may recover far enough
      // for the authoritative, idempotent start RPC below to succeed while
      // this initial read still fails. Do not leave the UI on its stale
      // scheduled state or skip query invalidation in that case.
    }
    // Reconcile every saved start first. Attendance uploads are gated in the
    // local database until the server knows that its session has started.
    onProgress?.("confirming_session");
    for(const {pkg,local} of unresolvedSessions){
      if (deadlineExceeded()) { failures.push("Synchronization deadline reached; saved work will resume with the next retry."); break; }
       const server = serverSessions.find((candidate) => candidate.id === local.id && candidate.eventId === pkg.event.id);
       // A previous client version could mark an END_PENDING session as
       // locally reconciled before Supabase received the start. If the server
       // still says scheduled, replay the idempotent start RPC and recover only
       // the conflicts produced by that invalid ordering.
       const needsPrematureStartRecovery = server?.status === "scheduled"
         && local.offlineLifecycle === "END_PENDING"
         && Boolean(local.offlineStartReconciledAt);
       if(local.offlineStartReconciledAt && !needsPrematureStartRecovery) continue;
      try {
        if(!local.offlineStartedAt) throw new Error("The local event start time is missing.");
         if (needsPrematureStartRecovery) await recoverPrematureStartConflicts(api, pkg.event.id, local.id, organizerProfileId);
        const {error}=await withOfflineSyncDeadline(getSupabaseBrowserClient().rpc("reconcile_offline_event_session_start",{p_session_id:local.id,p_actual_start:local.offlineStartedAt}));
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
    onProgress?.("uploading_attendance");
    let discardedWalkIns=0;
    for(let i=0;i<5;i++) {
      if (deadlineExceeded()) { failures.push("Synchronization deadline reached; saved work will resume with the next retry."); break; }
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
    onProgress?.("finalizing_event");
    for(const {pkg,local} of refreshedEndSessions){
      if (deadlineExceeded()) { failures.push("Synchronization deadline reached; saved work will resume with the next retry."); break; }
      if(local.offlineLifecycle!=="END_PENDING") continue;
      try {
        if((await api.listPending(pkg.event.id,organizerProfileId)).some((record) => record.sessionId === local.id)) {
          failures.push(`${pkg.event.code}: attendance is still awaiting confirmation`);
          continue;
        }
        if(typeof api.listPendingWalkInScans==="function" && (await api.listPendingWalkInScans(pkg.event.id,organizerProfileId)).some((scan)=>scan.sessionId === local.id && scan.syncStatus!=="CONFIRMED")) {
          failures.push(`${pkg.event.code}: walk-in attendance is still awaiting confirmation`);
          continue;
        }
        if(!local.offlineEndedAt) throw new Error("The local event end time is missing.");
        const {error}=await withOfflineSyncDeadline(getSupabaseBrowserClient().rpc("reconcile_offline_event_session_end",{
          p_session_id:local.id,
          p_actual_end:local.offlineEndedAt,
          p_reason:local.offlineEndReason ?? "Organizer ended this session offline.",
          p_expected_student_ids:pkg.participants.filter((participant)=>participant.participantStatus!=="removed").map((participant)=>participant.studentId)
        }));
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
    // Keep the reconciled package for 24 hours before removing disposable
    // roster data. A later startup, reconnect, or visibility sweep
    // performs the same server and local checks before cleanup.
    if (!pending && !failures.length) await cleanupExpiredReconciledEvents(organizerProfileId, true);
    const discardDetail=discardedWalkIns ? ` ${discardedWalkIns} invalid offline walk-in record${discardedWalkIns === 1 ? " was" : "s were"} discarded automatically.` : "";
    if (pending || failures.length) {
      onProgress?.("blocked");
      const detail=failures.length ? ` ${failures.join("; ")}.` : "";
      return {completed:false,message:`Some offline work is still awaiting confirmation.${detail}${discardDetail}`};
    }
    return {completed:true,message:`Offline event sessions and attendance are confirmed.${discardDetail}`};
  })().finally(()=>{activeLifecycleSync=null;});
  return activeLifecycleSync;
}

export async function synchronizePendingAttendance(batchSize=20, forceRetry=false, connectionAlreadyConfirmed=false,organizerProfileId?:string): Promise<{confirmed:number;failed:number;discarded:number}> {
  if (activeSync) return activeSync;
  const boundedBatchSize = Math.min(20, Math.max(1, Math.floor(batchSize) || 20));
  activeSync = synchronizePendingAttendanceOnce(boundedBatchSize, forceRetry, connectionAlreadyConfirmed,organizerProfileId);
  try { return await activeSync; } finally { activeSync = null; }
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
      const {data,error}=await withOfflineSyncDeadline(client.rpc("sync_offline_event_attendance",{p_local_attendance_uuid:record.localAttendanceUuid,p_session_id:record.sessionId,p_student_id:record.studentId,p_identification_method:record.identificationMethod,p_attendance_status:record.attendanceStatus,p_time_in:record.timeIn,...(record.timeOut?{p_time_out:record.timeOut}:{}),...(record.checkoutIdentificationMethod?{p_checkout_identification_method:record.checkoutIdentificationMethod}:{}),...(record.remarks?{p_remarks:record.remarks}:{}),...(record.lateReason?{p_late_reason:record.lateReason}:{})}));
      if(error) throw error;
      if (!data) {
        // NULL is used both for temporary throttling and for a safely persisted
        // central/offline time conflict. Resolve that ambiguity without changing
        // either record: the central row is authoritative and the local row is
        // retained as CONFLICT for organizer review.
        const {data:central,error:centralError}=await withOfflineSyncDeadline(client.from("attendance_records")
          .select("id, event_session_id, student_id, time_in")
          .eq("event_session_id",record.sessionId)
          .eq("student_id",record.studentId)
          .maybeSingle());
        if (centralError) throw centralError;
        if (central?.id && central.time_in && !sameTimestamp(central.time_in,record.timeIn)) {
          await api.failSync(record.localAttendanceUuid,"CONFLICT","The central record differs from the offline record.");
          failed += 1;
          continue;
        }
        const rateLimited = { code: "55006", message: "Offline synchronization was rate limited." };
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
      await api.failSync(record.localAttendanceUuid,status,safeSyncError(error)); failed+=1;
    }
  }
  const walkIns=typeof api.beginWalkInSync==="function" ? await api.beginWalkInSync(batchSize,organizerProfileId,forceRetry) : [];
  for(const scan of walkIns){
    try {
      const waitMs=Math.max(0,lastRpcAt+syncInterRecordDelayMs-Date.now());
      if(waitMs>0) await new Promise((resolve)=>window.setTimeout(resolve,waitMs));
      lastRpcAt=Date.now();
      // The generated Supabase types describe the currently deployed RPCs.
      // This versioned function is declared in the pending migration below.
      const walkInSyncClient = getSupabaseBrowserClient() as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      };
      const {data,error}=await withOfflineSyncDeadline(walkInSyncClient.rpc("record_approved_event_walkin",{
        p_local_scan_uuid:scan.localScanUuid,p_event_id:scan.eventId,p_session_id:scan.sessionId,
        p_student_number:scan.studentNumber,p_identification_method:scan.identificationMethod,
        p_time_in:scan.timeIn,...(scan.timeOut?{p_time_out:scan.timeOut}:{}),
        ...(scan.checkoutIdentificationMethod?{p_checkout_identification_method:scan.checkoutIdentificationMethod}:{})
      }));
      if(error) throw error;
      const payload=data as {disposition?:"confirmed_walk_in"|"confirmed_invited"|"discarded_permanent_conflict";reasonCode?:string;attendance?:{id?:string;local_attendance_uuid?:string|null;attendance_status?:string;time_in?:string|null;time_out?:string|null};student?:{id?:string;studentNumber?:string;displayName?:string}}|null;
      if(payload?.disposition==="discarded_permanent_conflict"){
        await api.discardWalkInSync(scan.localScanUuid,organizerProfileId);
        notifyOfflineWalkInDiscarded(scan.studentNumber,payload.reasonCode,scan.localScanUuid);
        discarded++;
        continue;
      }
      if((payload?.disposition!=="confirmed_walk_in"&&payload?.disposition!=="confirmed_invited")||!payload.attendance?.id||payload.attendance.local_attendance_uuid!==scan.localScanUuid||!payload.student?.id||!payload.student.studentNumber){
        throw new Error("The server did not confirm this walk-in scan.");
      }
      await api.confirmWalkInSync(scan.localScanUuid,{
        id:payload.student.id,studentNumber:payload.student.studentNumber,displayName:payload.student.displayName??"Verified student",participantStatus:payload.disposition === "confirmed_walk_in" ? "walk_in" : "invited",
        attendanceStatus:payload.attendance.attendance_status??"absent",timeIn:payload.attendance.time_in??scan.timeIn,
        ...(payload.attendance.time_out?{timeOut:payload.attendance.time_out}:{})
      });
      notifyOfflineWalkInResolved({
        localScanUuid: scan.localScanUuid,
        studentNumber: payload.student.studentNumber,
        displayName: payload.student.displayName ?? "Verified student",
        disposition: payload.disposition
      });
      confirmed++;
    }catch(error){
      // A walk-in is removed only when the server returned its explicit
      // permanent-discard disposition. Transport and unexpected failures are
      // always retained for retry rather than becoming a dead-end conflict.
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

