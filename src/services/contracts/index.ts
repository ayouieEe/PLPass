import type {
  AdminProfile,
  AttendanceRecord,
  AttendanceSession,
  AuditLog,
  AuthSession,
  Class,
  ClassRoster,
  CorrectionRequest,
  Department,
  Event,
  EventParticipant,
  FacultyProfile,
  MlPrediction,
  NfcCredential,
  NfcCredentialRequest,
  NfcReader,
  NfcTapAttempt,
  Notification,
  OrganizerProfile,
  Program,
  Report,
  Semester,
  Student,
  SystemSettings,
  User,
  DevelopmentAccount
} from "@/types/domain";
import type { ListQuery, PaginatedResult } from "@/types/filters";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { AttendanceMode, EventStatus, NfcCredentialRequestType, NfcCredentialStatus, NfcReaderStatus, VerificationMethod } from "@/types/enums";

export type CreateCorrectionRequestInput = Pick<
  CorrectionRequest,
  "studentId" | "attendanceRecordId" | "classId" | "eventId" | "requestedStatus" | "reason"
>;

export type AddRosterStudentInput = {
  classId: string;
  studentId: string;
};

export type CreateClassSessionInput = {
  classId: string;
  title: string;
  room: string;
  date: string;
  startTime: string;
  expectedEndTime: string;
  mode: AttendanceMode;
};

export type CreateEventInput = {
  code: string;
  title: string;
  category: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  attendanceMode: "face-to-face" | "online";
  participantStudentIds: string[];
  description?: string;
  remarks?: string;
};

export type CreateEventSessionInput = {
  eventId: string;
  venue: string;
  date: string;
  startTime: string;
  expectedEndTime: string;
  attendanceMode: "face-to-face" | "online";
};

export type EndAttendanceSessionInput = {
  sessionId: string;
  reason: string;
};

export type AttendanceScanInput = {
  sessionId: string;
  credentialCode: string;
  method: Extract<VerificationMethod, "nfc" | "qr">;
  occurredAt?: string;
};

export type ManualAttendanceInput = {
  sessionId: string;
  studentId: string;
  reason: string;
  remarks: string;
  occurredAt?: string;
};

export type AttendanceSimulationResultStatus =
  | "Present"
  | "Late"
  | "Already Recorded"
  | "Invalid Sticker"
  | "Blocked Sticker"
  | "Student Not Enrolled"
  | "No Active Session"
  | "Outside Attendance Window";

export type AttendanceSimulationResult = {
  resultStatus: AttendanceSimulationResultStatus;
  studentDisplayName?: string;
  studentNumber?: string;
  attendanceStatus?: AttendanceRecord["status"];
  verificationMethod: VerificationMethod;
  recordedAt: string;
  safeMessage: string;
  attendanceRecord?: AttendanceRecord;
  summary: {
    present: number;
    late: number;
    absent: number;
    duplicateAttempts: number;
    failedAttempts: number;
  };
};

export type ReviewCorrectionRequestInput = {
  requestId: string;
  status: Extract<CorrectionRequest["status"], "approved" | "rejected">;
  reason?: string;
};

export type CreateNfcCredentialRequestInput = {
  studentId: string;
  credentialId?: string;
  type: NfcCredentialRequestType;
  reason: string;
};

export type UpdateSystemSettingsInput = Partial<
  Pick<
    SystemSettings,
    | "institutionName"
    | "currentSchoolYear"
    | "currentSemesterId"
    | "attendanceLateCutoffMinutes"
    | "defaultSessionDurationMinutes"
    | "readerPolicy"
    | "credentialStatusPolicy"
    | "notificationPreferencePlaceholder"
  >
>;

export interface AuthenticationRepository {
  listDevelopmentAccounts(context?: RepositoryContext): Promise<DevelopmentAccount[]>;
  getSession(context?: RepositoryContext): Promise<AuthSession>;
}

export interface UserManagementRepository {
  listUsers(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<User>>;
  getUserById(userId: string, context?: RepositoryContext): Promise<User>;
  listStudents(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Student>>;
  listFacultyProfiles(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<FacultyProfile>>;
  listOrganizerProfiles(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<OrganizerProfile>>;
  listAdminProfiles(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<AdminProfile>>;
}

export interface AcademicManagementRepository {
  listDepartments(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Department>>;
  listPrograms(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Program>>;
  listSemesters(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Semester>>;
  listClasses(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Class>>;
  getClassById(classId: string, context?: RepositoryContext): Promise<Class>;
}

export interface ClassRosterRepository {
  listClassRosters(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<ClassRoster>>;
  listStudentsForClass(classId: string, query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Student>>;
  addStudentToClass(input: AddRosterStudentInput, context?: RepositoryContext): Promise<ClassRoster>;
  removeStudentFromClass(classId: string, studentId: string, context?: RepositoryContext): Promise<void>;
}

export interface EventManagementRepository {
  listEvents(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Event>>;
  getEventById(eventId: string, context?: RepositoryContext): Promise<Event>;
  listEventParticipants(eventId: string, query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<EventParticipant>>;
  createEvent(input: CreateEventInput, context?: RepositoryContext): Promise<Event>;
  updateEventStatus(eventId: string, status: Extract<EventStatus, "approved" | "rejected">, reason?: string, context?: RepositoryContext): Promise<Event>;
}

export interface AttendanceSessionRepository {
  listAttendanceSessions(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<AttendanceSession>>;
  getAttendanceSessionById(sessionId: string, context?: RepositoryContext): Promise<AttendanceSession>;
  createClassSession(input: CreateClassSessionInput, context?: RepositoryContext): Promise<AttendanceSession>;
  createEventSession(input: CreateEventSessionInput, context?: RepositoryContext): Promise<AttendanceSession>;
  endAttendanceSession(input: EndAttendanceSessionInput, context?: RepositoryContext): Promise<AttendanceSession>;
}

export interface AttendanceRecordRepository {
  listAttendanceRecords(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<AttendanceRecord>>;
  getAttendanceRecordById(recordId: string, context?: RepositoryContext): Promise<AttendanceRecord>;
  simulateCredentialAttendance(input: AttendanceScanInput, context?: RepositoryContext): Promise<AttendanceSimulationResult>;
  simulateManualAttendance(input: ManualAttendanceInput, context?: RepositoryContext): Promise<AttendanceSimulationResult>;
}

export interface NfcCredentialRepository {
  listNfcCredentials(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<NfcCredential>>;
  getCredentialForStudent(studentId: string, context?: RepositoryContext): Promise<NfcCredential | null>;
  updateCredentialStatus(credentialId: string, status: NfcCredentialStatus, context?: RepositoryContext): Promise<NfcCredential>;
}

export interface NfcCredentialRequestRepository {
  listNfcCredentialRequests(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<NfcCredentialRequest>>;
  createNfcCredentialRequest(input: CreateNfcCredentialRequestInput, context?: RepositoryContext): Promise<NfcCredentialRequest>;
}

export interface NfcReaderRepository {
  listNfcReaders(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<NfcReader>>;
  listNfcTapAttempts(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<NfcTapAttempt>>;
  updateReaderStatus(readerId: string, status: NfcReaderStatus, context?: RepositoryContext): Promise<NfcReader>;
}

export interface CorrectionRequestRepository {
  listCorrectionRequests(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<CorrectionRequest>>;
  createCorrectionRequest(input: CreateCorrectionRequestInput, context?: RepositoryContext): Promise<CorrectionRequest>;
  reviewCorrectionRequest(input: ReviewCorrectionRequestInput, context?: RepositoryContext): Promise<CorrectionRequest>;
}

export interface ReportRepository {
  listReports(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Report>>;
}

export interface NotificationRepository {
  listNotifications(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Notification>>;
  markNotificationRead(notificationId: string, context?: RepositoryContext): Promise<Notification>;
  markAllNotificationsRead(context?: RepositoryContext): Promise<Notification[]>;
}

export interface AuditLogRepository {
  listAuditLogs(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<AuditLog>>;
}

export interface AnalyticsMlRepository {
  listMlPredictions(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<MlPrediction>>;
}

export interface SystemSettingsRepository {
  getSettings(context?: RepositoryContext): Promise<SystemSettings>;
  updateSettings(input: UpdateSystemSettingsInput, context?: RepositoryContext): Promise<SystemSettings>;
}

export type RepositoryRegistry = {
  authentication: AuthenticationRepository;
  userManagement: UserManagementRepository;
  academicManagement: AcademicManagementRepository;
  classRosters: ClassRosterRepository;
  eventManagement: EventManagementRepository;
  attendanceSessions: AttendanceSessionRepository;
  attendanceRecords: AttendanceRecordRepository;
  nfcCredentials: NfcCredentialRepository;
  nfcCredentialRequests: NfcCredentialRequestRepository;
  nfcReaders: NfcReaderRepository;
  correctionRequests: CorrectionRequestRepository;
  reports: ReportRepository;
  notifications: NotificationRepository;
  auditLogs: AuditLogRepository;
  analyticsMl: AnalyticsMlRepository;
  systemSettings: SystemSettingsRepository;
};
