export type SyncStatus = "PENDING_SYNC" | "SYNCING" | "CONFIRMED" | "CONFLICT" | "RETRY" | "FAILED";

export type OfflineIdentificationMethod = "qr" | "facial" | "manual";

export type PreparedEventParticipant = {
  studentId: string;
  studentNumber: string;
  displayName: string;
  participantStatus: string;
  qrIdentifier?: string;
  faceEmbeddings: number[][];
};

export type OfflineFaceMatch = Omit<PreparedEventParticipant, "faceEmbeddings">;

export type PreparedEventSession = {
  id: string;
  eventId: string;
  title: string;
  venue: string;
  status: string;
  startsAt: string;
  endsAt: string;
  lateCutoffAt?: string;
  attendanceWindowStartAt?: string;
  attendanceWindowEndAt?: string;
};

export type ExistingAttendanceState = {
  sessionId: string;
  studentId: string;
  attendanceStatus: string;
  timeIn?: string;
  timeOut?: string;
};

export type PreparedEventPackage = {
  cacheVersion: number;
  event: { id: string; code: string; title: string; status: string; startsAt: string; endsAt: string };
  sessions: PreparedEventSession[];
  participants: PreparedEventParticipant[];
  attendance: ExistingAttendanceState[];
  preparedAt: string;
};

export type LocalAttendanceInput = {
  eventId: string;
  sessionId: string;
  studentId: string;
  identificationMethod: OfflineIdentificationMethod;
  attendanceTimestamp: string;
  attendanceStatus?: "present" | "late";
  deviceId?: string;
  remarks?: string;
  lateReason?: string;
};

export type PreparedSessionActivationInput = {
  eventId: string;
  sessionId: string;
  venue: string;
  startsAt: string;
  endsAt?: string;
  lateCutoffAt?: string;
  attendanceWindowStartAt: string;
  attendanceWindowEndAt?: string;
};

export type PendingAttendanceRecord = LocalAttendanceInput & {
  localAttendanceUuid: string;
  attendanceStatus: "present" | "late";
  timeIn: string;
  timeOut?: string;
  checkoutIdentificationMethod?: OfflineIdentificationMethod;
  syncStatus: SyncStatus;
  syncAttempts: number;
  lastSyncAttemptAt?: string;
  lastSyncError?: string;
  nextAttemptAt?: string;
  leaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
  serverAttendanceId?: string;
  serverConfirmedAt?: string;
};

export type OfflineStatus = {
  runtimeAvailable: boolean;
  connectivity: "online" | "offline" | "checking";
  packageStatus: "NOT_PREPARED" | "PREPARING" | "READY" | "INCOMPLETE";
  preparedAt?: string;
  pendingCount: number;
  retryCount: number;
  conflictCount: number;
  failedCount: number;
  syncingCount: number;
  nextAttemptAt?: string;
  lastSuccessfulSyncAt?: string;
};

export type LocalAttendanceResult = {
  record: PendingAttendanceRecord;
  action: "checked_in" | "checked_out" | "already_recorded";
  safeMessage: string;
};

export type SyncClaim = { owner: string; records: PendingAttendanceRecord[] };
export type SyncFailureDisposition = "RETRY" | "CONFLICT" | "FAILED";

export type CleanupResult = { cleaned: boolean; message: string };
export type ScannerStation = { id: string; name: string; joinedAt: string; lastSeenAt: string; lastScanAt?: string };
export type AttendanceCapturePhase = "time_in" | "time_out";
export type ScannerCoordinatorStatus = { active: boolean; eventId?: string; sessionId?: string; port?: number; addresses: string[]; joinUrl?: string; stations: ScannerStation[]; capturePhase?: AttendanceCapturePhase; certificateFingerprint?: string; certificateExpiresAt?: string };
export type ScannerCertificateStatus = { configured: boolean; fingerprint?: string; expiresAt?: string };
export type OfflineRuntimeConfig = { autoSyncEnabled: boolean; forceLocalAttendance: boolean };

export interface PLPassDesktopApi {
  getOfflineRuntimeConfig(): Promise<OfflineRuntimeConfig>;
  prepareEvent(input: PreparedEventPackage): Promise<OfflineStatus>;
  activatePreparedSession(input: PreparedSessionActivationInput): Promise<OfflineStatus>;
  getStatus(eventId: string): Promise<OfflineStatus>;
  getPreparedEvent(eventId: string): Promise<PreparedEventPackage | null>;
  getPreparedEventBySession(sessionId: string): Promise<PreparedEventPackage | null>;
  identifyQr(eventId: string, qrIdentifier: string): Promise<PreparedEventParticipant | null>;
  identifyManual(eventId: string, studentIdentifier: string): Promise<PreparedEventParticipant | null>;
  identifyOfflineFace(eventId: string, capture: number[]): Promise<OfflineFaceMatch | null>;
  recordAttendance(input: LocalAttendanceInput): Promise<LocalAttendanceResult>;
  listPending(eventId?: string): Promise<PendingAttendanceRecord[]>;
  beginSync(limit: number): Promise<SyncClaim | null>;
  finishSync(owner: string): Promise<void>;
  confirmSync(localAttendanceUuid: string, serverAttendanceId: string, owner: string): Promise<void>;
  failSync(localAttendanceUuid: string, status: SyncFailureDisposition, safeError: string, owner: string): Promise<void>;
  recoverInterruptedSync(): Promise<number>;
  cleanupEvent(eventId: string, serverVerified: boolean, eventCompleted: boolean): Promise<CleanupResult>;
  startScannerStations(eventId: string, sessionId: string, capturePhase?: AttendanceCapturePhase): Promise<ScannerCoordinatorStatus>;
  stopScannerStations(): Promise<void>;
  getScannerStations(): Promise<ScannerCoordinatorStatus>;
  getScannerCertificateStatus(): Promise<ScannerCertificateStatus>;
  replaceScannerCertificate(): Promise<ScannerCertificateStatus>;
  removeScannerStation(stationId: string): Promise<void>;
  setScannerCapturePhase(phase: AttendanceCapturePhase): Promise<ScannerCoordinatorStatus>;
  onScannerStatus(listener: (status: ScannerCoordinatorStatus) => void): () => void;
}

declare global {
  interface Window {
    plpassDesktop?: PLPassDesktopApi;
  }
}
