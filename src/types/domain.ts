import type {
  AttendanceMode,
  AttendanceSessionType,
  AttendanceStatus,
  CorrectionRequestStatus,
  EventStatus,
  FacultyEmploymentStatus,
  MlPredictionType,
  NfcCredentialStatus,
  NotificationStatus,
  ReportStatus,
  RiskLevel,
  SessionStatus,
  StudentStatus,
  UserRole,
  VerificationMethod
} from "@/types/enums";

export type ISODateString = string;
export type ID = string;

export type User = {
  id: ID;
  role: UserRole;
  email: string;
  displayName: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: ISODateString;
};

export type Student = {
  id: ID;
  userId: ID;
  studentNumber: string;
  status: StudentStatus;
  programId: ID;
  departmentId: ID;
  yearLevel: number;
  section: string;
  createdAt: ISODateString;
};

export type FacultyProfile = {
  id: ID;
  userId: ID;
  employeeNumber: string;
  departmentId: ID;
  employmentStatus: FacultyEmploymentStatus;
  title: string;
};

export type OrganizerProfile = {
  id: ID;
  userId: ID;
  organizationName: string;
  departmentId?: ID;
};

export type AdminProfile = {
  id: ID;
  userId: ID;
  officeName: string;
};

export type Department = {
  id: ID;
  code: string;
  name: string;
};

export type Program = {
  id: ID;
  departmentId: ID;
  code: string;
  name: string;
};

export type Semester = {
  id: ID;
  label: string;
  schoolYear: string;
  startsAt: ISODateString;
  endsAt: ISODateString;
  isActive: boolean;
};

export type Class = {
  id: ID;
  facultyId: ID;
  programId: ID;
  departmentId: ID;
  semesterId: ID;
  subjectCode: string;
  subjectTitle: string;
  section: string;
  yearLevel: number;
  scheduleLabel: string;
  rosterId: ID;
};

export type ClassRoster = {
  id: ID;
  classId: ID;
  studentId: ID;
  enrolledAt: ISODateString;
};

export type Event = {
  id: ID;
  organizerId: ID;
  departmentId?: ID;
  title: string;
  venue: string;
  startsAt: ISODateString;
  endsAt: ISODateString;
  status: EventStatus;
};

export type EventParticipant = {
  id: ID;
  eventId: ID;
  studentId: ID;
  registeredAt: ISODateString;
};

export type AttendanceSession = {
  id: ID;
  type: AttendanceSessionType;
  classId?: ID;
  eventId?: ID;
  title: string;
  mode: AttendanceMode;
  status: SessionStatus;
  startsAt: ISODateString;
  endsAt?: ISODateString;
  createdByUserId: ID;
};

export type AttendanceRecord = {
  id: ID;
  sessionId: ID;
  studentId: ID;
  status: AttendanceStatus;
  verificationMethod: VerificationMethod;
  recordedAt: ISODateString;
  recordedByUserId?: ID;
  note?: string;
};

export type NfcCredential = {
  id: ID;
  studentId: ID;
  nfcUid: string;
  status: NfcCredentialStatus;
  issuedAt: ISODateString;
  replacedByCredentialId?: ID;
};

export type NfcReader = {
  id: ID;
  label: string;
  serialNumber: string;
  assignedToUserId?: ID;
  lastSeenAt?: ISODateString;
  isTrusted: boolean;
};

export type NfcTapAttempt = {
  id: ID;
  sessionId: ID;
  readerId: ID;
  nfcUid: string;
  studentId?: ID;
  accepted: boolean;
  attemptedAt: ISODateString;
  message: string;
};

export type CorrectionRequest = {
  id: ID;
  studentId: ID;
  attendanceRecordId: ID;
  classId?: ID;
  eventId?: ID;
  requestedStatus: AttendanceStatus;
  reason: string;
  status: CorrectionRequestStatus;
  requestedAt: ISODateString;
  reviewedByUserId?: ID;
  reviewedAt?: ISODateString;
};

export type Report = {
  id: ID;
  title: string;
  scope: string;
  status: ReportStatus;
  requestedByUserId: ID;
  generatedAt?: ISODateString;
};

export type Notification = {
  id: ID;
  userId: ID;
  title: string;
  body: string;
  status: NotificationStatus;
  createdAt: ISODateString;
};

export type AuditLog = {
  id: ID;
  actorUserId: ID;
  action: string;
  targetType: string;
  targetId: ID;
  timestamp: ISODateString;
  metadata: Record<string, string | number | boolean>;
};

export type MlPrediction = {
  id: ID;
  type: MlPredictionType;
  riskLevel: RiskLevel;
  studentId?: ID;
  classId?: ID;
  eventId?: ID;
  patternLabel: string;
  score: number;
  generatedAt: ISODateString;
  explanation: string;
};

export type AuthSession = {
  userId: ID;
  role: UserRole;
  displayName: string;
  isAuthenticated: boolean;
};
