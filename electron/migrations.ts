export const localMigrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE prepared_events(
        event_id TEXT PRIMARY KEY, event_code TEXT NOT NULL, title TEXT NOT NULL,
        event_status TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
        cache_version INTEGER NOT NULL, prepared_at TEXT NOT NULL,
        preparation_status TEXT NOT NULL CHECK(preparation_status IN ('PREPARING','READY','INCOMPLETE')),
        last_successful_sync_at TEXT
      );
      CREATE TABLE cached_sessions(
        session_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES prepared_events(event_id) ON DELETE CASCADE,
        title TEXT NOT NULL, venue TEXT NOT NULL, session_status TEXT NOT NULL,
        starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, late_cutoff_at TEXT,
        attendance_window_start_at TEXT, attendance_window_end_at TEXT
      );
      CREATE INDEX cached_sessions_event_idx ON cached_sessions(event_id);
      CREATE TABLE cached_participants(
        event_id TEXT NOT NULL REFERENCES prepared_events(event_id) ON DELETE CASCADE,
        student_id TEXT NOT NULL, student_number TEXT NOT NULL, display_name TEXT NOT NULL,
        participant_status TEXT NOT NULL, qr_identifier TEXT,
        face_embeddings_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY(event_id, student_id)
      );
      CREATE UNIQUE INDEX cached_participants_qr_idx ON cached_participants(event_id, qr_identifier) WHERE qr_identifier IS NOT NULL;
      CREATE INDEX cached_participants_student_number_idx ON cached_participants(event_id, student_number);
      CREATE TABLE cached_attendance_state(
        session_id TEXT NOT NULL REFERENCES cached_sessions(session_id) ON DELETE CASCADE,
        student_id TEXT NOT NULL, attendance_status TEXT NOT NULL, time_in TEXT, time_out TEXT,
        PRIMARY KEY(session_id, student_id)
      );
      CREATE TABLE pending_attendance(
        local_attendance_uuid TEXT PRIMARY KEY, event_id TEXT NOT NULL, session_id TEXT NOT NULL,
        student_id TEXT NOT NULL, identification_method TEXT NOT NULL CHECK(identification_method IN ('qr','facial','manual')),
        checkout_identification_method TEXT, attendance_timestamp TEXT NOT NULL,
        attendance_status TEXT NOT NULL CHECK(attendance_status IN ('present','late')),
        time_in TEXT NOT NULL, time_out TEXT, device_id TEXT, remarks TEXT, late_reason TEXT,
        sync_status TEXT NOT NULL CHECK(sync_status IN ('PENDING_SYNC','SYNCING','CONFIRMED','CONFLICT','RETRY')),
        sync_attempts INTEGER NOT NULL DEFAULT 0, last_sync_attempt_at TEXT, last_sync_error TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, server_attendance_id TEXT, server_confirmed_at TEXT,
        UNIQUE(session_id, student_id)
      );
      CREATE INDEX pending_attendance_event_idx ON pending_attendance(event_id);
      CREATE INDEX pending_attendance_session_student_idx ON pending_attendance(session_id, student_id);
      CREATE INDEX pending_attendance_sync_idx ON pending_attendance(sync_status, updated_at);
    `
  },
  {
    // SQLite cannot extend the original CHECK constraint in place. Rebuild the
    // outbox transactionally so existing installs retain every queued record.
    version: 2,
    sql: `
      ALTER TABLE pending_attendance RENAME TO pending_attendance_v1;
      CREATE TABLE pending_attendance(
        local_attendance_uuid TEXT PRIMARY KEY, event_id TEXT NOT NULL, session_id TEXT NOT NULL,
        student_id TEXT NOT NULL, identification_method TEXT NOT NULL CHECK(identification_method IN ('qr','facial','manual')),
        checkout_identification_method TEXT, attendance_timestamp TEXT NOT NULL,
        attendance_status TEXT NOT NULL CHECK(attendance_status IN ('present','late')),
        time_in TEXT NOT NULL, time_out TEXT, device_id TEXT, remarks TEXT, late_reason TEXT,
        sync_status TEXT NOT NULL CHECK(sync_status IN ('PENDING_SYNC','SYNCING','CONFIRMED','CONFLICT','RETRY','FAILED')),
        sync_attempts INTEGER NOT NULL DEFAULT 0, last_sync_attempt_at TEXT, last_sync_error TEXT,
        next_attempt_at TEXT, lease_owner TEXT, lease_expires_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, server_attendance_id TEXT, server_confirmed_at TEXT,
        UNIQUE(session_id, student_id)
      );
      INSERT INTO pending_attendance(
        local_attendance_uuid,event_id,session_id,student_id,identification_method,checkout_identification_method,
        attendance_timestamp,attendance_status,time_in,time_out,device_id,remarks,late_reason,sync_status,
        sync_attempts,last_sync_attempt_at,last_sync_error,created_at,updated_at,server_attendance_id,server_confirmed_at
      ) SELECT
        local_attendance_uuid,event_id,session_id,student_id,identification_method,checkout_identification_method,
        attendance_timestamp,attendance_status,time_in,time_out,device_id,remarks,late_reason,sync_status,
        sync_attempts,last_sync_attempt_at,last_sync_error,created_at,updated_at,server_attendance_id,server_confirmed_at
      FROM pending_attendance_v1;
      DROP TABLE pending_attendance_v1;
      CREATE INDEX pending_attendance_event_idx ON pending_attendance(event_id);
      CREATE INDEX pending_attendance_session_student_idx ON pending_attendance(session_id, student_id);
      CREATE INDEX pending_attendance_sync_idx ON pending_attendance(sync_status, next_attempt_at, created_at);
      CREATE INDEX pending_attendance_lease_idx ON pending_attendance(lease_expires_at) WHERE sync_status='SYNCING';
    `
  }
] as const;

