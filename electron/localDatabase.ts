import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { localMigrations } from "./migrations.js";
import type { CleanupResult, LocalAttendanceInput, LocalAttendanceResult, OfflineStatus, PendingAttendanceRecord, PreparedEventPackage, PreparedEventParticipant } from "../src/features/offline/types.js";

type SqlRow = Record<string, unknown>;

function value(row: SqlRow, key: string) { return row[key] == null ? undefined : String(row[key]); }

export class LocalAttendanceDatabase {
  constructor(private readonly db: DatabaseSync) {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;");
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    for (const migration of localMigrations) {
      const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(migration.version);
      if (!applied) this.transaction(() => { db.exec(migration.sql); db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(migration.version, new Date().toISOString()); });
    }
    this.recoverInterruptedSync();
  }

  private transaction<T>(operation:()=>T):T { this.db.exec("BEGIN IMMEDIATE"); try { const result=operation(); this.db.exec("COMMIT"); return result; } catch(error) { this.db.exec("ROLLBACK"); throw error; } }

  prepareEvent(pkg: PreparedEventPackage): OfflineStatus {
    if (!pkg.event.id || !pkg.sessions.length || !pkg.participants.length || pkg.participants.some((p) => !p.studentId || !p.studentNumber)) {
      throw new Error("Event package is incomplete and was not marked ready.");
    }
    this.transaction(() => {
      this.db.prepare(`INSERT INTO prepared_events(event_id,event_code,title,event_status,starts_at,ends_at,cache_version,prepared_at,preparation_status)
        VALUES(@id,@code,@title,@status,@startsAt,@endsAt,@cacheVersion,@preparedAt,'PREPARING')
        ON CONFLICT(event_id) DO UPDATE SET event_code=excluded.event_code,title=excluded.title,event_status=excluded.event_status,
        starts_at=excluded.starts_at,ends_at=excluded.ends_at,cache_version=excluded.cache_version,prepared_at=excluded.prepared_at,preparation_status='PREPARING'`).run({ ...pkg.event, cacheVersion: pkg.cacheVersion, preparedAt: pkg.preparedAt });
      this.db.prepare("DELETE FROM cached_sessions WHERE event_id = ?").run(pkg.event.id);
      this.db.prepare("DELETE FROM cached_participants WHERE event_id = ?").run(pkg.event.id);
      const session = this.db.prepare(`INSERT INTO cached_sessions VALUES(@id,@eventId,@title,@venue,@status,@startsAt,@endsAt,@lateCutoffAt,@attendanceWindowStartAt,@attendanceWindowEndAt)`);
      pkg.sessions.forEach((item) => session.run({ ...item, lateCutoffAt: item.lateCutoffAt ?? null, attendanceWindowStartAt: item.attendanceWindowStartAt ?? null, attendanceWindowEndAt: item.attendanceWindowEndAt ?? null }));
      const participant = this.db.prepare(`INSERT INTO cached_participants VALUES(@eventId,@studentId,@studentNumber,@displayName,@participantStatus,@qrIdentifier,@faceEmbeddings)`);
      pkg.participants.forEach((item) => participant.run({ eventId: pkg.event.id, ...item, qrIdentifier: item.qrIdentifier ?? null, faceEmbeddings: JSON.stringify(item.faceEmbeddings) }));
      const attendance = this.db.prepare(`INSERT INTO cached_attendance_state VALUES(@sessionId,@studentId,@attendanceStatus,@timeIn,@timeOut)`);
      pkg.attendance.forEach((item) => attendance.run({ ...item, timeIn: item.timeIn ?? null, timeOut: item.timeOut ?? null }));
      this.db.prepare("UPDATE prepared_events SET preparation_status='READY' WHERE event_id=?").run(pkg.event.id);
    });
    return this.getStatus(pkg.event.id);
  }

  getStatus(eventId: string): OfflineStatus {
    const event = this.db.prepare("SELECT preparation_status, prepared_at, last_successful_sync_at FROM prepared_events WHERE event_id=?").get(eventId) as SqlRow | undefined;
    const counts = this.db.prepare(`SELECT COUNT(*) total, SUM(sync_status='RETRY') retries, SUM(sync_status='CONFLICT') conflicts, SUM(sync_status='SYNCING') syncing FROM pending_attendance WHERE event_id=?`).get(eventId) as SqlRow;
    return { runtimeAvailable: true, connectivity: "checking", packageStatus: (value(event ?? {}, "preparation_status") as OfflineStatus["packageStatus"]) ?? "NOT_PREPARED", preparedAt: value(event ?? {}, "prepared_at"), pendingCount: Number(counts.total ?? 0), retryCount: Number(counts.retries ?? 0), conflictCount: Number(counts.conflicts ?? 0), syncingCount: Number(counts.syncing ?? 0), lastSuccessfulSyncAt: value(event ?? {}, "last_successful_sync_at") };
  }
  getPreparedEvent(eventId:string):PreparedEventPackage|null {
    const e=this.db.prepare("SELECT * FROM prepared_events WHERE event_id=? AND preparation_status='READY'").get(eventId) as SqlRow|undefined; if(!e)return null;
    const sessions=(this.db.prepare("SELECT * FROM cached_sessions WHERE event_id=?").all(eventId) as SqlRow[]).map(s=>({id:String(s.session_id),eventId:String(s.event_id),title:String(s.title),venue:String(s.venue),status:String(s.session_status),startsAt:String(s.starts_at),endsAt:String(s.ends_at),lateCutoffAt:value(s,"late_cutoff_at"),attendanceWindowStartAt:value(s,"attendance_window_start_at"),attendanceWindowEndAt:value(s,"attendance_window_end_at")}));
    const participants=(this.db.prepare("SELECT * FROM cached_participants WHERE event_id=?").all(eventId) as SqlRow[]).map(p=>this.participant(p)).filter((p):p is PreparedEventParticipant=>p!==null);
    const attendance=(this.db.prepare("SELECT * FROM cached_attendance_state WHERE session_id IN (SELECT session_id FROM cached_sessions WHERE event_id=?)").all(eventId) as SqlRow[]).map(a=>({sessionId:String(a.session_id),studentId:String(a.student_id),attendanceStatus:String(a.attendance_status),timeIn:value(a,"time_in"),timeOut:value(a,"time_out")}));
    return {cacheVersion:Number(e.cache_version),preparedAt:String(e.prepared_at),event:{id:String(e.event_id),code:String(e.event_code),title:String(e.title),status:String(e.event_status),startsAt:String(e.starts_at),endsAt:String(e.ends_at)},sessions,participants,attendance};
  }
  getPreparedEventBySession(sessionId:string){ const row=this.db.prepare("SELECT event_id FROM cached_sessions WHERE session_id=?").get(sessionId) as SqlRow|undefined; return row?this.getPreparedEvent(String(row.event_id)):null; }

  private participant(row: SqlRow | undefined): PreparedEventParticipant | null {
    if (!row) return null;
    return { studentId: String(row.student_id), studentNumber: String(row.student_number), displayName: String(row.display_name), participantStatus: String(row.participant_status), qrIdentifier: value(row, "qr_identifier"), faceEmbeddings: JSON.parse(String(row.face_embeddings_json ?? "[]")) as number[][] };
  }
  identifyQr(eventId: string, qr: string) { return this.participant(this.db.prepare("SELECT * FROM cached_participants WHERE event_id=? AND qr_identifier=? AND participant_status<>'removed'").get(eventId, qr) as SqlRow | undefined); }
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
      if (requireExistingCheckIn) throw new Error("No Time In is recorded for this student.");
      if (existingServer?.time_in) throw new Error("This centrally recorded check-in cannot be updated offline. Reconnect before check-out.");
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

  private mapPending(row: SqlRow): PendingAttendanceRecord { return { localAttendanceUuid:String(row.local_attendance_uuid),eventId:String(row.event_id),sessionId:String(row.session_id),studentId:String(row.student_id),identificationMethod:String(row.identification_method) as PendingAttendanceRecord["identificationMethod"],checkoutIdentificationMethod:value(row,"checkout_identification_method") as PendingAttendanceRecord["checkoutIdentificationMethod"],attendanceTimestamp:String(row.attendance_timestamp),attendanceStatus:String(row.attendance_status) as "present"|"late",timeIn:String(row.time_in),timeOut:value(row,"time_out"),deviceId:value(row,"device_id"),remarks:value(row,"remarks"),lateReason:value(row,"late_reason"),syncStatus:String(row.sync_status) as PendingAttendanceRecord["syncStatus"],syncAttempts:Number(row.sync_attempts),lastSyncAttemptAt:value(row,"last_sync_attempt_at"),lastSyncError:value(row,"last_sync_error"),createdAt:String(row.created_at),updatedAt:String(row.updated_at),serverAttendanceId:value(row,"server_attendance_id"),serverConfirmedAt:value(row,"server_confirmed_at") }; }
  listPending(eventId?: string) { const rows = eventId ? this.db.prepare("SELECT * FROM pending_attendance WHERE event_id=? ORDER BY created_at").all(eventId) : this.db.prepare("SELECT * FROM pending_attendance ORDER BY created_at").all(); return (rows as SqlRow[]).map((row) => this.mapPending(row)); }
  beginSync(limit: number) { const rows = this.db.prepare("SELECT local_attendance_uuid FROM pending_attendance WHERE sync_status IN ('PENDING_SYNC','RETRY') ORDER BY created_at LIMIT ?").all(Math.max(1, Math.min(limit, 50))) as SqlRow[]; const now=new Date().toISOString(); const update=this.db.prepare("UPDATE pending_attendance SET sync_status='SYNCING',sync_attempts=sync_attempts+1,last_sync_attempt_at=?,updated_at=? WHERE local_attendance_uuid=?"); this.transaction(()=>rows.forEach(r=>update.run(now,now,r.local_attendance_uuid as string))); return rows.map(r=>this.mapPending(this.db.prepare("SELECT * FROM pending_attendance WHERE local_attendance_uuid=?").get(r.local_attendance_uuid as string) as SqlRow)); }
  confirmSync(uuid: string, serverId: string) { const row=this.db.prepare("SELECT event_id FROM pending_attendance WHERE local_attendance_uuid=?").get(uuid) as SqlRow|undefined; if(!row) return; this.transaction(()=>{ this.db.prepare("UPDATE pending_attendance SET sync_status='CONFIRMED',server_attendance_id=?,server_confirmed_at=?,updated_at=? WHERE local_attendance_uuid=?").run(serverId,new Date().toISOString(),new Date().toISOString(),uuid); this.db.prepare("DELETE FROM pending_attendance WHERE local_attendance_uuid=? AND sync_status='CONFIRMED'").run(uuid); this.db.prepare("UPDATE prepared_events SET last_successful_sync_at=? WHERE event_id=?").run(new Date().toISOString(),row.event_id as string); }); }
  failSync(uuid:string,status:"RETRY"|"CONFLICT",error:string){ this.db.prepare("UPDATE pending_attendance SET sync_status=?,last_sync_error=?,updated_at=? WHERE local_attendance_uuid=?").run(status,error.slice(0,300),new Date().toISOString(),uuid); }
  recoverInterruptedSync(){ return this.db.prepare("UPDATE pending_attendance SET sync_status='RETRY',last_sync_error='Synchronization was interrupted and will be retried.',updated_at=? WHERE sync_status='SYNCING'").run(new Date().toISOString()).changes; }
  cleanupEvent(eventId:string,serverVerified:boolean,eventCompleted:boolean):CleanupResult { const unresolved=Number((this.db.prepare("SELECT COUNT(*) count FROM pending_attendance WHERE event_id=? AND sync_status<>'CONFIRMED'").get(eventId) as SqlRow).count); if(!eventCompleted) return {cleaned:false,message:"Cleanup blocked - the event is not completed."}; if(unresolved) return {cleaned:false,message:`Cleanup blocked - ${unresolved} record${unresolved===1?"":"s"} still require synchronization.`}; if(!serverVerified) return {cleaned:false,message:"Cleanup blocked - Supabase verification is required."}; this.db.prepare("DELETE FROM prepared_events WHERE event_id=?").run(eventId); this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); return {cleaned:true,message:"Cleanup completed. Temporary event and biometric cache data were removed."}; }
}
