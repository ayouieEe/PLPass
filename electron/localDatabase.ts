import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { localMigrations } from "./migrations.js";
import type { CleanupResult, LocalAttendanceInput, LocalAttendanceResult, OfflinePreparedEventSummary, OfflineStatus, PendingAttendanceRecord, PreparedEventPackage, PreparedEventParticipant } from "../src/features/offline/types.js";
import { studentIdentityMatchesPayload } from "../src/lib/credentials/qrCredential.js";

type SqlRow = Record<string, unknown>;

function value(row: SqlRow | undefined, key: string) { const item=row?.[key]; return item == null ? undefined : String(item); }
function manilaDate(value: string | Date) { const parts=new Intl.DateTimeFormat("en-US", { timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit" }).formatToParts(new Date(value)); const part=(name:string)=>parts.find((item)=>item.type===name)?.value??""; return `${part("year")}-${part("month")}-${part("day")}`; }
function hasColumn(db: DatabaseSync, table: string, column: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as SqlRow[]).some((row) => row.name === column);
}
function repairOfflineColumns(db: DatabaseSync) {
  const columns: Array<[string, string, string]> = [
    ["prepared_events", "organizer_profile_id", "TEXT"],
    ["prepared_events", "prepared_manila_date", "TEXT"],
    ["cached_sessions", "offline_lifecycle", "TEXT NOT NULL DEFAULT 'NOT_STARTED'"],
    ["cached_sessions", "offline_started_at", "TEXT"],
    ["cached_sessions", "offline_ended_at", "TEXT"],
    ["cached_sessions", "offline_end_reason", "TEXT"]
  ];
  for (const [table, column, definition] of columns) {
    if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export class LocalAttendanceDatabase {
  constructor(private readonly db: DatabaseSync) {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;");
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of localMigrations) {
      const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(migration.version);
      if (!applied) this.transaction(() => {
        if (migration.version === 4) repairOfflineColumns(db);
        db.exec(migration.sql);
        db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(migration.version, new Date().toISOString());
        });
    }
    // Repair columns independently of migration markers. Older desktop builds
    // could leave a marker behind before all offline columns were created.
    // Keeping this idempotent makes every startup safe for those databases.
    repairOfflineColumns(db);
    db.exec("CREATE INDEX IF NOT EXISTS prepared_events_owner_day_idx ON prepared_events(organizer_profile_id, prepared_manila_date, preparation_status)");
    this.recoverInterruptedSync();
  }

  private transaction<T>(operation:()=>T):T { this.db.exec("BEGIN IMMEDIATE"); try { const result=operation(); this.db.exec("COMMIT"); return result; } catch(error) { this.db.exec("ROLLBACK"); throw error; } }

  prepareEvent(pkg: PreparedEventPackage, organizerProfileId = pkg.organizerProfileId ?? "test-organizer"): OfflineStatus {
    if (!organizerProfileId) throw new Error("An organizer identity is required to scope the offline package.");
    if (!pkg.event.id || !pkg.sessions.length || !pkg.participants.length || pkg.participants.some((p) => !p.studentId || !p.studentNumber)) {
      throw new Error("Event package is incomplete and was not marked ready.");
    }
    const localWork = Number((this.db.prepare(`SELECT COUNT(*) count FROM pending_attendance p LEFT JOIN cached_sessions s ON s.session_id=p.session_id
      WHERE (p.event_id=? AND p.sync_status<>'CONFIRMED') OR (s.event_id=? AND s.offline_lifecycle IN ('START_PENDING','END_PENDING','CONFLICT'))`).get(pkg.event.id,pkg.event.id) as SqlRow).count);
    if (localWork) throw new Error("This package has offline work awaiting reconciliation and cannot be refreshed yet.");
    const priorOwner=value(this.db.prepare("SELECT organizer_profile_id FROM prepared_events WHERE event_id=?").get(pkg.event.id) as SqlRow|undefined,"organizer_profile_id");
    if(priorOwner && priorOwner!==organizerProfileId) throw new Error("This saved event package belongs to another organizer on this desktop.");
    this.transaction(() => {
      this.db.prepare(`INSERT INTO prepared_events(event_id,event_code,title,event_status,starts_at,ends_at,cache_version,prepared_at,preparation_status,organizer_profile_id,prepared_manila_date)
        VALUES(@id,@code,@title,@status,@startsAt,@endsAt,@cacheVersion,@preparedAt,'PREPARING',@organizerProfileId,@preparedManilaDate)
        ON CONFLICT(event_id) DO UPDATE SET event_code=excluded.event_code,title=excluded.title,event_status=excluded.event_status,
        starts_at=excluded.starts_at,ends_at=excluded.ends_at,cache_version=excluded.cache_version,prepared_at=excluded.prepared_at,preparation_status='PREPARING',
        organizer_profile_id=excluded.organizer_profile_id,prepared_manila_date=excluded.prepared_manila_date`).run({ ...pkg.event, cacheVersion: pkg.cacheVersion, preparedAt: pkg.preparedAt, organizerProfileId, preparedManilaDate: manilaDate(pkg.preparedAt) });
      this.db.prepare("DELETE FROM cached_sessions WHERE event_id = ?").run(pkg.event.id);
      this.db.prepare("DELETE FROM cached_participants WHERE event_id = ?").run(pkg.event.id);
      const session = this.db.prepare(`INSERT INTO cached_sessions(session_id,event_id,title,venue,session_status,starts_at,ends_at,late_cutoff_at,attendance_window_start_at,attendance_window_end_at,offline_lifecycle)
        VALUES(@id,@eventId,@title,@venue,@status,@startsAt,@endsAt,@lateCutoffAt,@attendanceWindowStartAt,@attendanceWindowEndAt,@offlineLifecycle)`);
      pkg.sessions.forEach((item) => session.run({ ...item, offlineLifecycle:item.status==="ongoing"?"STARTED":"NOT_STARTED", lateCutoffAt: item.lateCutoffAt ?? null, attendanceWindowStartAt: item.attendanceWindowStartAt ?? null, attendanceWindowEndAt: item.attendanceWindowEndAt ?? null }));
      const participant = this.db.prepare(`INSERT INTO cached_participants VALUES(@eventId,@studentId,@studentNumber,@displayName,@participantStatus,@qrIdentifier,@faceEmbeddings)`);
      pkg.participants.forEach((item) => participant.run({ eventId: pkg.event.id, ...item, qrIdentifier: item.qrIdentifier ?? null, faceEmbeddings: JSON.stringify(item.faceEmbeddings) }));
      const attendance = this.db.prepare(`INSERT INTO cached_attendance_state VALUES(@sessionId,@studentId,@attendanceStatus,@timeIn,@timeOut)`);
      pkg.attendance.forEach((item) => attendance.run({ ...item, timeIn: item.timeIn ?? null, timeOut: item.timeOut ?? null }));
      this.db.prepare("UPDATE prepared_events SET preparation_status='READY' WHERE event_id=?").run(pkg.event.id);
    });
    return this.getStatus(pkg.event.id);
  }

  listPreparedEvents(organizerProfileId: string, today: string): OfflinePreparedEventSummary[] {
    const rows = this.db.prepare(`WITH ranked_sessions AS (
        SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.event_id ORDER BY
          CASE WHEN s.offline_lifecycle IN ('START_PENDING','STARTED','END_PENDING','ENDED','CONFLICT') THEN 0
               WHEN s.session_status IN ('scheduled','ongoing') THEN 1 ELSE 2 END,
          s.starts_at, s.session_id) AS session_rank
        FROM cached_sessions s
      )
      SELECT e.*, s.session_id, COALESCE(s.offline_lifecycle, 'NOT_STARTED') lifecycle,
        s.offline_started_at local_started_at, s.offline_ended_at local_ended_at
      FROM prepared_events e LEFT JOIN ranked_sessions s ON s.event_id=e.event_id AND s.session_rank=1
      WHERE e.organizer_profile_id=? AND e.preparation_status='READY'
        AND (e.prepared_manila_date=? OR s.offline_lifecycle IN ('START_PENDING','STARTED','END_PENDING','ENDED','CONFLICT'))
      ORDER BY e.starts_at`).all(organizerProfileId, today) as SqlRow[];
    return rows.map((row) => ({ cacheVersion:Number(row.cache_version), organizerProfileId, sessionId:value(row,"session_id"), preparedAt:String(row.prepared_at),
      event:{id:String(row.event_id),code:String(row.event_code),title:String(row.title),status:String(row.event_status),startsAt:String(row.starts_at),endsAt:String(row.ends_at)},
      lifecycle:String(row.lifecycle) as OfflinePreparedEventSummary["lifecycle"], localStartedAt:value(row,"local_started_at"), localEndedAt:value(row,"local_ended_at") }));
  }
  hasUnresolvedWork(organizerProfileId:string):boolean {
    const row=this.db.prepare(`SELECT EXISTS(SELECT 1 FROM pending_attendance p JOIN prepared_events e ON e.event_id=p.event_id
      WHERE e.organizer_profile_id=? AND p.sync_status<>'CONFIRMED') OR EXISTS(SELECT 1 FROM cached_sessions s JOIN prepared_events e ON e.event_id=s.event_id
      WHERE e.organizer_profile_id=? AND s.offline_lifecycle IN ('START_PENDING','END_PENDING','CONFLICT')) unresolved`).get(organizerProfileId,organizerProfileId) as SqlRow;
    return Boolean(row.unresolved);
  }

  startOfflineSession(eventId:string,sessionId:string,organizerProfileId:string,today:string,startedAt:string):PreparedEventPackage {
    const event=this.db.prepare("SELECT * FROM prepared_events WHERE event_id=? AND organizer_profile_id=? AND preparation_status='READY'").get(eventId,organizerProfileId) as SqlRow|undefined;
    if(!event || String(event.prepared_manila_date)!==today || manilaDate(String(event.starts_at))!==today) throw new Error("Only an event package prepared today for today's Manila schedule can be started offline.");
    if(!["scheduled","ongoing"].includes(String(event.event_status))) throw new Error("This event is not available to start offline.");
    const session=this.db.prepare("SELECT * FROM cached_sessions WHERE session_id=? AND event_id=?").get(sessionId,eventId) as SqlRow|undefined;
    if(!session || !["scheduled","ongoing"].includes(String(session.session_status))) throw new Error("The prepared attendance session is not available.");
    this.transaction(()=>this.db.prepare(`UPDATE cached_sessions SET session_status='ongoing',attendance_window_start_at=?,attendance_window_end_at=NULL,
      offline_lifecycle=CASE WHEN offline_lifecycle IN ('START_PENDING','STARTED','END_PENDING','ENDED') THEN offline_lifecycle ELSE 'START_PENDING' END,
      offline_started_at=COALESCE(offline_started_at,?) WHERE session_id=?`).run(startedAt,startedAt,sessionId));
    const updated=this.getPreparedEvent(eventId);
    if(!updated) throw new Error("The saved event package disappeared while starting offline.");
    return updated;
  }

  endOfflineSession(eventId:string,sessionId:string,organizerProfileId:string,endedAt:string,reason?:string):PreparedEventPackage {
    const event=this.db.prepare("SELECT 1 FROM prepared_events WHERE event_id=? AND organizer_profile_id=? AND preparation_status='READY'").get(eventId,organizerProfileId);
    const session=this.db.prepare("SELECT offline_lifecycle,offline_started_at,starts_at FROM cached_sessions WHERE session_id=? AND event_id=?").get(sessionId,eventId) as SqlRow|undefined;
    if(!event || !session || !["START_PENDING","STARTED"].includes(String(session.offline_lifecycle))) throw new Error("This event has not been started on this device.");
    const localStart=value(session,"offline_started_at") ?? String(session.starts_at);
    if(new Date(endedAt).getTime()<new Date(localStart).getTime()) throw new Error("The local end time cannot be earlier than the start time.");
    this.transaction(()=>this.db.prepare(`UPDATE cached_sessions SET session_status='completed',attendance_window_end_at=?,offline_ended_at=COALESCE(offline_ended_at,?),
      offline_started_at=COALESCE(offline_started_at,?),offline_end_reason=COALESCE(offline_end_reason,?),
      offline_lifecycle=CASE WHEN offline_lifecycle='STARTED' THEN 'END_PENDING' ELSE offline_lifecycle END WHERE session_id=?`).run(endedAt,endedAt,localStart,reason?.slice(0,240)??null,sessionId));
    const updated=this.getPreparedEvent(eventId);
    if(!updated) throw new Error("The saved event package disappeared while ending offline.");
    return updated;
  }

  setOfflineLifecycleState(eventId:string,sessionId:string,state:"STARTED"|"ENDED"|"CONFLICT") {
    if(state==="STARTED") this.db.prepare("UPDATE cached_sessions SET offline_lifecycle=CASE WHEN offline_ended_at IS NOT NULL THEN 'END_PENDING' ELSE 'STARTED' END WHERE session_id=? AND event_id=?").run(sessionId,eventId);
    else this.db.prepare("UPDATE cached_sessions SET offline_lifecycle=? WHERE session_id=? AND event_id=?").run(state,sessionId,eventId);
  }

  getStatus(eventId: string): OfflineStatus {
    const event = this.db.prepare("SELECT preparation_status, prepared_at, last_successful_sync_at FROM prepared_events WHERE event_id=?").get(eventId) as SqlRow | undefined;
    const counts = this.db.prepare(`SELECT COUNT(*) total, SUM(sync_status='RETRY') retries, SUM(sync_status='CONFLICT') conflicts, SUM(sync_status='SYNCING') syncing FROM pending_attendance WHERE event_id=?`).get(eventId) as SqlRow;
    const next = this.db.prepare("SELECT MIN(next_attempt_at) next_attempt_at FROM pending_attendance WHERE event_id=? AND sync_status='RETRY' AND next_attempt_at IS NOT NULL").get(eventId) as SqlRow | undefined;
    return { runtimeAvailable: true, connectivity: "checking", packageStatus: (value(event ?? {}, "preparation_status") as OfflineStatus["packageStatus"]) ?? "NOT_PREPARED", preparedAt: value(event ?? {}, "prepared_at"), pendingCount: Number(counts.total ?? 0), retryCount: Number(counts.retries ?? 0), conflictCount: Number(counts.conflicts ?? 0), syncingCount: Number(counts.syncing ?? 0), nextAttemptAt: value(next ?? {}, "next_attempt_at"), lastSuccessfulSyncAt: value(event ?? {}, "last_successful_sync_at") };
  }
  getStatusForOrganizer(eventId:string,organizerProfileId:string):OfflineStatus {
    const owner=this.db.prepare("SELECT 1 FROM prepared_events WHERE event_id=? AND organizer_profile_id=?").get(eventId,organizerProfileId);
    return owner ? this.getStatus(eventId) : {runtimeAvailable:true,connectivity:"checking",packageStatus:"NOT_PREPARED",pendingCount:0,retryCount:0,conflictCount:0,syncingCount:0};
  }
  getPreparedEvent(eventId:string):PreparedEventPackage|null {
    const e=this.db.prepare("SELECT * FROM prepared_events WHERE event_id=? AND preparation_status='READY'").get(eventId) as SqlRow|undefined; if(!e)return null;
    const sessions=(this.db.prepare("SELECT * FROM cached_sessions WHERE event_id=?").all(eventId) as SqlRow[]).map(s=>({id:String(s.session_id),eventId:String(s.event_id),title:String(s.title),venue:String(s.venue),status:String(s.session_status),startsAt:String(s.starts_at),endsAt:String(s.ends_at),lateCutoffAt:value(s,"late_cutoff_at"),attendanceWindowStartAt:value(s,"attendance_window_start_at"),attendanceWindowEndAt:value(s,"attendance_window_end_at"),offlineLifecycle:String(s.offline_lifecycle) as PreparedEventPackage["sessions"][number]["offlineLifecycle"],offlineStartedAt:value(s,"offline_started_at"),offlineEndedAt:value(s,"offline_ended_at")}));
    const participants=(this.db.prepare("SELECT * FROM cached_participants WHERE event_id=?").all(eventId) as SqlRow[]).map(p=>this.participant(p)).filter((p):p is PreparedEventParticipant=>p!==null);
    const attendance=(this.db.prepare("SELECT * FROM cached_attendance_state WHERE session_id IN (SELECT session_id FROM cached_sessions WHERE event_id=?)").all(eventId) as SqlRow[]).map(a=>({sessionId:String(a.session_id),studentId:String(a.student_id),attendanceStatus:String(a.attendance_status),timeIn:value(a,"time_in"),timeOut:value(a,"time_out")}));
    return {cacheVersion:Number(e.cache_version),organizerProfileId:value(e,"organizer_profile_id"),preparedAt:String(e.prepared_at),event:{id:String(e.event_id),code:String(e.event_code),title:String(e.title),status:String(e.event_status),startsAt:String(e.starts_at),endsAt:String(e.ends_at)},sessions,participants,attendance};
  }
  getPreparedEventForOrganizer(eventId:string,organizerProfileId:string):PreparedEventPackage|null {
    const owner=this.db.prepare("SELECT 1 FROM prepared_events WHERE event_id=? AND organizer_profile_id=? AND preparation_status='READY'").get(eventId,organizerProfileId);
    return owner ? this.getPreparedEvent(eventId) : null;
  }
  getPreparedEventBySession(sessionId:string){ const row=this.db.prepare("SELECT event_id FROM cached_sessions WHERE session_id=?").get(sessionId) as SqlRow|undefined; return row?this.getPreparedEvent(String(row.event_id)):null; }
  getPreparedEventBySessionForOrganizer(sessionId:string,organizerProfileId:string){ const row=this.db.prepare("SELECT e.event_id FROM cached_sessions s JOIN prepared_events e ON e.event_id=s.event_id WHERE s.session_id=? AND e.organizer_profile_id=? AND e.preparation_status='READY'").get(sessionId,organizerProfileId) as SqlRow|undefined; return row?this.getPreparedEvent(String(row.event_id)):null; }

  private participant(row: SqlRow | undefined): PreparedEventParticipant | null {
    if (!row) return null;
    return { studentId: String(row.student_id), studentNumber: String(row.student_number), displayName: String(row.display_name), participantStatus: String(row.participant_status), qrIdentifier: value(row, "qr_identifier"), faceEmbeddings: JSON.parse(String(row.face_embeddings_json ?? "[]")) as number[][] };
  }
  identifyQr(eventId: string, qr: string) {
    const value = qr.trim();
    const rows = this.db.prepare("SELECT * FROM cached_participants WHERE event_id=? AND participant_status<>'removed'").all(eventId) as SqlRow[];
    return this.participant(rows.find((row) => studentIdentityMatchesPayload(value, String(row.student_number ?? ""), String(row.display_name ?? ""))));
  }
  getAttendanceState(sessionId: string, studentId: string) {
    const row = this.db.prepare("SELECT time_in, time_out FROM cached_attendance_state WHERE session_id=? AND student_id=?").get(sessionId, studentId) as SqlRow | undefined;
    return row ? { timeIn: value(row, "time_in"), timeOut: value(row, "time_out") } : null;
  }
  identifyManual(eventId: string, input: string) { return this.participant(this.db.prepare("SELECT * FROM cached_participants WHERE event_id=? AND participant_status<>'removed' AND (lower(student_number)=lower(?) OR lower(display_name)=lower(?))").get(eventId, input.trim(), input.trim()) as SqlRow | undefined); }
  listFaceCandidates(eventId: string) { return (this.db.prepare("SELECT * FROM cached_participants WHERE event_id=? AND participant_status<>'removed' AND face_embeddings_json<>'[]'").all(eventId) as SqlRow[]).map((row) => this.participant(row)).filter((p):p is PreparedEventParticipant=>p!==null); }

  // Phone scanner stations are intentionally check-in only.  A continuously
  // visible QR must never turn a successful Time In into a Time Out simply
  // because the camera reads it again.
  recordScannerCheckIn(input: LocalAttendanceInput): LocalAttendanceResult {
    return this.recordAttendance(input, false);
  }

  recordScannerCheckOut(input: LocalAttendanceInput): LocalAttendanceResult {
    return this.recordAttendance(input, true, true);
  }

  recordAttendance(input: LocalAttendanceInput, allowCheckOut = true, requireExistingCheckIn = false): LocalAttendanceResult {
    const now = input.attendanceTimestamp;
    const result = this.transaction(() => {
      const session = this.db.prepare("SELECT * FROM cached_sessions WHERE session_id=? AND event_id=?").get(input.sessionId, input.eventId) as SqlRow | undefined;
      if (!session || String(session.session_status) !== "ongoing") throw new Error("No active prepared event session is available.");
      const attendanceWindowStart = value(session, "attendance_window_start_at") ?? String(session.starts_at);
      const attendanceWindowEnd = value(session, "attendance_window_end_at");
      if (now < attendanceWindowStart || (attendanceWindowEnd && now > attendanceWindowEnd)) throw new Error("Attendance is outside the prepared session window.");
      const participant = this.db.prepare("SELECT 1 FROM cached_participants WHERE event_id=? AND student_id=? AND participant_status<>'removed'").get(input.eventId, input.studentId);
      if (!participant) throw new Error("Student is not eligible for this event.");
      const existingServer = this.db.prepare("SELECT * FROM cached_attendance_state WHERE session_id=? AND student_id=?").get(input.sessionId, input.studentId) as SqlRow | undefined;
      const existing = this.db.prepare("SELECT * FROM pending_attendance WHERE session_id=? AND student_id=?").get(input.sessionId, input.studentId) as SqlRow | undefined;
      if (existing?.time_out) return { action: "already_recorded" as const, row: existing };
      if (existingServer?.time_out) throw new Error("Attendance was already recorded and completed in Supabase.");
      if (existing && !allowCheckOut) return { action: "already_recorded" as const, row: existing };
      if (existing) {
        if (new Date(now).getTime() < new Date(String(existing.time_in)).getTime() + 60_000) throw new Error("Time Out can be recorded at least one minute after Time In.");
        const existingUuid=String(existing.local_attendance_uuid);
        this.db.prepare("UPDATE pending_attendance SET time_out=?, checkout_identification_method=?, attendance_timestamp=?, sync_status='PENDING_SYNC', updated_at=? WHERE local_attendance_uuid=?").run(now, input.identificationMethod, now, now, existingUuid);
        return { action: "checked_out" as const, row: this.db.prepare("SELECT * FROM pending_attendance WHERE local_attendance_uuid=?").get(existingUuid) as SqlRow };
      }
      if (existingServer?.time_in) {
        if (!allowCheckOut) return { action: "already_recorded" as const, row: existingServer };
        const timeIn = String(existingServer.time_in);
        if (now < new Date(new Date(timeIn).getTime() + 60_000).toISOString()) throw new Error("Time Out can be recorded at least one minute after Time In.");
        const uuid = randomUUID();
        this.db.prepare(`INSERT INTO pending_attendance(local_attendance_uuid,event_id,session_id,student_id,identification_method,checkout_identification_method,attendance_timestamp,attendance_status,time_in,time_out,device_id,remarks,late_reason,sync_status,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING_SYNC',?,?)`).run(uuid,input.eventId,input.sessionId,input.studentId,input.identificationMethod,input.identificationMethod,now,String(existingServer.attendance_status),timeIn,now,input.deviceId??null,input.remarks??null,input.lateReason??null,now,now);
        this.db.prepare("UPDATE cached_attendance_state SET time_out=? WHERE session_id=? AND student_id=?").run(now,input.sessionId,input.studentId);
        return { action:"checked_out" as const, row:this.db.prepare("SELECT * FROM pending_attendance WHERE local_attendance_uuid=?").get(uuid) as SqlRow };
      }
      if (requireExistingCheckIn) throw new Error("No Time In is recorded for this student.");
      const status = input.attendanceStatus ?? (now > String(session.late_cutoff_at ?? session.starts_at) ? "late" : "present");
      const uuid = randomUUID();
      this.db.prepare(`INSERT INTO pending_attendance(local_attendance_uuid,event_id,session_id,student_id,identification_method,attendance_timestamp,attendance_status,time_in,device_id,remarks,late_reason,sync_status,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'PENDING_SYNC',?,?)`).run(uuid,input.eventId,input.sessionId,input.studentId,input.identificationMethod,now,status,now,input.deviceId ?? null,input.remarks ?? null,input.lateReason ?? null,now,now);
      this.db.prepare("INSERT OR REPLACE INTO cached_attendance_state VALUES(?,?,?,?,NULL)").run(input.sessionId,input.studentId,status,now);
      return { action: "checked_in" as const, row: this.db.prepare("SELECT * FROM pending_attendance WHERE local_attendance_uuid=?").get(uuid) as SqlRow };
    });
    const record = this.mapPending(result.row as SqlRow);
    return { record, action: result.action, safeMessage: result.action === "already_recorded" ? "Attendance was already recorded." : `${result.action === "checked_in" ? "Check-in" : "Check-out"} recorded locally; synchronization is pending.` };
  }

  private mapPending(row: SqlRow): PendingAttendanceRecord { return { localAttendanceUuid:String(row.local_attendance_uuid),eventId:String(row.event_id),sessionId:String(row.session_id),studentId:String(row.student_id),identificationMethod:String(row.identification_method) as PendingAttendanceRecord["identificationMethod"],checkoutIdentificationMethod:value(row,"checkout_identification_method") as PendingAttendanceRecord["checkoutIdentificationMethod"],attendanceTimestamp:String(row.attendance_timestamp),attendanceStatus:String(row.attendance_status) as "present"|"late",timeIn:String(row.time_in),timeOut:value(row,"time_out"),deviceId:value(row,"device_id"),remarks:value(row,"remarks"),lateReason:value(row,"late_reason"),syncStatus:String(row.sync_status) as PendingAttendanceRecord["syncStatus"],syncAttempts:Number(row.sync_attempts),lastSyncAttemptAt:value(row,"last_sync_attempt_at"),lastSyncError:value(row,"last_sync_error"),nextAttemptAt:value(row,"next_attempt_at"),createdAt:String(row.created_at),updatedAt:String(row.updated_at),serverAttendanceId:value(row,"server_attendance_id"),serverConfirmedAt:value(row,"server_confirmed_at") }; }
  listPending(eventId?: string,organizerProfileId?:string) { const rows = organizerProfileId ? eventId ? this.db.prepare("SELECT p.* FROM pending_attendance p JOIN prepared_events e ON e.event_id=p.event_id WHERE e.organizer_profile_id=? AND p.event_id=? ORDER BY p.created_at").all(organizerProfileId,eventId) : this.db.prepare("SELECT p.* FROM pending_attendance p JOIN prepared_events e ON e.event_id=p.event_id WHERE e.organizer_profile_id=? ORDER BY p.created_at").all(organizerProfileId) : eventId ? this.db.prepare("SELECT * FROM pending_attendance WHERE event_id=? ORDER BY created_at").all(eventId) : this.db.prepare("SELECT * FROM pending_attendance ORDER BY created_at").all(); return (rows as SqlRow[]).map((row) => this.mapPending(row)); }
  beginSync(limit: number, forceRetry = false,organizerProfileId="test-organizer") { const due = forceRetry ? "" : " AND (p.next_attempt_at IS NULL OR p.next_attempt_at <= datetime('now'))"; const rows = this.db.prepare(`SELECT p.local_attendance_uuid FROM pending_attendance p JOIN cached_sessions s ON s.session_id=p.session_id JOIN prepared_events e ON e.event_id=p.event_id WHERE e.organizer_profile_id=? AND p.sync_status IN ('PENDING_SYNC','RETRY') AND s.offline_lifecycle IN ('STARTED','END_PENDING','ENDED')${due} ORDER BY p.created_at LIMIT ?`).all(organizerProfileId,Math.max(1, Math.min(limit, 50))) as SqlRow[]; const now=new Date().toISOString(); const update=this.db.prepare("UPDATE pending_attendance SET sync_status='SYNCING',sync_attempts=sync_attempts+1,last_sync_attempt_at=?,updated_at=? WHERE local_attendance_uuid=? AND sync_status IN ('PENDING_SYNC','RETRY')"); this.transaction(()=>rows.forEach(r=>update.run(now,now,r.local_attendance_uuid as string))); return rows.map(r=>this.mapPending(this.db.prepare("SELECT * FROM pending_attendance WHERE local_attendance_uuid=? AND sync_status='SYNCING'").get(r.local_attendance_uuid as string) as SqlRow)).filter(Boolean); }
  confirmSync(uuid: string, serverId: string) { const row=this.db.prepare("SELECT event_id FROM pending_attendance WHERE local_attendance_uuid=?").get(uuid) as SqlRow|undefined; if(!row) return; this.transaction(()=>{ this.db.prepare("UPDATE pending_attendance SET sync_status='CONFIRMED',server_attendance_id=?,server_confirmed_at=?,updated_at=? WHERE local_attendance_uuid=?").run(serverId,new Date().toISOString(),new Date().toISOString(),uuid); this.db.prepare("DELETE FROM pending_attendance WHERE local_attendance_uuid=? AND sync_status='CONFIRMED'").run(uuid); this.db.prepare("UPDATE prepared_events SET last_successful_sync_at=? WHERE event_id=?").run(new Date().toISOString(),row.event_id as string); }); }
  failSync(uuid:string,status:"RETRY"|"CONFLICT",error:string){ const now=new Date(); const row=this.db.prepare("SELECT sync_attempts FROM pending_attendance WHERE local_attendance_uuid=?").get(uuid) as SqlRow|undefined; const attempts=Number(row?.sync_attempts ?? 0); const exhausted=status === "RETRY" && attempts >= 4; const delaySeconds=Math.min(8,2 ** Math.max(0, attempts - 1)); const next=status === "CONFLICT" ? null : exhausted ? "9999-12-31T23:59:59.999Z" : new Date(now.getTime()+delaySeconds*1000).toISOString(); this.db.prepare("UPDATE pending_attendance SET sync_status=?,last_sync_error=?,next_attempt_at=?,updated_at=? WHERE local_attendance_uuid=?").run(status,`${error.slice(0,260)}${exhausted?" Automatic retry limit reached; queued for manual retry.":""}`,next,now.toISOString(),uuid); }
  recoverInterruptedSync(organizerProfileId?:string){ return organizerProfileId
    ? this.db.prepare(`UPDATE pending_attendance SET sync_status='RETRY',next_attempt_at=NULL,last_sync_error='Synchronization was interrupted and will be retried.',updated_at=? WHERE sync_status='SYNCING' AND event_id IN (SELECT event_id FROM prepared_events WHERE organizer_profile_id=?)`).run(new Date().toISOString(),organizerProfileId).changes
    : this.db.prepare("UPDATE pending_attendance SET sync_status='RETRY',next_attempt_at=NULL,last_sync_error='Synchronization was interrupted and will be retried.',updated_at=? WHERE sync_status='SYNCING'").run(new Date().toISOString()).changes; }
  cleanupEvent(eventId:string,serverVerified:boolean,eventCompleted:boolean):CleanupResult { const unresolved=Number((this.db.prepare("SELECT COUNT(*) count FROM pending_attendance WHERE event_id=? AND sync_status<>'CONFIRMED'").get(eventId) as SqlRow).count); if(!eventCompleted) return {cleaned:false,message:"Cleanup blocked - the event is not completed."}; if(unresolved) return {cleaned:false,message:`Cleanup blocked - ${unresolved} record${unresolved===1?"":"s"} still require synchronization.`}; if(!serverVerified) return {cleaned:false,message:"Cleanup blocked - Supabase verification is required."}; this.db.prepare("DELETE FROM prepared_events WHERE event_id=?").run(eventId); this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); return {cleaned:true,message:"Cleanup completed. Temporary event and biometric cache data were removed."}; }
}
