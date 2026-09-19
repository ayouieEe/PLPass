export type SyncStatus = "PENDING_SYNC" | "SYNCING" | "CONFIRMED" | "CONFLICT" | "RETRY";

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
  offlineLifecycle?: "NOT_STARTED" | "START_PENDING" | "STARTED" | "END_PENDING" | "ENDED" | "CONFLICT";
  offlineStartedAt?: string;
  offlineEndedAt?: string;
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
  organizerProfileId?: string;
  event: { id: string; code: string; title: string; status: string; startsAt: string; endsAt: string };
  sessions: PreparedEventSession[];
  participants: PreparedEventParticipant[];
  attendance: ExistingAttendanceState[];
  preparedAt: string;
};

export type OfflinePreparedEventSummary = Pick<PreparedEventPackage, "cacheVersion" | "organizerProfileId" | "preparedAt" | "event"> & {
  sessionId?: string;
  lifecycle: "NOT_STARTED" | "START_PENDING" | "STARTED" | "END_PENDING" | "ENDED" | "CONFLICT";
  localStartedAt?: string;
  localEndedAt?: string;
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
  syncingCount: number;
  lastSuccessfulSyncAt?: string;
  nextAttemptAt?: string;
};

export type LocalAttendanceResult = {
  record: PendingAttendanceRecord;
  action: "checked_in" | "checked_out" | "already_recorded";
  safeMessage: string;
};

export type CleanupResult = { cleaned: boolean; message: string };
export type ScannerStation = { id: string; name: string; joinedAt: string; lastSeenAt: string; lastScanAt?: string };
export type AttendanceCapturePhase = "time_in" | "time_out";
export type ScannerCoordinatorStatus = { active: boolean; eventId?: string; sessionId?: string; port?: number; addresses: string[]; joinUrl?: string; stations: ScannerStation[]; capturePhase?: AttendanceCapturePhase; certificateFingerprint?: string; certificateExpiresAt?: string };
export type ScannerCertificateStatus = { configured: boolean; fingerprint?: string; expiresAt?: string };

export interface PLPassDesktopApi {
  prepareEvent(input: PreparedEventPackage, organizerProfileId: string): Promise<OfflineStatus>;
  listPreparedEvents(organizerProfileId: string, manilaDate: string): Promise<OfflinePreparedEventSummary[]>;
  hasUnresolvedWork(organizerProfileId: string): Promise<boolean>;
  startOfflineSession(eventId: string, sessionId: string, organizerProfileId: string, manilaDate: string, startedAt: string): Promise<PreparedEventPackage>;
  endOfflineSession(eventId: string, sessionId: string, organizerProfileId: string, endedAt: string, reason?: string): Promise<PreparedEventPackage>;
  setOfflineLifecycleState(eventId: string, sessionId: string, state: "STARTED" | "ENDED" | "CONFLICT"): Promise<void>;
  getStatus(eventId: string, organizerProfileId: string): Promise<OfflineStatus>;
  getPreparedEvent(eventId: string, organizerProfileId: string): Promise<PreparedEventPackage | null>;
  getPreparedEventBySession(sessionId: string, organizerProfileId: string): Promise<PreparedEventPackage | null>;
  identifyQr(eventId: string, qrIdentifier: string): Promise<PreparedEventParticipant | null>;
  identifyManual(eventId: string, studentIdentifier: string): Promise<PreparedEventParticipant | null>;
  identifyOfflineFace(eventId: string, capture: number[]): Promise<OfflineFaceMatch | null>;
  recordAttendance(input: LocalAttendanceInput): Promise<LocalAttendanceResult>;
  recordScannerAttendance(input: LocalAttendanceInput, phase: AttendanceCapturePhase): Promise<LocalAttendanceResult>;
  listPending(eventId: string | undefined, organizerProfileId: string): Promise<PendingAttendanceRecord[]>;
  beginSync(limit: number, forceRetry: boolean | undefined, organizerProfileId: string): Promise<PendingAttendanceRecord[]>;
  confirmSync(localAttendanceUuid: string, serverAttendanceId: string): Promise<void>;
  failSync(localAttendanceUuid: string, status: "RETRY" | "CONFLICT", safeError: string): Promise<void>;
  recoverInterruptedSync(organizerProfileId: string): Promise<number>;
  cleanupEvent(eventId: string, serverVerified: boolean, eventCompleted: boolean): Promise<CleanupResult>;
  startScannerStations(eventId: string, sessionId: string, capturePhase: AttendanceCapturePhase, organizerProfileId: string): Promise<ScannerCoordinatorStatus>;
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
