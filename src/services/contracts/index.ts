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
  NfcReader,
  NfcTapAttempt,
  Notification,
  OrganizerProfile,
  Program,
  Report,
  Semester,
  Student,
  User
} from "@/types/domain";
import type { ListQuery, PaginatedResult } from "@/types/filters";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";

export type CreateCorrectionRequestInput = Pick<
  CorrectionRequest,
  "studentId" | "attendanceRecordId" | "classId" | "eventId" | "requestedStatus" | "reason"
>;

export interface AuthenticationRepository {
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
}

export interface EventManagementRepository {
  listEvents(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Event>>;
  getEventById(eventId: string, context?: RepositoryContext): Promise<Event>;
  listEventParticipants(eventId: string, query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<EventParticipant>>;
}

export interface AttendanceSessionRepository {
  listAttendanceSessions(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<AttendanceSession>>;
  getAttendanceSessionById(sessionId: string, context?: RepositoryContext): Promise<AttendanceSession>;
}

export interface AttendanceRecordRepository {
  listAttendanceRecords(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<AttendanceRecord>>;
  getAttendanceRecordById(recordId: string, context?: RepositoryContext): Promise<AttendanceRecord>;
}

export interface NfcCredentialRepository {
  listNfcCredentials(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<NfcCredential>>;
  getCredentialForStudent(studentId: string, context?: RepositoryContext): Promise<NfcCredential | null>;
}

export interface NfcReaderRepository {
  listNfcReaders(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<NfcReader>>;
  listNfcTapAttempts(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<NfcTapAttempt>>;
}

export interface CorrectionRequestRepository {
  listCorrectionRequests(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<CorrectionRequest>>;
  createCorrectionRequest(input: CreateCorrectionRequestInput, context?: RepositoryContext): Promise<CorrectionRequest>;
}

export interface ReportRepository {
  listReports(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Report>>;
}

export interface NotificationRepository {
  listNotifications(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<Notification>>;
}

export interface AuditLogRepository {
  listAuditLogs(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<AuditLog>>;
}

export interface AnalyticsMlRepository {
  listMlPredictions(query?: ListQuery, context?: RepositoryContext): Promise<PaginatedResult<MlPrediction>>;
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
  nfcReaders: NfcReaderRepository;
  correctionRequests: CorrectionRequestRepository;
  reports: ReportRepository;
  notifications: NotificationRepository;
  auditLogs: AuditLogRepository;
  analyticsMl: AnalyticsMlRepository;
};
