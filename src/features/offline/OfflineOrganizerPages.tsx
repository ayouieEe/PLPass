import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import { extractSchoolStudentNumber } from "@/lib/credentials/qrCredential";
import { desktopApi, endOfflineEvent, getManilaCalendarDate, identifyOfflineStudent, listOfflineEvents, recordOfflineAttendance, startOfflineEvent } from "./offlineService";
import type { OfflinePreparedEventSummary, PendingAttendanceRecord, PendingWalkInScan, PreparedEventPackage } from "./types";
import { ScannerStationsPanel } from "./ScannerStationsPanel";

function usePreparedEvents() {
  const { session } = useDevelopmentSession();
  const [events, setEvents] = useState<OfflinePreparedEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!session || session.role !== "organizer" || !desktopApi()) { setEvents([]); setLoading(false); return; }
    setLoading(true);
    try { setEvents(await listOfflineEvents(session.userId)); } catch { setEvents([]); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { events, loading, refresh, session };
}

function OfflineNotice() {
  return <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-950">Saved on this device; not yet synced. The event and participant list are snapshots from when they were downloaded. Changes made remotely while offline will be checked after reconnect.</div>;
}

export function OfflineOrganizerEventsPage() {
  const { events, loading, refresh, session: organizerSession } = usePreparedEvents();
  const navigate = useNavigate();
  if (!organizerSession || organizerSession.role !== "organizer") return <Navigate to={APP_ROUTES.login} replace />;
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Events available offline</h1><p className="text-sm text-muted-foreground">Only event packages downloaded to this desktop for {getManilaCalendarDate()} are shown.</p></div><Button variant="outline" onClick={() => void refresh()}>Refresh local list</Button></div>
    <OfflineNotice />
    {loading ? <p role="status">Loading saved events…</p> : events.length === 0 ? <p className="rounded-xl border bg-surface p-6 text-sm">No event packages for today are saved on this desktop.</p> : events.map((event) => <article key={event.event.id} className="grid gap-3 rounded-xl border bg-surface p-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div><p className="font-semibold">{event.event.title}</p><p className="text-sm text-muted-foreground">{event.event.code} · {new Date(event.event.startsAt).toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{event.lifecycle === "START_PENDING" || event.lifecycle === "STARTED" || event.lifecycle === "END_PENDING" || event.lifecycle === "ENDED" ? "Started on this device" : "Downloaded for today"}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => navigate(APP_ROUTES.organizerEvent(event.event.id))}>View details</Button>{event.lifecycle === "NOT_STARTED" ? <Button onClick={async () => {
        try {
          const api=desktopApi();
          if(!api) throw new Error("Offline events are available only in the PLPass desktop app.");
          const pkg = await api.getPreparedEvent(event.event.id,organizerSession.userId);
          const session = pkg?.sessions.find((candidate) => candidate.id === event.sessionId && (candidate.status === "scheduled" || candidate.status === "ongoing"));
          if (!pkg || !session) throw new Error("The saved package has no startable attendance session.");
          await startOfflineEvent(event.event.id, session.id, organizerSession.userId);
          navigate(`/organizer/live-attendance/${session.id}`);
        } catch (error) { toast.error(error instanceof Error ? error.message : "The offline event could not be started."); }
      }}>Start offline</Button> : <Button onClick={() => event.sessionId ? navigate(`/organizer/live-attendance/${event.sessionId}`) : toast.error("The saved session could not be found.")}>Open event</Button>}</div>
    </article>)}
  </div>;
}

export function OfflineOrganizerEventDetailsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { session } = useDevelopmentSession();
  const [pkg, setPkg] = useState<PreparedEventPackage | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; if (eventId && session?.userId) void desktopApi()?.getPreparedEvent(eventId,session.userId).then((value) => { if (active && value?.organizerProfileId === session.userId) setPkg(value); }).finally(()=>{if(active)setLoading(false);}); else setLoading(false); return () => { active = false; }; }, [eventId, session?.userId]);
  if (!eventId || !session || session.role !== "organizer") return <Navigate to={APP_ROUTES.organizerEvents} replace />;
  if (!pkg) return <div className="grid gap-4"><p>{loading?"Loading saved event…":"This event is not downloaded for this organizer on this desktop."}</p><Link to={APP_ROUTES.organizerEvents}>Back to events</Link></div>;
  const sessionForEvent = pkg.sessions.find((item) => item.offlineStartedAt) ?? pkg.sessions[0];
  return <div className="grid gap-4"><Link className="text-sm underline" to={APP_ROUTES.organizerEvents}>Back to events</Link><h1 className="text-2xl font-semibold">{pkg.event.title}</h1><OfflineNotice /><section className="rounded-xl border bg-surface p-5"><p>Code: {pkg.event.code}</p><p>Schedule: {new Date(pkg.event.startsAt).toLocaleString()} – {new Date(pkg.event.endsAt).toLocaleString()}</p><p>Venue: {sessionForEvent?.venue ?? "—"}</p><p>Participants saved: {pkg.participants.length}</p><p>Attendance records saved: {pkg.attendance.length}</p></section>{sessionForEvent?.offlineStartedAt ? <Button asChild><Link to={`/organizer/live-attendance/${sessionForEvent.id}`}>Open event session</Link></Button> : <p className="text-sm">This event is available from its saved package. Use “Start offline” on the Events screen to begin attendance.</p>}</div>;
}

export function OfflineOrganizerLiveAttendancePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { session } = useDevelopmentSession();
  const [pkg, setPkg] = useState<PreparedEventPackage | null>(null);
  const [pendingRecords,setPendingRecords]=useState<PendingAttendanceRecord[]>([]);
  const [walkInRecords,setWalkInRecords]=useState<PendingWalkInScan[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [method, setMethod] = useState<"qr" | "manual" | "facial">("qr");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [videoActive, setVideoActive] = useState(false);
  const [capturePhase, setCapturePhase] = useState<"time_in"|"time_out">("time_in");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const load = useCallback(async () => {
    if (!sessionId || !session?.userId) return;
    const api=desktopApi();
    const value = await api?.getPreparedEventBySession(sessionId,session.userId);
    const owned = value?.organizerProfileId === session.userId ? value : null;
    setPkg(owned);
    setPendingRecords(owned && api ? await api.listPending(owned.event.id,session.userId) : []);
    setWalkInRecords(owned && api ? await api.listPendingWalkInScans(owned.event.id,session.userId) : []);
    if(owned&&api) setCapturePhase(await api.getAttendanceCapturePhase(sessionId,session.userId));
  }, [session?.userId, sessionId]);
  useEffect(() => { void load(); return () => streamRef.current?.getTracks().forEach((track) => track.stop()); }, [load]);
  useEffect(() => {
    if (!videoActive || method!=="facial" || !videoRef.current) return;
    let disposed = false;
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }).then((stream) => {
      if (disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    }).catch(() => setStatus("Camera unavailable. QR and manual attendance remain available."));
    return () => { disposed = true; streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; };
  }, [method,videoActive]);
  if (!session || session.role !== "organizer" || !sessionId) return <Navigate to={APP_ROUTES.organizerEvents} replace />;
  const preparedSession = pkg?.sessions.find((item) => item.id === sessionId);
  if (!pkg || !preparedSession) return <div className="grid gap-3"><p>This saved event session is unavailable on this desktop.</p><Button asChild variant="outline"><Link to={APP_ROUTES.organizerEvents}>Back to Events</Link></Button></div>;
  const isEnded = preparedSession.status === "completed" || Boolean(preparedSession.offlineEndedAt);
  const attendanceByStudent = new Map(pkg.attendance.filter((row) => row.sessionId === sessionId).map((row) => [row.studentId, row]));
  const pendingByStudent=new Map(pendingRecords.filter((row)=>row.sessionId===sessionId).map((row)=>[row.studentId,row]));
  const capture = async () => {
    if (!pkg || busy || isEnded) return;
    setBusy(true); setStatus("");
    try {
      const video=videoRef.current;
      if (method === "facial" && !video?.videoWidth) throw new Error("Wait for the camera preview before scanning.");
      if (method !== "facial" && !identifier.trim()) throw new Error("Scan or enter a student identifier first.");
      const input: string | HTMLVideoElement = method === "facial" ? video as HTMLVideoElement : identifier;
      const scannedAt=new Date().toISOString();
      const student = await identifyOfflineStudent(pkg.event.id, method, input);
      if (!student) {
        const studentNumber=method==="facial"?"":extractSchoolStudentNumber(identifier);
        if(!studentNumber) throw new Error("This student is not in the downloaded roster. Only a valid student number can be queued for verification.");
        if(!window.confirm(`Student ${studentNumber} is not in the downloaded roster. Save this scan as an unverified walk-in for later review?`)) return;
        const queued=await desktopApi()?.queueWalkInScan({eventId:pkg.event.id,sessionId,studentNumber,identificationMethod:method==="manual"?"manual":"qr",capturePhase,attendanceTimestamp:scannedAt,organizerProfileId:session.userId});
        if(!queued) throw new Error("This desktop cannot securely save a walk-in scan.");
        setStatus(`Unverified walk-in ${studentNumber}: ${capturePhase==="time_in"?"Time In":"Time Out"} saved on this device at ${new Date(scannedAt).toLocaleTimeString()}; not synced.`);
        setIdentifier(""); await load(); return;
      }
      const result = await recordOfflineAttendance({ eventId:pkg.event.id,sessionId,studentId:student.studentId,identificationMethod:method,attendanceTimestamp:scannedAt },capturePhase);
      setStatus(`${student.displayName}: ${result.action === "checked_out" ? "Time Out" : result.action === "checked_in" ? "Time In" : "Already recorded"} at ${new Date(scannedAt).toLocaleTimeString()} — saved on this device, not synced.`);
      setIdentifier(""); await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Attendance was not recorded."); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><Link className="text-sm underline" to={APP_ROUTES.organizerEvent(pkg.event.id)}>Event details</Link><h1 className="text-2xl font-semibold">{pkg.event.title}</h1><p className="text-sm text-muted-foreground">{preparedSession.title} · {preparedSession.venue}</p></div><Button variant="outline" asChild><Link to={APP_ROUTES.organizerEvents}>Events</Link></Button></div><OfflineNotice />
    {!isEnded ? <section className="grid gap-3 rounded-xl border bg-surface p-5"><div className="flex flex-wrap items-center gap-2"><Button variant={method === "qr" ? "default" : "outline"} onClick={() => setMethod("qr")}>QR / scanner</Button><Button variant={method === "manual" ? "default" : "outline"} onClick={() => setMethod("manual")}>Manual</Button><Button variant={method === "facial" ? "default" : "outline"} onClick={() => { setMethod("facial"); setVideoActive(true); }}>Facial</Button><span className="rounded-full bg-muted px-3 py-1 text-sm">{capturePhase==="time_in"?"Current step: Time In":"Current step: Time Out"}</span>{capturePhase==="time_in"?<Button variant="outline" onClick={async()=>{try{const api=desktopApi();if(!api)throw new Error("Desktop secure storage is unavailable.");await api.advanceAttendanceCapturePhase(sessionId,session.userId);setCapturePhase("time_out");const scanner=await api.getScannerStations();if(scanner.active&&scanner.sessionId===sessionId)await api.setScannerCapturePhase("time_out");}catch(error){setStatus(error instanceof Error?error.message:"Could not advance attendance step.");}}}>Advance to Time Out</Button>:null}</div>{method === "facial" ? <video ref={videoRef} autoPlay muted playsInline className="max-h-72 rounded-lg bg-black" /> : <input className="h-11 rounded-md border bg-background px-3" aria-label="QR code or student number" placeholder={method === "qr" ? "Scan QR or enter student number" : "Enter student number or exact name"} value={identifier} onChange={(event) => setIdentifier(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void capture(); }} />}{status ? <p role="status" className="text-sm">{status}</p> : null}<div className="flex flex-wrap gap-2"><Button onClick={() => void capture()} disabled={busy}>{busy ? "Saving locally…" : `Record ${capturePhase === "time_in" ? "Time In" : "Time Out"}`}</Button><ScannerStationsPanel eventId={pkg.event.id} sessionId={sessionId} enabled={true} capturePhase={capturePhase} organizerProfileId={session.userId} /></div></section> : <div className="rounded-xl border bg-surface p-4 text-sm">Event ended on this device at {preparedSession.offlineEndedAt ? new Date(preparedSession.offlineEndedAt).toLocaleString() : "—"}. Attendance remains saved here until sync is confirmed. No absent records are finalized until server synchronization succeeds.</div>}
    <section className="grid gap-3 rounded-xl border bg-surface p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Saved attendance</h2><span>{pkg.participants.length} participants</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Student</th><th className="p-2">Time In</th><th className="p-2">Time Out</th><th className="p-2">Status</th></tr></thead><tbody>{pkg.participants.map((person) => { const record=attendanceByStudent.get(person.studentId); const pending=pendingByStudent.get(person.studentId); return <tr key={person.studentId} className="border-t"><td className="p-2">{person.displayName}</td><td className="p-2">{pending?.timeIn?new Date(pending.timeIn).toLocaleTimeString():record?.timeIn ? new Date(record.timeIn).toLocaleTimeString() : "—"}</td><td className="p-2">{pending?.timeOut?new Date(pending.timeOut).toLocaleTimeString():record?.timeOut ? new Date(record.timeOut).toLocaleTimeString() : "—"}</td><td className="p-2">{pending?.syncStatus==="CONFLICT"?<span title={pending.lastSyncError}>Needs review: {pending.lastSyncError??"server rejected this record"}</span>:pending?"Saved locally; not yet synced":record?.attendanceStatus??"Not yet recorded"}</td></tr>; })}{walkInRecords.map((scan)=><tr key={scan.localScanUuid} className="border-t"><td className="p-2">Unverified walk-in · {scan.studentNumber}</td><td className="p-2">{new Date(scan.timeIn).toLocaleTimeString()}</td><td className="p-2">{scan.timeOut?new Date(scan.timeOut).toLocaleTimeString():"—"}</td><td className="p-2">{scan.syncStatus==="CONFLICT"?`Needs review: ${scan.lastSyncError??"identity not verified"}`:scan.syncStatus==="CONFIRMED"?"Verified and synced":"Saved on this device; not synced"}</td></tr>)}</tbody></table></div></section>
    {!isEnded ? <Button variant="destructive" onClick={async () => { if(!window.confirm("End this event on this device? Attendance will remain local until server sync is confirmed."))return; try { await endOfflineEvent(pkg.event.id,sessionId,session.userId); await load(); setStatus("Event end saved on this device; not yet synced."); } catch (error) { setStatus(error instanceof Error ? error.message : "End state could not be saved."); } }}>End event on this device</Button> : null}
  </div>;
}
