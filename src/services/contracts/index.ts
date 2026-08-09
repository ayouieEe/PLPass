import type {
  AdminProfile,
  AttendanceRecord,
  AttendanceSession,
  AuditLog,
  AuthSession,
  Class,
  ClassRoster,
  CorrectionRequest,
  CredentialRequest,
  Department,
  Event,
  EventParticipant,
  FacultyProfile,
  MlPrediction,
  AttendanceAttempt,
  Notification,
  OrganizerProfile,
  Program,
  Report,
  Semester,
  Student,
  StudentCredentialStatus,
  SystemSettings,
  User,
  DevelopmentAccount,
  EventFeedback,
  EventObjective
} from "@/types/domain";
import type { ListQuery, PaginatedResult } from "@/types/filters";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type { AttendanceMode, EventStatus, VerificationMethod } from "@/types/enums";

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
  priorityLevel: "Time-Sensitive" | "Business-Critical" | "Flexible";
  impactScore?: number | null;
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
  method: Extract<VerificationMethod, "qr" | "facial">;
  occurredAt?: string;
};

export type ManualAttendanceInput = {
  sessionId: string;
  studentId: string;
  reason: string;
  remarks: string;
  statusOverride?: "present" | "late";
  lateReason?: "Traffic / Commute" | "Class or Academic Conflict" | "Personal / Health" | "Weather / Force Majeure" | "Other";
  occurredAt?: string;
  allowManualJoin?: boolean;
};

export type SubmitLateReasonInput = {
  attendanceRecordId: string;
  reason: string;
};

export type CreateCredentialRequestInput = Pick<
  CredentialRequest,
  "studentId" | "credentialType" | "requestType" | "reason"
>;

export type AttendanceSubmissionResultStatus =
  | "Present"
  | "Late"
  | "Already Recorded"
  | "Invalid Credential"
  | "Blocked Credential"
  | "Student Not Enrolled"
  | "No Active Session"
  | "Outside Attendance Window";

export type AttendanceSubmissionResult = {
  resultStatus: AttendanceSubmissionResultStatus;
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

export type SubmitEventFeedbackInput = {
  eventId: string;
  studentId: string;
  attendanceRecordId: string;
  comment?: string;
  ratings: Array<{
    objectiveId: string;
    rating: number;
  }>;
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
  completeEvent(eventId: string, context?: RepositoryContext): Promise<Event>;
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
  recordCredentialAttendance(input: AttendanceScanInput, context?: RepositoryContext): Promise<AttendanceSubmissionResult>;
  recordManualAttendance(input: ManualAttendanceInput, context?: RepositoryContext): Promise<AttendanceSubmissionResult>;
  submitLateReason(input: SubmitLateReasonInput, context?: RepositoryContext): Promise<AttendanceRecord>;
}

export interface AttendanceAttemptRepository {
  listAttendanceAttempts(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<AttendanceAttempt>>;
}

export interface CorrectionRequestRepository {
  listCorrectionRequests(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<CorrectionRequest>>;
  createCorrectionRequest(input: CreateCorrectionRequestInput, context?: RepositoryContext): Promise<CorrectionRequest>;
  reviewCorrectionRequest(input: ReviewCorrectionRequestInput, context?: RepositoryContext): Promise<CorrectionRequest>;
}

export interface CredentialRequestRepository {
  listCredentialRequests(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<CredentialRequest>>;
  createCredentialRequest(input: CreateCredentialRequestInput, context?: RepositoryContext): Promise<CredentialRequest>;
}

export interface StudentCredentialRepository {
  getStudentCredentialStatus(studentId: string, context?: RepositoryContext): Promise<StudentCredentialStatus>;
}

export interface EventFeedbackRepository {
  listEventObjectives(eventId: string, context?: RepositoryContext): Promise<EventObjective[]>;
  listStudentFeedback(studentId: string, context?: RepositoryContext): Promise<EventFeedback[]>;
  submitEventFeedback(input: SubmitEventFeedbackInput, context?: RepositoryContext): Promise<EventFeedback>;
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
  attendanceAttempts: AttendanceAttemptRepository;
  correctionRequests: CorrectionRequestRepository;
  credentialRequests: CredentialRequestRepository;
  studentCredentials: StudentCredentialRepository;
  eventFeedback: EventFeedbackRepository;
  reports: ReportRepository;
  notifications: NotificationRepository;
  auditLogs: AuditLogRepository;
  analyticsMl: AnalyticsMlRepository;
  systemSettings: SystemSettingsRepository;
};