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
    version: 2,
    sql: `
      ALTER TABLE pending_attendance ADD COLUMN next_attempt_at TEXT;
      CREATE INDEX pending_attendance_due_sync_idx ON pending_attendance(sync_status, next_attempt_at, created_at);
    `
  },
  {
    version: 3,
    sql: `
      ALTER TABLE prepared_events ADD COLUMN organizer_profile_id TEXT;
      ALTER TABLE prepared_events ADD COLUMN prepared_manila_date TEXT;
      ALTER TABLE cached_sessions ADD COLUMN offline_lifecycle TEXT NOT NULL DEFAULT 'NOT_STARTED';
      ALTER TABLE cached_sessions ADD COLUMN offline_started_at TEXT;
      ALTER TABLE cached_sessions ADD COLUMN offline_ended_at TEXT;
      ALTER TABLE cached_sessions ADD COLUMN offline_end_reason TEXT;
      CREATE INDEX prepared_events_owner_day_idx ON prepared_events(organizer_profile_id, prepared_manila_date, preparation_status);
    `
  },
  {
    // Version 3 was shipped in an earlier desktop build before all of its
    // columns were present. Keep this repair migration additive so existing
    // databases upgrade safely instead of trusting the old version marker.
    version: 4,
    sql: `CREATE INDEX IF NOT EXISTS prepared_events_owner_day_idx ON prepared_events(organizer_profile_id, prepared_manila_date, preparation_status);`
  },
  {
    version: 5,
    sql: `
      ALTER TABLE cached_sessions ADD COLUMN capture_phase TEXT NOT NULL DEFAULT 'time_in' CHECK(capture_phase IN ('time_in','time_out'));
      CREATE TABLE pending_walkin_scans(
        local_scan_uuid TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        identification_method TEXT NOT NULL CHECK(identification_method IN ('qr','manual')),
        student_number TEXT NOT NULL,
        student_number_hash TEXT NOT NULL,
        time_in TEXT NOT NULL,
        time_out TEXT,
        sync_status TEXT NOT NULL DEFAULT 'PENDING_SYNC' CHECK(sync_status IN ('PENDING_SYNC','SYNCING','RETRY','CONFLICT','CONFIRMED')),
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        last_sync_error TEXT,
        next_attempt_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(session_id, student_number_hash)
      );
      CREATE INDEX pending_walkin_scans_sync_idx ON pending_walkin_scans(sync_status, next_attempt_at, created_at);
      CREATE INDEX pending_walkin_scans_event_idx ON pending_walkin_scans(event_id, session_id);
    `
  }
  ,{
    version: 6,
    sql: `
      CREATE TABLE cached_student_directory(
        event_id TEXT NOT NULL REFERENCES prepared_events(event_id) ON DELETE CASCADE,
        student_id TEXT NOT NULL,
        student_number TEXT NOT NULL,
        display_name TEXT NOT NULL,
        qr_identifier TEXT,
        PRIMARY KEY(event_id, student_id)
      );
      CREATE INDEX cached_student_directory_number_idx ON cached_student_directory(event_id, student_number);
      CREATE UNIQUE INDEX cached_student_directory_qr_idx ON cached_student_directory(event_id, qr_identifier) WHERE qr_identifier IS NOT NULL;
    `
  },
  {
    version: 7,
    sql: `ALTER TABLE cached_sessions ADD COLUMN offline_start_reconciled_at TEXT;`
  },
  {
    version: 8,
    // Remove global directory data downloaded by older desktop builds.
    sql: `DELETE FROM cached_student_directory;`
  },
  {
    version: 9,
    // The event-participant cache replaced the old global directory. Drop the
    // obsolete table after all older rows have been cleared.
    sql: `DROP TABLE IF EXISTS cached_student_directory;`
  }
] as const;

