import type {
  AttendanceMode,
  AttendanceSessionType,
  AttendanceStatus,
  CredentialRequestStatus,
  CorrectionRequestStatus,
  EventStatus,
  FacultyEmploymentStatus,
  MlPredictionType,
  NotificationStatus,
  NotificationSeverity,
  NotificationType,
  PriorityLevel,
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
  accountStatus?: "active" | "inactive" | "suspended";
  programId: ID;
  departmentId: ID;
  yearLevel: number;
  section: string;
  programCode?: string;
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  formattedName?: string;
  email?: string;
  createdAt: ISODateString;
};

export type FacultyProfile = {
  id: ID;
  userId: ID;
  employeeNumber: string;
  departmentId: ID;
  employmentStatus: FacultyEmploymentStatus;
  title: string;
  displayName?: string;
};

export type OrganizerProfile = {
  id: ID;
  userId: ID;
  employeeNumber: string;
  organizationName: string;
  collegeLogoPath?: string;
  departmentId?: ID;
  position: string;
  employmentStatus: FacultyEmploymentStatus;
};

export type AdminProfile = {
  id: ID;
  userId: ID;
  employeeNumber: string;
  departmentId: ID;
  officeName: string;
};

export type Department = {
  id: ID;
  code: string;
  name: string;
  isActive: boolean;
};

export type Program = {
  id: ID;
  departmentId: ID;
  code: string;
  name: string;
  isActive: boolean;
};

export type Section = {
  id: ID;
  programId: ID;
  name: string;
  yearLevel: number;
  academicYear: string;
  semester: string;
  isActive: boolean;
};

export type EventCategory = {
  id: ID;
  name: string;
  isActive: boolean;
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
  room: string;
  section: string;
  yearLevel: number;
  scheduleLabel: string;
  status: "active" | "archived";
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
  code: string;
  organizerId: ID;
  departmentId?: ID;
  category: string;
  institutionalCategory?: "Accreditation Linked" | "Academic or Training" | "Social or Recreational";
  participationStatus?: "Mandatory" | "Voluntary";
  targetGroup?: "University-wide" | "College or Department-wide" | "Single Class or Organization";
  title: string;
  description?: string;
  venue: string;
  startsAt: ISODateString;
  endsAt: ISODateString;
  status: EventStatus;
  priorityLevel: PriorityLevel;
  impactScore: number | null;
  urgencyPoints?: number;
  priorityScore?: number;
  priorityTier?: "High" | "Medium" | "Low";
  fixedPriority?: boolean;
  predictedTurnout: number | null;
  requestedBy?: string;
  collegeOffice?: string;
  numberOfPax?: number | null;
  visibility?: "assigned" | "public";
  approvalReason?: string;
  cancellationReason?: string;
};

export type EventParticipant = {
  id: ID;
  eventId: ID;
  studentId: ID;
  registeredAt: ISODateString;
};

export type EventObjective = {
  id: ID;
  eventId: ID;
  order: number;
  text: string;
  averageRating?: number | null;
  ratingCount?: number;
};

export type EventResource = {
  id: ID;
  eventId: ID;
  title: string;
  externalUrl?: string;
  storageBucket?: string;
  storageObjectPath?: string;
};

export type EventFeedbackRating = {
  id: ID;
  feedbackId: ID;
  objectiveId: ID;
  rating: number;
};

export type EventFeedback = {
  id: ID;
  eventId: ID;
  studentId: ID;
  attendanceRecordId: ID;
  comment?: string;
  sentimentLabel?: string | null;
  sentimentScore?: number | null;
  submittedAt: ISODateString;
  ratings?: EventFeedbackRating[];
};

export type LateReasonOption = {
  id: ID;
  code: string;
  defaultLabel: string;
  label: string;
  locale: string;
  sortOrder: number;
  isActive: boolean;
};

export type EventFeedbackTask = {
  id: ID;
  attendanceRecordId: ID;
  eventId: ID;
  studentId: ID;
  status: "pending" | "completed" | "expired";
  dueAt: ISODateString;
  completedAt?: ISODateString;
  expiredAt?: ISODateString;
  objectives: EventObjective[];
};

export type EventSummarySnapshot = {
  eventId: ID;
  positivePercentage: number;
  neutralPercentage: number;
  negativePercentage: number;
  totalFeedbackCount: number;
  updatedAt: ISODateString;
};

export type StudentDashboardTask = {
  id: ID;
  kind: "late_reason" | "feedback" | "correction";
  eventId?: ID;
  attendanceRecordId?: ID;
  title: string;
  code?: string;
  category?: string;
  status: string;
  startsAt?: ISODateString;
  dueAt?: ISODateString;
};

export type StudentDashboardSummary = {
  totalCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  attendedCount: number;
  attendanceRate: number;
  lateReasonTaskCount: number;
  feedbackTaskCount: number;
  rejectedCorrectionCount: number;
  pendingTaskCount: number;
  tasks: StudentDashboardTask[];
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
  lateCutoffAt?: ISODateString;
  attendanceWindowStartAt?: ISODateString;
  attendanceWindowEndAt?: ISODateString;
  createdByUserId: ID;
};

export type AttendanceRecord = {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  verificationMethod: VerificationMethod;
  checkoutVerificationMethod?: VerificationMethod;
  recordedAt: string;
  recordedByUserId?: string;
  note?: string;
  lateReasonCategory?: string;
  lateReasonOptionId?: string;
  timeIn?: string;
  checkedOutAt?: string;
  lateReason?: string;
};

export type AttendanceAttempt = {
  id: ID;
  sessionId: ID;
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
  reviewRemarks?: string;
};

export type CredentialRequest = {
  id: ID;
  studentId: ID;
  credentialType: "qr" | "facial";
  requestType: "replacement" | "re_enrollment" | "technical_issue";
  reason: string;
  status: CredentialRequestStatus;
  requestedAt: ISODateString;
  reviewedByUserId?: ID;
  reviewedAt?: ISODateString;
  reviewRemarks?: string;
};

export type QrCredential = {
  id: ID;
  studentId: ID;
  tokenHash: string;
  status: string;
  issuedAt: ISODateString;
  expiresAt?: ISODateString;
  revokedAt?: ISODateString;
  lastSuccessfulCheckInAt?: ISODateString;
};

export type FacialProfile = {
  id: ID;
  studentId: ID;
  status: string;
  enrollmentReference: string;
  enrolledAt: ISODateString;
  consentRecordedAt: ISODateString;
  lastVerifiedAt?: ISODateString;
};

export type StudentCredentialStatus = {
  studentId: ID;
  qrCredential?: QrCredential;
  facialProfile?: FacialProfile;
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
  type: NotificationType;
  title: string;
  body: string;
  status: NotificationStatus;
  createdAt: ISODateString;
  code?: string;
  severity?: NotificationSeverity;
  requiresAction?: boolean;
  relatedType?: string;
  referenceId?: ID;
  actionUrl?: string;
};

export type OrganizerBranding = {
  organizerId: ID;
  collegeName: string;
  collegeLogoPath?: string;
  collegeLogoUrl?: string;
  updatedAt?: ISODateString;
};

export type NotificationPreferences = {
  reminders: boolean;
  eventUpdates: boolean;
  reports: boolean;
  attendanceExceptions: boolean;
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

export type SystemSettings = {
  id: ID;
  institutionName: string;
  currentSchoolYear: string;
  currentSemesterId: ID;
  attendanceLateCutoffMinutes: number;
  defaultSessionDurationMinutes: number;
  readerPolicy: string;
  credentialStatusPolicy: string;
  notificationPreferencePlaceholder: string;
  eventApprovalRequired: boolean;
  participantInvitationMode: "email" | "in_app" | "both";
  noStartReminderMinutes: number;
  autoCancelAfterMinutes: number;
  requireCancellationReason: boolean;
  minimumTimeOutIntervalMinutes: number;
  allowAttendanceAfterScheduledEnd: boolean;
  automaticAbsentMarking: boolean;
  allowedVerificationMethods: Array<"qr" | "facial">;
  sensitiveActionReasonRequired: boolean;
  updatedAt: ISODateString;
};

export type InstitutionSettings = Pick<SystemSettings, "institutionName" | "currentSchoolYear" | "currentSemesterId">;
export type AcademicStructureSettings = InstitutionSettings;
export type EventSettings = Pick<SystemSettings, "eventApprovalRequired" | "participantInvitationMode" | "defaultSessionDurationMinutes">;
export type EventLifecycleSettings = Pick<SystemSettings, "noStartReminderMinutes" | "autoCancelAfterMinutes" | "requireCancellationReason">;
export type AttendanceSettings = Pick<SystemSettings, "attendanceLateCutoffMinutes" | "defaultSessionDurationMinutes" | "minimumTimeOutIntervalMinutes" | "allowAttendanceAfterScheduledEnd" | "automaticAbsentMarking">;
export type VerificationSettings = Pick<SystemSettings, "readerPolicy" | "credentialStatusPolicy" | "allowedVerificationMethods">;
export type NotificationSettings = Pick<SystemSettings, "notificationPreferencePlaceholder" | "participantInvitationMode">;
export type AccessAuditSettings = Pick<SystemSettings, "sensitiveActionReasonRequired">;

export type AuthSession = {
  userId: ID;
  role: UserRole;
  displayName: string;
  isAuthenticated: boolean;
};

export type DevelopmentAccount = {
  userId: ID;
  role: UserRole;
  displayName: string;
  email: string;
};
