import {
  attendanceRecordFixtures,
  attendanceAttemptFixtures,
  attendanceSessionFixtures,
  auditLogFixtures,
  classFixtures,
  classRosterFixtures,
  correctionRequestFixtures,
  departmentFixtures,
  eventFixtures,
  eventParticipantFixtures,
  facultyProfileFixtures,
  mlPredictionFixtures,
  notificationFixtures,
  organizerProfileFixtures,
  programFixtures,
  reportFixtures,
  sectionFixtures,
  semesterFixtures,
  studentFixtures,
  systemSettingsFixture,
  adminProfileFixtures,
  userFixtures
} from "@/test-support/fixtures";
import type {
  AddRosterStudentInput,
  AcademicManagementRepository,
  AnalyticsMlRepository,
  AttendanceScanInput,
  AttendanceSubmissionResult,
  AttendanceRecordRepository,
  AttendanceSessionRepository,
  AuditLogRepository,
  AuthenticationRepository,
  ClassRosterRepository,
  CorrectionRequestRepository,
  CredentialRequestRepository,
  CreateCredentialRequestInput,
  CreateClassSessionInput,
  CreateCorrectionRequestInput,
  CreateEventInput,
  CreateEventSessionInput,
  EndAttendanceSessionInput,
  EventFeedbackRepository,
  EventManagementRepository,
  ManualAttendanceInput,
  RescheduleEventInput,
  AttendanceAttemptRepository,
  NotificationRepository,
  ReportRepository,
  RepositoryRegistry,
  ReviewCorrectionRequestInput,
  ReviewCredentialRequestInput,
  StudentCredentialRepository,
  FailedNotificationJob,
  SystemHealthRepository,
  SystemHealthIssue,
  SystemHealthSnapshot,
  SystemSettingsRepository,
  UpdateSystemSettingsInput,
  UpdateOrganizerBrandingInput,
  UserManagementRepository
} from "@/services/contracts";
import {
  applySimulationMode,
  assertRole,
  defaultRepositoryContext,
  matchesSearch,
  paginate,
  RepositoryError,
  type RepositoryContext
} from "@/test-support/simulatedRepositoryUtils";
import { studentIdentityMatchesPayload } from "@/lib/credentials/qrCredential";
import type {
  AttendanceRecord,
  AttendanceSession,
  Class,
  CorrectionRequest,
  CredentialRequest,
  Event,
  EventFeedbackTask,
  EventParticipant,
  EventResource,
  Notification,
  NotificationPreferences,
  Report,
  Student,
  StudentDashboardTask,
  User
} from "@/types/domain";
import type { AttendanceStatus, EventStatus, VerificationMethod } from "@/types/enums";
import type { ListQuery, PaginatedResult } from "@/types/filters";

function contextOrDefault(context?: RepositoryContext) {
  return context ?? defaultRepositoryContext;
}

async function beforeRead(repositoryName: string, context?: RepositoryContext, roles: RepositoryContext["actorRole"][] = ["admin", "faculty", "organizer", "student"]) {
  await applySimulationMode(repositoryName);
  assertRole(contextOrDefault(context), roles);
}

function getOrThrow<T extends { id: string }>(items: T[], id: string, label: string) {
  const item = items.find((entry) => entry.id === id);
  if (!item) {
    throw new RepositoryError(`${label} was not found.`, "NOT_FOUND");
  }
  return item;
}

function paginateOrThrowEmpty<T>(items: T[], query?: ListQuery): PaginatedResult<T> {
  if (items.length === 0) {
    throw new RepositoryError("No records matched the mock repository request.", "EMPTY_RESULT");
  }
  return paginate(items, query);
}

function paginateList<T>(items: T[], query?: ListQuery): PaginatedResult<T> {
  return paginate(items, query);
}

function filterUsers(query?: ListQuery): User[] {
  return userFixtures.filter((user) => matchesSearch([user.displayName, user.email, user.role], query?.search));
}

function filterStudents(query?: ListQuery): Student[] {
  return studentFixtures.filter(
    (student) =>
      matchesSearch([student.studentNumber, student.id, student.section], query?.search) &&
      (!query?.programId || student.programId === query.programId) &&
      (!query?.departmentId || student.departmentId === query.departmentId) &&
      (!query?.yearLevel || student.yearLevel === query.yearLevel) &&
      (!query?.section || student.section === query.section)
  );
}

function filterClasses(query?: ListQuery): Class[] {
  return classFixtures.filter(
    (classRecord) =>
      matchesSearch([classRecord.subjectCode, classRecord.subjectTitle, classRecord.section], query?.search) &&
      (!query?.semesterId || classRecord.semesterId === query.semesterId) &&
      (!query?.programId || classRecord.programId === query.programId) &&
      (!query?.departmentId || classRecord.departmentId === query.departmentId) &&
      (!query?.yearLevel || classRecord.yearLevel === query.yearLevel) &&
      (!query?.section || classRecord.section === query.section) &&
      (!query?.classId || classRecord.id === query.classId)
  );
}

function getFacultyProfileForContext(context: RepositoryContext) {
  return facultyProfileFixtures.find((profile) => profile.userId === context.actorUserId);
}

function facultyClassIds(context: RepositoryContext) {
  const profile = getFacultyProfileForContext(context);
  if (!profile) {
    return [];
  }
  return classFixtures.filter((classRecord) => classRecord.facultyId === profile.id).map((classRecord) => classRecord.id);
}

function getStudentForContext(context: RepositoryContext) {
  return studentFixtures.find((student) => student.userId === context.actorUserId);
}

function studentClassIds(context: RepositoryContext) {
  const student = getStudentForContext(context);
  if (!student) {
    return [];
  }
  return classRosterState.filter((entry) => entry.studentId === student.id).map((entry) => entry.classId);
}

function studentEventIds(context: RepositoryContext) {
  const student = getStudentForContext(context);
  if (!student) {
    return [];
  }
  return eventParticipantState.filter((entry) => entry.studentId === student.id).map((entry) => entry.eventId);
}

function getOrganizerProfileForContext(context: RepositoryContext) {
  return organizerProfileFixtures.find((profile) => profile.userId === context.actorUserId);
}

function organizerEventIds(context: RepositoryContext) {
  const profile = getOrganizerProfileForContext(context);
  if (!profile) {
    return [];
  }
  return eventState.filter((event) => event.organizerId === profile.id).map((event) => event.id);
}

function organizerStudentIds(context: RepositoryContext) {
  const ownedEvents = new Set(organizerEventIds(context));
  return new Set(eventParticipantState.filter((entry) => ownedEvents.has(entry.eventId)).map((entry) => entry.studentId));
}

function isSessionInFacultyScope(session: AttendanceSession, context: RepositoryContext) {
  if (context.actorRole !== "faculty") {
    return true;
  }
  return Boolean(session.classId && facultyClassIds(context).includes(session.classId));
}

function isEventInOrganizerScope(event: Event, context: RepositoryContext) {
  if (context.actorRole !== "organizer") {
    return true;
  }
  return organizerEventIds(context).includes(event.id);
}

function isSessionInOrganizerScope(session: AttendanceSession, context: RepositoryContext) {
  if (context.actorRole !== "organizer") {
    return true;
  }
  return Boolean(session.eventId && organizerEventIds(context).includes(session.eventId));
}

function isEventInStudentScope(event: Event, context: RepositoryContext) {
  if (context.actorRole !== "student") {
    return true;
  }
  return studentEventIds(context).includes(event.id);
}

function isClassInStudentScope(classRecord: Class, context: RepositoryContext) {
  if (context.actorRole !== "student") {
    return true;
  }
  return studentClassIds(context).includes(classRecord.id);
}

function isSessionInStudentScope(session: AttendanceSession, context: RepositoryContext) {
  if (context.actorRole !== "student") {
    return true;
  }
  return Boolean(
    (session.classId && studentClassIds(context).includes(session.classId)) ||
      (session.eventId && studentEventIds(context).includes(session.eventId))
  );
}

function isSessionInActorScope(session: AttendanceSession, context: RepositoryContext) {
  return isSessionInFacultyScope(session, context) && isSessionInOrganizerScope(session, context) && isSessionInStudentScope(session, context);
}

function filterEvents(query?: ListQuery): Event[] {
  return eventState.filter(
    (event) =>
      matchesSearch([event.title, event.venue, event.status], query?.search) &&
      (!query?.departmentId || event.departmentId === query.departmentId)
  );
}

function filterAttendanceSessions(query?: ListQuery): AttendanceSession[] {
  return attendanceSessionState.filter(
    (session) =>
      matchesSearch([session.title, session.status, session.type], query?.search) &&
      (!query?.sessionStatus || session.status === query.sessionStatus) &&
      (!query?.classId || session.classId === query.classId) &&
      (!query?.eventId || session.eventId === query.eventId)
  );
}

function filterAttendanceRecords(query?: ListQuery): AttendanceRecord[] {
  return attendanceRecordState.filter((record) => {
    const session = attendanceSessionState.find((entry) => entry.id === record.sessionId);
    return (
      matchesSearch([record.studentId, record.status, record.verificationMethod], query?.search) &&
      (!query?.attendanceStatus || record.status === query.attendanceStatus) &&
      (!query?.classId || session?.classId === query.classId) &&
      (!query?.eventId || session?.eventId === query.eventId)
    );
  });
}

let classRosterState = classRosterFixtures.map((entry) => ({ ...entry }));
let eventParticipantState = eventParticipantFixtures.map((entry) => ({ ...entry }));
let attendanceSessionState = attendanceSessionFixtures.map((entry) => ({ ...entry }));
let attendanceRecordState = attendanceRecordFixtures.map((entry) => ({ ...entry }));
let correctionRequestState = correctionRequestFixtures.map((entry) => ({ ...entry }));
let credentialRequestState: CredentialRequest[] = [];
let auditLogState = auditLogFixtures.map((entry) => ({ ...entry }));
let eventState = eventFixtures.map((entry) => ({ ...entry }));
let eventObjectiveState: Array<{ id: string; eventId: string; order: number; text: string }> = [];
let eventResourceState: EventResource[] = [];
let completedFeedbackTaskIds = new Set<string>();
let attendanceAttemptState = attendanceAttemptFixtures.map((entry) => ({ ...entry }));
let notificationState: Notification[] = notificationFixtures.map((notification) => ({ ...notification }));
let notificationPreferencesState: Record<string, NotificationPreferences> = {};
let systemSettingsState = { ...systemSettingsFixture };
let failedNotificationState: FailedNotificationJob[] = [
  {
    id: "notification-job-1",
    source: "event_email",
    recipient: "admin.one@plpass.test",
    channel: "email",
    subject: "Dean Summary report failed",
    status: "failed",
    lastError: "Provider rejected the delivery request.",
    updatedAt: "2026-06-26T08:05:00.000Z"
  }
];

export function resetSimulatedRepositoryState() {
  classRosterState = classRosterFixtures.map((entry) => ({ ...entry }));
  eventParticipantState = eventParticipantFixtures.map((entry) => ({ ...entry }));
  attendanceSessionState = attendanceSessionFixtures.map((entry) => ({ ...entry }));
  attendanceRecordState = attendanceRecordFixtures.map((entry) => ({ ...entry }));
  correctionRequestState = correctionRequestFixtures.map((entry) => ({ ...entry }));
  credentialRequestState = [];
  auditLogState = auditLogFixtures.map((entry) => ({ ...entry }));
  eventState = eventFixtures.map((entry) => ({ ...entry }));
  eventObjectiveState = [];
  eventResourceState = [];
  completedFeedbackTaskIds = new Set<string>();
  attendanceAttemptState = attendanceAttemptFixtures.map((entry) => ({ ...entry }));
  notificationState = notificationFixtures.map((notification) => ({ ...notification }));
  notificationPreferencesState = {};
  systemSettingsState = { ...systemSettingsFixture };
  failedNotificationState = [
    {
      id: "notification-job-1",
      source: "event_email",
      recipient: "admin.one@plpass.test",
      channel: "email",
      subject: "Dean Summary report failed",
      status: "failed",
      lastError: "Provider rejected the delivery request.",
      updatedAt: "2026-06-26T08:05:00.000Z"
    }
  ];
}

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function displayNameForStudent(studentId: string) {
  const student = studentFixtures.find((entry) => entry.id === studentId);
  const user = student ? userFixtures.find((entry) => entry.id === student.userId) : undefined;
  return user?.displayName ?? "Student";
}

function studentNumberForStudent(studentId: string) {
  return studentFixtures.find((entry) => entry.id === studentId)?.studentNumber;
}

function expectedStudentIdsForSession(session: AttendanceSession) {
  if (session.classId) {
    return classRosterState.filter((entry) => entry.classId === session.classId).map((entry) => entry.studentId);
  }
  if (session.eventId) {
    return eventParticipantState.filter((entry) => entry.eventId === session.eventId).map((entry) => entry.studentId);
  }
  return [];
}

function countAttempts(sessionId: string, message: string) {
  return attendanceAttemptState.filter((attempt) => attempt.sessionId === sessionId && attempt.message === message).length;
}

function sessionSummary(sessionId: string) {
  const records = attendanceRecordState.filter((record) => record.sessionId === sessionId);
  return {
    present: records.filter((record) => record.status === "present").length,
    late: records.filter((record) => record.status === "late").length,
    absent: records.filter((record) => record.status === "absent").length,
    duplicateAttempts: countAttempts(sessionId, "Already recorded"),
    failedAttempts: attendanceAttemptState.filter((attempt) => attempt.sessionId === sessionId && !attempt.accepted).length
  };
}

function addSafeAudit(context: RepositoryContext, action: string, targetType: string, targetId: string, metadata: Record<string, string | number | boolean>) {
  auditLogState = [
    {
      id: `audit-${action}-${Date.now()}`,
      actorUserId: context.actorUserId,
      action,
      targetType,
      targetId,
      timestamp: new Date().toISOString(),
      metadata
    },
    ...auditLogState
  ];
}

function addSafeAttendanceAttempt(input: {
  sessionId: string;
  studentId?: string;
  accepted: boolean;
  attemptedAt: string;
  message: string;
  context?: RepositoryContext;
}) {
  attendanceAttemptState = [
    {
      id: `attempt-local-${Date.now()}`,
      sessionId: input.sessionId,
      studentId: input.studentId,
      accepted: input.accepted,
      attemptedAt: input.attemptedAt,
      message: input.message
    },
    ...attendanceAttemptState
  ];
}

function resultFor(input: {
  resultStatus: AttendanceSubmissionResult["resultStatus"];
  sessionId: string;
  method: VerificationMethod;
  recordedAt: string;
  safeMessage: string;
  studentId?: string;
  attendanceStatus?: AttendanceStatus;
  attendanceRecord?: AttendanceRecord;
}): AttendanceSubmissionResult {
  return {
    resultStatus: input.resultStatus,
    studentDisplayName: input.studentId ? displayNameForStudent(input.studentId) : undefined,
    studentNumber: input.studentId ? studentNumberForStudent(input.studentId) : undefined,
    attendanceStatus: input.attendanceStatus,
    verificationMethod: input.method,
    recordedAt: input.recordedAt,
    safeMessage: input.safeMessage,
    attendanceRecord: input.attendanceRecord,
    summary: sessionSummary(input.sessionId)
  };
}

function resolveOccurrence(session: AttendanceSession, occurredAt?: string) {
  return occurredAt ?? addMinutes(session.startsAt, 2);
}

function assertSessionOperator(session: AttendanceSession, context: RepositoryContext) {
  if (!isSessionInFacultyScope(session, context)) {
    throw new RepositoryError("Faculty can only operate assigned class sessions.", "PERMISSION_DENIED");
  }
  if (!isSessionInOrganizerScope(session, context)) {
    throw new RepositoryError("Organizers can only operate their own event sessions.", "PERMISSION_DENIED");
  }
}

function validateSessionWindow(session: AttendanceSession, occurredAt: string) {
  const start = new Date(session.attendanceWindowStartAt ?? session.startsAt).getTime();
  const end = new Date(session.attendanceWindowEndAt ?? session.endsAt ?? addMinutes(session.startsAt, systemSettingsState.defaultSessionDurationMinutes)).getTime();
  const now = new Date(occurredAt).getTime();
  return now >= start && now <= end;
}

function attendanceStatusForTime(session: AttendanceSession, occurredAt: string): Extract<AttendanceStatus, "present" | "late"> {
  const lateCutoff = new Date(session.lateCutoffAt ?? addMinutes(session.startsAt, systemSettingsState.attendanceLateCutoffMinutes)).getTime();
  return new Date(occurredAt).getTime() <= lateCutoff ? "present" : "late";
}

function completeAttendanceRecord(input: {
  session: AttendanceSession;
  studentId: string;
  method: VerificationMethod;
  occurredAt: string;
  context: RepositoryContext;
  note?: string;
  statusOverride?: Extract<AttendanceStatus, "present" | "late">;
}): AttendanceSubmissionResult {
  const existing = attendanceRecordState.find((record) => record.sessionId === input.session.id && record.studentId === input.studentId && record.status !== "excused");
  if (existing) {
    addSafeAttendanceAttempt({ sessionId: input.session.id, studentId: input.studentId, accepted: false, attemptedAt: input.occurredAt, message: "Already recorded", context: input.context });
    addSafeAudit(input.context, `${input.method}_attendance.duplicate`, "attendance_session", input.session.id, { studentId: input.studentId, method: input.method });
    return resultFor({
      resultStatus: "Already Recorded",
      sessionId: input.session.id,
      method: input.method,
      recordedAt: existing.recordedAt,
      safeMessage: `Attendance was already recorded as ${existing.status}.`,
      studentId: input.studentId,
      attendanceStatus: existing.status,
      attendanceRecord: existing
    });
  }

  const status = input.statusOverride ?? attendanceStatusForTime(input.session, input.occurredAt);
  const record: AttendanceRecord = {
    id: `record-simulated-${Date.now()}`,
    sessionId: input.session.id,
    studentId: input.studentId,
    status,
    verificationMethod: input.method,
    recordedAt: input.occurredAt,
    recordedByUserId: input.context.actorUserId,
    note: input.note
  };
  attendanceRecordState = [record, ...attendanceRecordState];
  addSafeAttendanceAttempt({ sessionId: input.session.id, studentId: input.studentId, accepted: true, attemptedAt: input.occurredAt, message: "Attendance accepted", context: input.context });
  addSafeAudit(input.context, `${input.method}_attendance.recorded`, "attendance_record", record.id, { sessionId: input.session.id, studentId: input.studentId, status });
  return resultFor({
    resultStatus: status === "present" ? "Present" : "Late",
    sessionId: input.session.id,
    method: input.method,
    recordedAt: record.recordedAt,
    safeMessage: `${status === "present" ? "Present" : "Late"} attendance recorded through Development Simulation.`,
    studentId: input.studentId,
    attendanceStatus: status,
    attendanceRecord: record
  });
}

function simulateAttendance(input: AttendanceScanInput | ManualAttendanceInput, method: VerificationMethod, context: RepositoryContext) {
  const session = getOrThrow(attendanceSessionState, input.sessionId, "Attendance session");
  assertSessionOperator(session, context);
  const occurredAt = resolveOccurrence(session, input.occurredAt);

  if (session.status !== "active") {
    return resultFor({
      resultStatus: "No Active Session",
      sessionId: session.id,
      method,
      recordedAt: occurredAt,
      safeMessage: "No active session is available for this attendance attempt."
    });
  }

  let studentId: string | undefined;
  let note: string | undefined;
  const statusOverride = "statusOverride" in input ? input.statusOverride : undefined;
  if ("credentialCode" in input) {
    const credentialStudentId = studentFixtures.find((student) => studentIdentityMatchesPayload(input.credentialCode, student.studentNumber, student.fullName ?? ""))?.id;
    if (!credentialStudentId) {
      addSafeAttendanceAttempt({ sessionId: session.id, accepted: false, attemptedAt: occurredAt, message: "Invalid credential", context });
      addSafeAudit(context, `${method}_attendance.invalid`, "attendance_session", session.id, { method });
      return resultFor({ resultStatus: "Invalid Credential", sessionId: session.id, method, recordedAt: occurredAt, safeMessage: "The scanned development credential was not found." });
    }
    studentId = credentialStudentId;
  } else {
    studentId = input.studentId;
    note = `${input.reason}: ${input.remarks}`;
    if (!input.reason.trim() || !input.remarks.trim()) {
      throw new RepositoryError("Student selection, manual reason, and remarks are required.", "VALIDATION_ERROR");
    }
  }

  const allowManualJoin = "allowManualJoin" in input && Boolean(input.allowManualJoin);
  const isOrganizer = context.actorRole === "organizer";
  if (!studentId || (!expectedStudentIdsForSession(session).includes(studentId) && !(allowManualJoin && isOrganizer))) {
    if (studentId) {
      addSafeAttendanceAttempt({ sessionId: session.id, studentId, accepted: false, attemptedAt: occurredAt, message: "Student not enrolled", context });
      addSafeAudit(context, `${method}_attendance.not_enrolled`, "attendance_session", session.id, { studentId, method });
    }
    return resultFor({ resultStatus: "Student Not Enrolled", sessionId: session.id, method, recordedAt: occurredAt, safeMessage: "The student is not part of this class or event.", studentId });
  }

  if (!validateSessionWindow(session, occurredAt)) {
    addSafeAttendanceAttempt({ sessionId: session.id, studentId, accepted: false, attemptedAt: occurredAt, message: "Outside attendance window", context });
    addSafeAudit(context, `${method}_attendance.outside_window`, "attendance_session", session.id, { studentId, method });
    return resultFor({ resultStatus: "Outside Attendance Window", sessionId: session.id, method, recordedAt: occurredAt, safeMessage: "The attendance attempt is outside the configured window.", studentId });
  }

  return completeAttendanceRecord({ session, studentId, method, occurredAt, context, note, statusOverride });
}

export const simulatedAuthenticationRepository: AuthenticationRepository = {
  async listDevelopmentAccounts() {
    await applySimulationMode("authentication");
    return userFixtures
      .filter((user) => user.role === "organizer" || user.role === "student" || user.role === "admin")
      .map((user) => ({
        userId: user.id,
        role: user.role,
        displayName: user.displayName,
        email: user.email
      }));
  },
  async getSession(context = defaultRepositoryContext) {
    await applySimulationMode("authentication");
    const user = getOrThrow(userFixtures, context.actorUserId, "User");
    return {
      userId: user.id,
      role: user.role,
      displayName: user.displayName,
      isAuthenticated: true
    };
  }
};

export const simulatedUserManagementRepository: UserManagementRepository = {
  async listUsers(query, context) {
    await beforeRead("userManagement", context, ["admin"]);
    return paginateOrThrowEmpty(filterUsers(query), query);
  },
  async getUserById(userId, context) {
    await beforeRead("userManagement", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    if (currentContext.actorRole === "student" && currentContext.actorUserId !== userId) {
      throw new RepositoryError("Students can only read their own user record.", "PERMISSION_DENIED");
    }
    return getOrThrow(userFixtures, userId, "User");
  },
  async listStudents(query, context) {
    await beforeRead("userManagement", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const items =
      currentContext.actorRole === "student"
        ? filterStudents(query).filter((student) => student.userId === currentContext.actorUserId)
        : filterStudents(query);
    return currentContext.actorRole === "faculty" || currentContext.actorRole === "organizer" || currentContext.actorRole === "student"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  },
  async listStudentsByIds(studentIds, context) {
    await beforeRead("userManagement", context, ["admin", "faculty", "organizer", "student"]);
    const permitted = new Set(studentIds);
    return studentFixtures.filter((student) => permitted.has(student.id));
  },
  async createStudent(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const newStudent: Student = {
      id: `student-simulated-${Date.now()}`,
      userId: `user-simulated-${Date.now()}`,
      studentNumber: input.studentNumber,
      status: "enrolled",
      programId: input.programId,
      departmentId: input.departmentId,
      yearLevel: input.yearLevel,
      section: input.sectionId,
      createdAt: new Date().toISOString(),
      email: input.email,
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      nameExtension: input.nameExtension,
      fullName: [input.firstName, input.middleName, input.lastName, input.nameExtension].filter(Boolean).join(" ")
    };
    studentFixtures.push(newStudent);
    return newStudent;
  },
  async updateStudent(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const existing = getOrThrow(studentFixtures, input.id, "Student");
    const updated: Student = {
      ...existing,
      email: input.email,
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      programId: input.programId,
      departmentId: input.departmentId,
      yearLevel: input.yearLevel,
      section: input.sectionId,
      nameExtension: input.nameExtension,
      fullName: [input.firstName, input.middleName, input.lastName, input.nameExtension].filter(Boolean).join(" ")
    };
    const index = studentFixtures.findIndex(s => s.id === input.id);
    if (index !== -1) {
      studentFixtures[index] = updated;
    }
    return updated;
  },
  async bulkCreateStudents(inputs, context) {
    await beforeRead("userManagement", context, ["admin"]);
    let success = 0;
    const errors: Array<{ row: number; email: string; studentNumber: string; error: string }> = [];
    const existingStudentNumbers = new Set(studentFixtures.map((student) => student.studentNumber));
    for (const [index, input] of inputs.entries()) {
      if (existingStudentNumbers.has(input.studentNumber)) {
        errors.push({ row: index + 2, email: input.email, studentNumber: input.studentNumber, error: `Student ID "${input.studentNumber}" already exists.` });
        continue;
      }
      const newStudent: Student = {
        id: `student-simulated-${Date.now()}-${success}`,
        userId: `user-simulated-${Date.now()}-${success}`,
        studentNumber: input.studentNumber,
        status: "enrolled",
        programId: input.programId,
        departmentId: input.departmentId,
        yearLevel: input.yearLevel,
        section: input.sectionId,
        createdAt: new Date().toISOString(),
        email: input.email,
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        nameExtension: input.nameExtension,
        fullName: [input.firstName, input.middleName, input.lastName, input.nameExtension].filter(Boolean).join(" ")
      };
      studentFixtures.push(newStudent);
      existingStudentNumbers.add(input.studentNumber);
      success++;
    }
    return { success, failed: errors.length, errors };
  },
  async listFacultyProfiles(query, context) {
    await beforeRead("userManagement", context, ["admin", "faculty", "student"]);
    const currentContext = contextOrDefault(context);
    const facultyIdsForStudent =
      currentContext.actorRole === "student"
        ? new Set(classFixtures.filter((classRecord) => studentClassIds(currentContext).includes(classRecord.id)).map((classRecord) => classRecord.facultyId))
        : undefined;
    const items = facultyProfileFixtures.filter(
      (profile) =>
        matchesSearch([profile.employeeNumber, profile.title], query?.search) &&
        (currentContext.actorRole === "admin" ||
          profile.userId === currentContext.actorUserId ||
          Boolean(facultyIdsForStudent?.has(profile.id)))
    ).map((profile) => {
      const user = userFixtures.find((u) => u.id === profile.userId);
      return {
        ...profile,
        displayName: user?.displayName
      };
    });
    return currentContext.actorRole === "student" ? paginateList(items, query) : paginateOrThrowEmpty(items, query);
  },
  async listOrganizerProfiles(query, context) {
    await beforeRead("userManagement", context, ["admin", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const organizerIdsForStudent =
      currentContext.actorRole === "student"
        ? new Set(eventState.filter((event) => studentEventIds(currentContext).includes(event.id)).map((event) => event.organizerId))
        : undefined;
    const items = organizerProfileFixtures.filter(
      (profile) =>
        matchesSearch([profile.organizationName, profile.employeeNumber, profile.position], query?.search) &&
        (currentContext.actorRole === "admin" ||
          profile.userId === currentContext.actorUserId ||
          Boolean(organizerIdsForStudent?.has(profile.id)))
    );
    return currentContext.actorRole === "student" ? paginateList(items, query) : paginateOrThrowEmpty(items, query);
  },
  async listAdminProfiles(query, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const currentContext = contextOrDefault(context);
    return paginateOrThrowEmpty(
      adminProfileFixtures.filter((profile) => profile.userId === currentContext.actorUserId),
      query
    );
  },
  async createOrganizer(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const stamp = Date.now();
    const userId = `organizer-user-${stamp}`;
    const profileId = `organizer-profile-${stamp}`;
    const nextId = organizerProfileFixtures.reduce((max, item) => { const match = item.employeeNumber.match(/^O-(\d{3})$/); return match ? Math.max(max, Number(match[1])) : max; }, 0) + 1;
    const employeeNumber = `O-${String(nextId).padStart(3, "0")}`;
    const profile = { id: profileId, userId, employeeNumber, organizationName: input.organizationName, departmentId: input.departmentId, position: input.position, employmentStatus: "active" as const };
    userFixtures.push({
      id: userId,
      role: "organizer",
      email: input.email,
      displayName: [input.firstName, input.middleName, input.lastName].filter(Boolean).join(" "),
      isActive: true,
      createdAt: new Date().toISOString()
    });
    organizerProfileFixtures.push(profile);
    return profile;
  },
  async updateOrganizer(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const organizerIndex = organizerProfileFixtures.findIndex((profile) => profile.id === input.id && profile.userId === input.profileId);
    if (organizerIndex === -1) throw new RepositoryError("Organizer account not found.", "NOT_FOUND");
    const userIndex = userFixtures.findIndex((user) => user.id === input.profileId && user.role === "organizer");
    if (userIndex === -1) throw new RepositoryError("Organizer user profile not found.", "NOT_FOUND");
    const organizer = organizerProfileFixtures[organizerIndex];
    const updatedOrganizer = {
      ...organizer,
      departmentId: input.departmentId || undefined,
      organizationName: input.organizationName,
      position: input.position,
      employmentStatus: input.employmentStatus
    };
    organizerProfileFixtures[organizerIndex] = updatedOrganizer;
    userFixtures[userIndex] = {
      ...userFixtures[userIndex],
      email: input.email,
      displayName: [input.firstName, input.middleName, input.lastName].filter(Boolean).join(" "),
      isActive: input.accountStatus === "active"
    };
    return updatedOrganizer;
  },
  async createAdmin(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const stamp = Date.now();
    const userId = `admin-user-${stamp}`;
    const nextId = adminProfileFixtures.reduce((max, item) => { const match = item.employeeNumber.match(/^A-(\d{3})$/); return match ? Math.max(max, Number(match[1])) : max; }, 0) + 1;
    const profile = { id: `admin-profile-${stamp}`, userId, employeeNumber: `A-${String(nextId).padStart(3, "0")}`, departmentId: input.departmentId, officeName: input.officeName };
    userFixtures.push({ id: userId, role: "admin", email: input.email, displayName: [input.firstName, input.middleName, input.lastName].filter(Boolean).join(" "), isActive: true, createdAt: new Date().toISOString() });
    adminProfileFixtures.push(profile);
    return profile;
  },
  async updateAdmin(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const adminIndex = adminProfileFixtures.findIndex((profile) => profile.id === input.id && profile.userId === input.profileId);
    const userIndex = userFixtures.findIndex((user) => user.id === input.profileId && ["admin", "department_admin"].includes(user.role));
    if (adminIndex === -1 || userIndex === -1) throw new RepositoryError("Admin account not found.", "NOT_FOUND");
    const updated = { ...adminProfileFixtures[adminIndex], departmentId: input.departmentId, officeName: input.officeName };
    adminProfileFixtures[adminIndex] = updated;
    userFixtures[userIndex] = { ...userFixtures[userIndex], email: input.email, displayName: [input.firstName, input.middleName, input.lastName, input.nameExtension].filter(Boolean).join(" "), nameExtension: input.nameExtension, isActive: input.accountStatus === "active" };
    return updated;
  },
  async revokeUserSessions(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const currentContext = contextOrDefault(context);
    if (currentContext.actorUserId === input.userId || !input.reason.trim()) {
      throw new RepositoryError("A different user and a reason are required to revoke sessions.", "VALIDATION_ERROR");
    }
    return { revokedSessionCount: 1 };
  },
  async resendAdminInvitation(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const target = userFixtures.find((user) => user.id === input.userId && ["admin", "department_admin"].includes(user.role));
    if (!target) throw new RepositoryError("The administrator account could not be found.", "NOT_FOUND");
    return;
  },
  async resendUserInvitation(input, context) {
    await beforeRead("userManagement", context, ["admin"]);
    const target = userFixtures.find((user) => user.id === input.userId && ["admin", "department_admin", "organizer"].includes(user.role));
    if (!target) throw new RepositoryError("The account could not be found.", "NOT_FOUND");
    return;
  },
  async bulkCreateOrganizers(inputs, context) {
    await beforeRead("userManagement", context, ["admin"]);
    inputs.forEach((input, index) => {
      const userId = `organizer-user-${Date.now()}-${index}`;
      const nextId = organizerProfileFixtures.reduce((max, item) => { const match = item.employeeNumber.match(/^O-(\d{3})$/); return match ? Math.max(max, Number(match[1])) : max; }, 0) + 1;
      organizerProfileFixtures.push({ id: `organizer-${Date.now()}-${index}`, userId, employeeNumber: `O-${String(nextId).padStart(3, "0")}`, organizationName: input.organizationName, departmentId: input.departmentId, position: input.position, employmentStatus: "active" });
      userFixtures.push({
        id: userId,
        role: "organizer",
        email: input.email,
        displayName: [input.firstName, input.middleName, input.lastName].filter(Boolean).join(" "),
        isActive: true,
        createdAt: new Date().toISOString()
      });
    });
    return { success: inputs.length, failed: 0, errors: [] };
  },
  async getOrganizerBranding(organizerId, context) {
    await beforeRead("userManagement", context, ["admin", "organizer"]);
    const currentContext = contextOrDefault(context);
    const profile = organizerProfileFixtures.find((item) => item.id === organizerId);
    if (!profile || (currentContext.actorRole === "organizer" && profile.userId !== currentContext.actorUserId)) {
      throw new RepositoryError("You can only view your own branding.", "PERMISSION_DENIED");
    }
    return {
      organizerId: profile.id,
      collegeName: profile.organizationName,
      collegeLogoPath: profile.collegeLogoPath,
      collegeLogoUrl: profile.collegeLogoPath,
      updatedAt: new Date().toISOString()
    };
  },
  async updateOrganizerBranding(input: UpdateOrganizerBrandingInput, context) {
    await beforeRead("userManagement", context, ["admin", "organizer"]);
    const currentContext = contextOrDefault(context);
    const profile = organizerProfileFixtures.find((item) => item.id === input.organizerId);
    if (!profile || (currentContext.actorRole === "organizer" && profile.userId !== currentContext.actorUserId)) {
      throw new RepositoryError("You can only update your own branding.", "PERMISSION_DENIED");
    }
    if (!input.collegeName.trim()) throw new RepositoryError("College name is required.", "VALIDATION_ERROR");
    if (input.logo && (!["image/jpeg", "image/png", "image/webp"].includes(input.logo.type) || input.logo.size > 2 * 1024 * 1024)) {
      throw new RepositoryError("College logos must be JPG, PNG, or WebP files up to 2 MB.", "VALIDATION_ERROR");
    }
    profile.organizationName = input.collegeName.trim();
    if (input.removeLogo) profile.collegeLogoPath = undefined;
    if (input.logo) profile.collegeLogoPath = URL.createObjectURL(input.logo);
    await simulatedRepositoryRegistry.auditLogs.logClientAction({ action: "organizer.branding_updated", targetType: "organizer_profile", targetId: profile.id, metadata: { collegeName: profile.organizationName } }, context);
    return {
      organizerId: profile.id,
      collegeName: profile.organizationName,
      collegeLogoPath: profile.collegeLogoPath,
      collegeLogoUrl: profile.collegeLogoPath,
      updatedAt: new Date().toISOString()
    };
  },
  async getDepartmentBranding(departmentId, context) {
    await beforeRead("userManagement", context, ["admin", "department_admin"]);
    const department = departmentFixtures.find((item) => item.id === departmentId);
    if (!department) throw new RepositoryError("Department was not found.", "NOT_FOUND");
    return { departmentId, displayName: department.name, primaryColor: "#3f7a44", secondaryColor: "#e8f1e6", updatedAt: new Date().toISOString() };
  },
  async updateDepartmentBranding(input, context) {
    await beforeRead("userManagement", context, ["admin", "department_admin"]);
    const department = departmentFixtures.find((item) => item.id === input.departmentId);
    if (!department) throw new RepositoryError("Department was not found.", "NOT_FOUND");
    if (!input.displayName.trim()) throw new RepositoryError("A department display name is required.", "VALIDATION_ERROR");
    return { departmentId: input.departmentId, displayName: input.displayName.trim(), primaryColor: input.primaryColor, secondaryColor: input.secondaryColor, updatedAt: new Date().toISOString() };
  }
};

export const simulatedAcademicManagementRepository: AcademicManagementRepository = {
  async listDepartments(query, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer", "student"]);
    return paginateOrThrowEmpty(departmentFixtures.filter((department) => matchesSearch([department.code, department.name], query?.search)), query);
  },
  async listPrograms(query, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer", "student"]);
    return paginateOrThrowEmpty(
      programFixtures.filter(
        (program) =>
          matchesSearch([program.code, program.name], query?.search) &&
          (!query?.departmentId || program.departmentId === query.departmentId)
      ),
      query
    );
  },
  async listSemesters(query, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer", "student"]);
    return paginateOrThrowEmpty(
      semesterFixtures.filter((semester) => matchesSearch([semester.label, semester.schoolYear], query?.search)),
      query
    );
  },
  async listSections(query, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer", "student"]);
    return paginateOrThrowEmpty(
      sectionFixtures.filter(
        (section) =>
          matchesSearch([section.name, section.academicYear, section.semester], query?.search) &&
          (!query?.programId || section.programId === query.programId) &&
          (!query?.yearLevel || section.yearLevel === query.yearLevel)
      ),
      query
    );
  },
  async listClasses(query, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const items =
      currentContext.actorRole === "faculty"
        ? filterClasses(query).filter((classRecord) => facultyClassIds(currentContext).includes(classRecord.id))
        : currentContext.actorRole === "student"
          ? filterClasses(query).filter((classRecord) => isClassInStudentScope(classRecord, currentContext))
        : filterClasses(query);
    return currentContext.actorRole === "faculty" || currentContext.actorRole === "student"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  },
  async getClassById(classId, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const classRecord = getOrThrow(classFixtures, classId, "Class");
    if (currentContext.actorRole === "faculty" && !facultyClassIds(currentContext).includes(classRecord.id)) {
      throw new RepositoryError("Faculty can only access assigned classes.", "PERMISSION_DENIED");
    }
    if (currentContext.actorRole === "student" && !isClassInStudentScope(classRecord, currentContext)) {
      throw new RepositoryError("Students can only access enrolled classes.", "PERMISSION_DENIED");
    }
    return classRecord;
  },
  async setCatalogActive(table, id, isActive, context) {
    await beforeRead("academicManagement", context, ["admin", "organizer"]);
    const items: Array<{ id: string; isActive: boolean }> = table === "departments" ? departmentFixtures : table === "programs" ? programFixtures : table === "sections" ? sectionFixtures : [];
    if (!items.length) {
      throw new RepositoryError(`${table} catalog management is unavailable in the development repository.`, "NOT_FOUND");
    }
    const item = items.find((entry) => entry.id === id);
    if (!item) {
      throw new RepositoryError("Catalog record was not found.", "NOT_FOUND");
    }
    item.isActive = isActive;
    await simulatedRepositoryRegistry.auditLogs.logClientAction({
      action: `settings.${table}.status_changed`,
      targetType: table,
      targetId: id,
      metadata: { isActive }
    }, context);
  }
};

export const simulatedClassRosterRepository: ClassRosterRepository = {
  async listClassRosters(query, context) {
    await beforeRead("classRosters", context, ["admin", "faculty"]);
    const currentContext = contextOrDefault(context);
    const allowedClassIds = currentContext.actorRole === "faculty" ? facultyClassIds(currentContext) : undefined;
    const items = classRosterState.filter(
        (entry) =>
          (!query?.classId || entry.classId === query.classId) &&
          (!allowedClassIds || allowedClassIds.includes(entry.classId))
      );
    return currentContext.actorRole === "faculty" ? paginateList(items, query) : paginateOrThrowEmpty(items, query);
  },
  async listStudentsForClass(classId, query, context) {
    await beforeRead("classRosters", context, ["admin", "faculty"]);
    const currentContext = contextOrDefault(context);
    if (currentContext.actorRole === "faculty" && !facultyClassIds(currentContext).includes(classId)) {
      throw new RepositoryError("Faculty can only access rosters for assigned classes.", "PERMISSION_DENIED");
    }
    const studentIds = classRosterState.filter((entry) => entry.classId === classId).map((entry) => entry.studentId);
    return paginateList(filterStudents(query).filter((student) => studentIds.includes(student.id)), query);
  },
  async addStudentToClass(input: AddRosterStudentInput, context) {
    await beforeRead("classRosters", context, ["admin"]);
    getOrThrow(classFixtures, input.classId, "Class");
    const student = getOrThrow(studentFixtures, input.studentId, "Student");
    if (student.status !== "enrolled") {
      throw new RepositoryError("Only enrolled students can be added to a class roster.", "VALIDATION_ERROR");
    }
    const duplicate = classRosterState.some(
      (entry) => entry.classId === input.classId && entry.studentId === input.studentId
    );
    if (duplicate) {
      throw new RepositoryError("Student is already in this class roster.", "VALIDATION_ERROR");
    }
    const created = {
      id: `roster-created-${Date.now()}`,
      classId: input.classId,
      studentId: input.studentId,
      enrolledAt: new Date().toISOString()
    };
    classRosterState = [...classRosterState, created];
    return created;
  },
  async removeStudentFromClass(classId, studentId, context) {
    await beforeRead("classRosters", context, ["admin"]);
    const existing = classRosterState.find((entry) => entry.classId === classId && entry.studentId === studentId);
    if (!existing) {
      throw new RepositoryError("Class roster entry was not found.", "NOT_FOUND");
    }
    classRosterState = classRosterState.filter((entry) => entry.id !== existing.id);
  }
};

export const simulatedEventManagementRepository: EventManagementRepository = {
  async listEvents(query, context) {
    await beforeRead("eventManagement", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const items = filterEvents(query)
      .filter((event) => isEventInOrganizerScope(event, currentContext) && isEventInStudentScope(event, currentContext))
      .map((event) => {
        if (currentContext.actorRole !== "student") return event;
        const completedSession = attendanceSessionState.some(
          (session) => session.eventId === event.id && session.status === "completed"
        );
        return completedSession ? { ...event, status: "completed" as const } : event;
      });
    return currentContext.actorRole === "organizer" || currentContext.actorRole === "student"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  },
  async getEventById(eventId, context) {
    await beforeRead("eventManagement", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const event = getOrThrow(eventState, eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext)) {
      throw new RepositoryError("Organizers can only access their own events.", "PERMISSION_DENIED");
    }
    if (!isEventInStudentScope(event, currentContext)) {
      throw new RepositoryError("Students can only access events they are registered for.", "PERMISSION_DENIED");
    }
    return event;
  },
  async listEventParticipants(eventId, query, context) {
    await beforeRead("eventManagement", context, ["admin", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const event = getOrThrow(eventState, eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext)) {
      throw new RepositoryError("Organizers can only access participants for their own events.", "PERMISSION_DENIED");
    }
    if (!isEventInStudentScope(event, currentContext)) {
      throw new RepositoryError("Students can only access participant records for registered events.", "PERMISSION_DENIED");
    }
    const student = getStudentForContext(currentContext);
    const items = eventParticipantState.filter(
      (participant) =>
        participant.eventId === eventId &&
        (currentContext.actorRole !== "student" || participant.studentId === student?.id)
    );
    return currentContext.actorRole === "organizer" || currentContext.actorRole === "student"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  },
  async listEventResources(eventId, query, context) {
    await beforeRead("eventManagement", context, ["organizer", "admin", "student"]);
    const currentContext = contextOrDefault(context);
    const event = getOrThrow(eventState, eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext) || !isEventInStudentScope(event, currentContext)) {
      throw new RepositoryError("You do not have access to this event's resources.", "PERMISSION_DENIED");
    }
    return paginate(eventResourceState.filter((resource) => resource.eventId === eventId), query);
  },
  async addEventResource(input, context) {
    await beforeRead("eventManagement", context, ["organizer", "admin"]);
    const currentContext = contextOrDefault(context);
    const event = getOrThrow(eventState, input.eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext)) {
      throw new RepositoryError("Organizers can only manage resources for their own events.", "PERMISSION_DENIED");
    }
    const resource: EventResource = {
      id: `resource-${Date.now()}-${eventResourceState.length + 1}`,
      eventId: input.eventId,
      title: input.title,
      externalUrl: input.externalUrl,
      storageBucket: input.storageBucket,
      storageObjectPath: input.storageObjectPath
    };
    eventResourceState = [...eventResourceState, resource];
    return resource;
  },
  async removeEventResource(resourceId, context) {
    await beforeRead("eventManagement", context, ["organizer", "admin"]);
    const currentContext = contextOrDefault(context);
    const resource = getOrThrow(eventResourceState, resourceId, "Event resource");
    const event = getOrThrow(eventState, resource.eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext)) {
      throw new RepositoryError("Organizers can only manage resources for their own events.", "PERMISSION_DENIED");
    }
    eventResourceState = eventResourceState.filter((entry) => entry.id !== resourceId);
  },
  async generateNextEventCode(context) {
    await beforeRead("eventManagement", context, ["organizer", "admin"]);
    const currentYear = new Date().getFullYear();
    const prefix = `EVT-${currentYear}-`;
    const highestExistingNumber = eventState.reduce((highest, event) => {
      if (!event.code.startsWith(prefix)) return highest;
      const sequence = Number.parseInt(event.code.slice(prefix.length), 10);
      return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
    }, 0);
    return `${prefix}${String(highestExistingNumber + 1).padStart(3, "0")}`;
  },
  async createEvent(input: CreateEventInput, context) {
    await beforeRead("eventManagement", context, ["organizer", "admin"]);
    const currentContext = contextOrDefault(context);
    const profile = getOrganizerProfileForContext(currentContext) ??
      (currentContext.actorRole === "admin" ? organizerProfileFixtures[0] : undefined);
    if (!profile) {
      throw new RepositoryError("Organizer profile was not found.", "NOT_FOUND");
    }
    if (!input.code.trim() || !input.title.trim() || !input.category.trim() || !input.venue.trim() || !input.date || !input.startTime || !input.endTime) {
      throw new RepositoryError("Event code, name, category, venue, date, start time, and end time are required.", "VALIDATION_ERROR");
    }
    if (input.endTime <= input.startTime) {
      throw new RepositoryError("End time must be after start time.", "VALIDATION_ERROR");
    }
    if (input.participantStudentIds.length === 0) {
      throw new RepositoryError("Select at least one participant.", "VALIDATION_ERROR");
    }
    const created: Event = {
      id: `event-created-${Date.now()}`,
      code: input.code.trim(),
      organizerId: profile.id,
      departmentId: profile.departmentId,
      category: input.category.trim(),
      title: input.title.trim(),
      venue: input.venue.trim(),
      startsAt: `${input.date}T${input.startTime}:00.000Z`,
      endsAt: `${input.date}T${input.endTime}:00.000Z`,
      status: "pending",
      priorityLevel: input.priorityLevel,
      impactScore: input.impactScore ?? null,
      predictedTurnout: null
    };
    const participants: EventParticipant[] = input.participantStudentIds.map((studentId) => ({
      id: `participant-${created.id}-${studentId}`,
      eventId: created.id,
      studentId,
      registeredAt: new Date().toISOString()
    }));
    const objectives = (input.objectives ?? [])
      .map((objective) => objective.trim())
      .filter((objective) => objective.length > 0)
      .map((objective, index) => ({
        id: `objective-${created.id}-${index + 1}`,
        eventId: created.id,
        order: index + 1,
        text: objective
      }));
    eventState = [created, ...eventState];
    eventParticipantState = [...participants, ...eventParticipantState];
    eventObjectiveState = [...objectives, ...eventObjectiveState.filter((entry) => entry.eventId !== created.id)];
    auditLogState = [
      {
        id: `audit-event-published-${Date.now()}`,
        actorUserId: currentContext.actorUserId,
        action: "event.published",
        targetType: "event",
        targetId: created.id,
        timestamp: new Date().toISOString(),
        metadata: { participantCount: participants.length, attendanceMode: input.attendanceMode ?? "not specified" }
      },
      ...auditLogState
    ];
    return created;
  },
  async updateEventStatus(eventId, status: Extract<EventStatus, "approved" | "rejected">, reason, context) {
    await beforeRead("eventManagement", context, ["admin"]);
    if (status === "rejected" && !reason?.trim()) {
      throw new RepositoryError("A rejection reason is required.", "VALIDATION_ERROR");
    }
    const event = getOrThrow(eventState, eventId, "Event");
    const updated = { ...event, status };
    eventState = eventState.map((entry) => (entry.id === eventId ? updated : entry));
    return updated;
  },
  async completeEvent(eventId, context) {
    await beforeRead("eventManagement", context, ["organizer", "admin"]);
    const currentContext = contextOrDefault(context);
    const event = getOrThrow(eventState, eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext)) {
      throw new RepositoryError("Organizers can only complete their own events.", "PERMISSION_DENIED");
    }
    const updated = { ...event, status: "completed" as const };
    eventState = eventState.map((entry) => (entry.id === eventId ? updated : entry));
    return updated;
  },
  async cancelEvent(eventId, reason, context) {
    await beforeRead("eventManagement", context, ["organizer", "admin"]);
    if (!reason.trim()) throw new RepositoryError("A cancellation reason is required.", "VALIDATION_ERROR");
    const currentContext = contextOrDefault(context);
    const event = getOrThrow(eventState, eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext)) {
      throw new RepositoryError("Organizers can only cancel their own events.", "PERMISSION_DENIED");
    }
    const updated = { ...event, status: "cancelled" as const, cancellationReason: reason.trim() };
    eventState = eventState.map((entry) => (entry.id === eventId ? updated : entry));
    return updated;
  },
  async rescheduleEvent(input: RescheduleEventInput, context) {
    await beforeRead("eventManagement", context, ["organizer", "admin"]);
    const currentContext = contextOrDefault(context);
    const event = getOrThrow(eventState, input.eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext)) {
      throw new RepositoryError("Organizers can only reschedule their own events.", "PERMISSION_DENIED");
    }

    // Build updated event with provided fields
    const updated: Event = {
      ...event,
      venue: input.venue || event.venue,
      status: event.status === "cancelled" ? "approved" : event.status,
      cancellationReason: undefined,
      startsAt: input.date && input.startTime 
        ? `${input.date}T${input.startTime}:00.000Z` 
        : event.startsAt,
      endsAt: input.date && input.endTime
        ? `${input.date}T${input.endTime}:00.000Z`
        : event.endsAt
    };

    eventState = eventState.map((entry) => (entry.id === input.eventId ? updated : entry));

    // Archive existing sessions for this event (simulation)
    // In real implementation, sessions would be marked archived with rescheduled metadata
    attendanceSessionState = attendanceSessionState.map((session) =>
      session.eventId === input.eventId && (session.status === "draft" || session.status === "active")
        ? { ...session, status: "cancelled" as const }
        : session
    );

    return updated;
  }
};

export const simulatedAttendanceSessionRepository: AttendanceSessionRepository = {
  async listAttendanceSessions(query, context) {
    await beforeRead("attendanceSessions", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const items = filterAttendanceSessions(query).filter((session) => isSessionInActorScope(session, currentContext));
    return currentContext.actorRole === "faculty" || currentContext.actorRole === "organizer" || currentContext.actorRole === "student"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  },
  async getAttendanceSessionById(sessionId, context) {
    await beforeRead("attendanceSessions", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const session = getOrThrow(attendanceSessionState, sessionId, "Attendance session");
    if (!isSessionInFacultyScope(session, currentContext)) {
      throw new RepositoryError("Faculty can only access assigned class sessions.", "PERMISSION_DENIED");
    }
    if (!isSessionInOrganizerScope(session, currentContext)) {
      throw new RepositoryError("Organizers can only access sessions for their own events.", "PERMISSION_DENIED");
    }
    if (!isSessionInStudentScope(session, currentContext)) {
      throw new RepositoryError("Students can only access their own class and event sessions.", "PERMISSION_DENIED");
    }
    return session;
  },
  async createClassSession(input: CreateClassSessionInput, context) {
    await beforeRead("attendanceSessions", context, ["faculty"]);
    const currentContext = contextOrDefault(context);
    const classRecord = getOrThrow(classFixtures, input.classId, "Class");
    if (!facultyClassIds(currentContext).includes(classRecord.id)) {
      throw new RepositoryError("Faculty can only start assigned class sessions.", "PERMISSION_DENIED");
    }
    if (!input.room.trim() || !input.date || !input.startTime || !input.expectedEndTime) {
      throw new RepositoryError("Room, date, start time, and expected end time are required.", "VALIDATION_ERROR");
    }
    const created: AttendanceSession = {
      id: `session-created-${Date.now()}`,
      type: "class",
      classId: input.classId,
      title: input.title,
      mode: input.mode,
      status: "active",
      startsAt: `${input.date}T${input.startTime}:00.000Z`,
      endsAt: `${input.date}T${input.expectedEndTime}:00.000Z`,
      lateCutoffAt: addMinutes(`${input.date}T${input.startTime}:00.000Z`, systemSettingsState.attendanceLateCutoffMinutes),
      attendanceWindowStartAt: addMinutes(`${input.date}T${input.startTime}:00.000Z`, -5),
      attendanceWindowEndAt: `${input.date}T${input.expectedEndTime}:00.000Z`,
      createdByUserId: currentContext.actorUserId
    };
    attendanceSessionState = [created, ...attendanceSessionState];
    return created;
  },
  async createEventSession(input: CreateEventSessionInput, context) {
    await beforeRead("attendanceSessions", context, ["organizer", "admin"]);
    const currentContext = contextOrDefault(context);
    const event = getOrThrow(eventState, input.eventId, "Event");
    if (!isEventInOrganizerScope(event, currentContext)) {
      throw new RepositoryError("Organizers can only start sessions for their own events.", "PERMISSION_DENIED");
    }
    if (!input.venue.trim() || !input.date || !input.startTime || !input.expectedEndTime) {
      throw new RepositoryError("Venue, date, start time, and expected end time are required.", "VALIDATION_ERROR");
    }
    if (input.expectedEndTime <= input.startTime) {
      throw new RepositoryError("Expected end time must be after start time.", "VALIDATION_ERROR");
    }
    const created: AttendanceSession = {
      id: `session-created-${Date.now()}`,
      type: "event",
      eventId: input.eventId,
      title: `${event.title} Attendance`,
      mode: "required",
      status: "active",
      startsAt: `${input.date}T${input.startTime}:00.000Z`,
      endsAt: `${input.date}T${input.expectedEndTime}:00.000Z`,
      lateCutoffAt: addMinutes(`${input.date}T${input.startTime}:00.000Z`, systemSettingsState.attendanceLateCutoffMinutes),
      attendanceWindowStartAt: addMinutes(`${input.date}T${input.startTime}:00.000Z`, -5),
      attendanceWindowEndAt: `${input.date}T${input.expectedEndTime}:00.000Z`,
      createdByUserId: currentContext.actorUserId
    };
    attendanceSessionState = [created, ...attendanceSessionState];
    auditLogState = [
      {
        id: `audit-event-session-created-${Date.now()}`,
        actorUserId: currentContext.actorUserId,
        action: "event_session.started",
        targetType: "attendance_session",
        targetId: created.id,
        timestamp: new Date().toISOString(),
        metadata: { eventId: input.eventId, attendanceMode: input.attendanceMode, venue: input.venue }
      },
      ...auditLogState
    ];
    return created;
  },
  async endAttendanceSession(input: EndAttendanceSessionInput, context) {
    await beforeRead("attendanceSessions", context, ["faculty", "organizer", "admin"]);
    const currentContext = contextOrDefault(context);
    if (!input.reason.trim()) {
      throw new RepositoryError("A reason is required to end this session.", "VALIDATION_ERROR");
    }
    const session = getOrThrow(attendanceSessionState, input.sessionId, "Attendance session");
    if (!isSessionInFacultyScope(session, currentContext)) {
      throw new RepositoryError("Faculty can only end assigned class sessions.", "PERMISSION_DENIED");
    }
    if (!isSessionInOrganizerScope(session, currentContext)) {
      throw new RepositoryError("Organizers can only end their own event sessions.", "PERMISSION_DENIED");
    }
    const endedAt = new Date().toISOString();
    const expectedStudentIds = expectedStudentIdsForSession(session);
    const generatedAbsences: AttendanceRecord[] = expectedStudentIds
      .filter((studentId) => !attendanceRecordState.some((record) => record.sessionId === session.id && record.studentId === studentId && ["present", "late", "excused"].includes(record.status)))
      .map((studentId) => ({
        id: `record-absent-${session.id}-${studentId}-${Date.now()}`,
        sessionId: session.id,
        studentId,
        status: "absent" as const,
        verificationMethod: "manual" as const,
        recordedAt: endedAt,
        recordedByUserId: currentContext.actorUserId,
        note: "Generated absence at session completion"
      }));
    attendanceRecordState = [...generatedAbsences, ...attendanceRecordState];
    const updated = { ...session, status: "completed" as const, endsAt: endedAt };
    attendanceSessionState = attendanceSessionState.map((entry) => (entry.id === input.sessionId ? updated : entry));
    auditLogState = [
      {
        id: `audit-session-ended-${Date.now()}`,
        actorUserId: currentContext.actorUserId,
        action: "session.completed",
        targetType: "attendance_session",
        targetId: input.sessionId,
        timestamp: new Date().toISOString(),
        metadata: { reason: input.reason, generatedAbsences: generatedAbsences.length }
      },
      ...auditLogState
    ];
    if (generatedAbsences.length) {
      addSafeAudit(currentContext, "attendance.absences_generated", "attendance_session", input.sessionId, { count: generatedAbsences.length });
    }
    return updated;
  }
};

export const simulatedAttendanceRecordRepository: AttendanceRecordRepository = {
  async listAttendanceRecords(query, context) {
    await beforeRead("attendanceRecords", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    const items = filterAttendanceRecords(query).filter((record) => {
        const session = attendanceSessionState.find((entry) => entry.id === record.sessionId);
        return session
          ? isSessionInActorScope(session, currentContext) &&
              (currentContext.actorRole !== "student" || record.studentId === student?.id)
          : false;
      });
    return currentContext.actorRole === "faculty" || currentContext.actorRole === "organizer" || currentContext.actorRole === "student"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  },
  async getAttendanceRecordById(recordId, context) {
    await beforeRead("attendanceRecords", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const record = getOrThrow(attendanceRecordState, recordId, "Attendance record");
    const session = attendanceSessionState.find((entry) => entry.id === record.sessionId);
    const student = getStudentForContext(currentContext);
    if (session && !isSessionInActorScope(session, currentContext)) {
      throw new RepositoryError("Attendance record is outside the signed-in user's scope.", "PERMISSION_DENIED");
    }
    if (currentContext.actorRole === "student" && record.studentId !== student?.id) {
      throw new RepositoryError("Students can only access their own attendance records.", "PERMISSION_DENIED");
    }
    return record;
  },
  async recordCredentialAttendance(input, context) {
    await beforeRead("attendanceRecords", context, ["faculty", "organizer"]);
    const currentContext = contextOrDefault(context);
    return simulateAttendance(input, input.method, currentContext);
  },
  async recordManualAttendance(input, context) {
    await beforeRead("attendanceRecords", context, ["faculty", "organizer"]);
    const currentContext = contextOrDefault(context);
    return simulateAttendance(input, "manual", currentContext);
  },
  async submitLateReason(input, context) {
    await beforeRead("attendanceRecords", context, ["student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    const index = attendanceRecordState.findIndex((record) => record.id === input.attendanceRecordId);
    if (index < 0) {
      throw new RepositoryError("Attendance record was not found.", "NOT_FOUND");
    }
    const record = attendanceRecordState[index];
    if (record.studentId !== student?.id || record.status !== "late") {
      throw new RepositoryError("Students can only submit late reasons for their own late records.", "PERMISSION_DENIED");
    }
    const option = (await this.listLateReasonOptions()).find((entry) => entry.id === input.reasonOptionId);
    if (!option) throw new RepositoryError("Invalid late reason option.", "VALIDATION_ERROR");
    const updated = { ...record, lateReasonCategory: option.label, note: record.note ?? `Late reason: ${option.label}` };
    attendanceRecordState[index] = updated;
    return updated;
  },
  async listFinalizedEventYears(context) {
    await beforeRead("attendanceRecords", context, ["student"]);
    const student = getStudentForContext(contextOrDefault(context));
    return Array.from(new Set(
      attendanceRecordState
        .filter((record) => record.studentId === student?.id && ["present", "late", "absent", "excused"].includes(record.status))
        .map((record) => new Date(record.recordedAt).getFullYear())
        .filter((year) => Number.isInteger(year))
    )).sort((left, right) => right - left);
  },
  async getStudentDashboardSummary(context) {
    await beforeRead("attendanceRecords", context, ["student"]);
    const student = getStudentForContext(contextOrDefault(context));
    const records = attendanceRecordState.filter((record) => record.studentId === student?.id);
    const tasks = records.flatMap((record): StudentDashboardTask[] => {
      const session = attendanceSessionState.find((entry) => entry.id === record.sessionId);
      const event = eventState.find((entry) => entry.id === session?.eventId);
      if (!session?.eventId || !event) return [];

      const lateReason = record.lateReasonCategory
        ?? (record.note?.startsWith("Late reason:") ? record.note.replace("Late reason:", "").trim() : undefined);
      if (record.status === "late" && !lateReason) {
        return [{
          id: `late-reason-${record.id}`,
          kind: "late_reason" as const,
          eventId: session.eventId,
          attendanceRecordId: record.id,
          title: event.title,
          code: event.code,
          category: event.category,
          status: record.status,
          startsAt: session.startsAt,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }];
      }

      const feedbackTaskId = `feedback-task-${record.id}`;
      const feedbackComplete = completedFeedbackTaskIds.has(feedbackTaskId) || Boolean(record.note?.includes("Feedback submitted"));
      if (["present", "late"].includes(record.status) && !feedbackComplete) {
        return [{
          id: feedbackTaskId,
          kind: "feedback" as const,
          eventId: session.eventId,
          attendanceRecordId: record.id,
          title: event.title,
          code: event.code,
          category: event.category,
          status: record.status,
          startsAt: session.startsAt,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        }];
      }
      return [];
    });
    const rejectedCorrections = correctionRequestState.filter((request) => request.studentId === student?.id && request.status === "rejected");
    const count = (status: string) => records.filter((record) => record.status === status).length;
    const presentCount = count("present");
    const lateCount = count("late");
    const totalCount = records.length;
    return {
      totalCount,
      presentCount,
      lateCount,
      absentCount: count("absent"),
      excusedCount: count("excused"),
      attendedCount: presentCount + lateCount,
      attendanceRate: totalCount ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0,
      lateReasonTaskCount: tasks.filter((task) => task.kind === "late_reason").length,
      feedbackTaskCount: tasks.filter((task) => task.kind === "feedback").length,
      rejectedCorrectionCount: rejectedCorrections.length,
      pendingTaskCount: tasks.length + rejectedCorrections.length,
      tasks
    };
  },
  async listLateReasonOptions() {
    return [
      { id: "traffic_commute", code: "traffic_commute", defaultLabel: "Traffic / Commute", label: "Traffic / Commute", locale: "en", sortOrder: 10, isActive: true },
      { id: "class_academic_conflict", code: "class_academic_conflict", defaultLabel: "Class or Academic Conflict", label: "Class or Academic Conflict", locale: "en", sortOrder: 20, isActive: true },
      { id: "personal_health", code: "personal_health", defaultLabel: "Personal / Health", label: "Personal / Health", locale: "en", sortOrder: 30, isActive: true },
      { id: "weather_force_majeure", code: "weather_force_majeure", defaultLabel: "Weather / Force Majeure", label: "Weather / Force Majeure", locale: "en", sortOrder: 40, isActive: true },
      { id: "other", code: "other", defaultLabel: "Other", label: "Other", locale: "en", sortOrder: 50, isActive: true }
    ];
  }
};

export const simulatedAttendanceAttemptRepository: AttendanceAttemptRepository = {
  async listAttendanceAttempts(query, context) {
    await beforeRead("attendanceAttempts", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    const items = attendanceAttemptState.filter(
        (attempt) =>
          matchesSearch([attempt.message], query?.search) &&
          (!query?.classId || attendanceSessionFixtures.find((session) => session.id === attempt.sessionId)?.classId === query.classId) &&
          (!query?.eventId || attendanceSessionFixtures.find((session) => session.id === attempt.sessionId)?.eventId === query.eventId) &&
          (currentContext.actorRole !== "student" || attempt.studentId === student?.id)
      );
    return currentContext.actorRole === "student" ? paginateList(items, query) : paginateOrThrowEmpty(items, query);
  }
};

export const simulatedCorrectionRequestRepository: CorrectionRequestRepository = {
  async listCorrectionRequests(query, context) {
    await beforeRead("correctionRequests", context, ["faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const allowedClassIds = currentContext.actorRole === "faculty" ? facultyClassIds(currentContext) : undefined;
    const allowedEventIds = currentContext.actorRole === "organizer" ? organizerEventIds(currentContext) : undefined;
    const student = getStudentForContext(currentContext);
    const items = correctionRequestState.filter(
        (request) =>
          matchesSearch([request.reason, request.status, request.studentId], query?.search) &&
          (!query?.classId || request.classId === query.classId) &&
          (!query?.eventId || request.eventId === query.eventId) &&
          (!allowedClassIds || Boolean(request.classId && allowedClassIds.includes(request.classId))) &&
          (!allowedEventIds || Boolean(request.eventId && allowedEventIds.includes(request.eventId))) &&
          (currentContext.actorRole !== "student" || request.studentId === student?.id)
      );
    return currentContext.actorRole === "faculty" || currentContext.actorRole === "organizer" || currentContext.actorRole === "student"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  },
  async createCorrectionRequest(input: CreateCorrectionRequestInput, context) {
    await beforeRead("correctionRequests", context, ["student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    if (!input.reason.trim()) {
      throw new RepositoryError("Correction request reason is required.", "VALIDATION_ERROR");
    }
    if (currentContext.actorRole === "student") {
      if (!student || input.studentId !== student.id) {
        throw new RepositoryError("Students can only submit correction requests for themselves.", "PERMISSION_DENIED");
      }
      const record = attendanceRecordState.find((entry) => entry.id === input.attendanceRecordId)
        ?? attendanceRecordFixtures.find((entry) => entry.id === input.attendanceRecordId);
      if (!record) {
        throw new RepositoryError("Attendance record was not found.", "NOT_FOUND");
      }
      if (record.studentId !== student.id) {
        throw new RepositoryError("Selected attendance record does not belong to this student.", "PERMISSION_DENIED");
      }
      const duplicate = correctionRequestState.some(
        (request) =>
          request.studentId === student.id &&
          request.attendanceRecordId === input.attendanceRecordId &&
          request.requestedStatus === input.requestedStatus &&
          request.status === "pending"
      );
      if (duplicate) {
        throw new RepositoryError("A pending request already exists for this attendance record and request type.", "VALIDATION_ERROR");
      }
      if (input.reason.trim().length < 12) {
        throw new RepositoryError("Explanation must be at least 12 characters.", "VALIDATION_ERROR");
      }
    }
    const created: CorrectionRequest = {
      id: `correction-created-${Date.now()}`,
      ...input,
      status: "pending",
      requestedAt: new Date().toISOString()
    };
    correctionRequestState = [created, ...correctionRequestState];
    auditLogState = [
      {
        id: `audit-correction-created-${Date.now()}`,
        actorUserId: currentContext.actorUserId,
        action: "correction.created",
        targetType: "correction_request",
        targetId: created.id,
        timestamp: new Date().toISOString(),
        metadata: { requestedStatus: created.requestedStatus }
      },
      ...auditLogState
    ];
    return created;
  },
  async reviewCorrectionRequest(input: ReviewCorrectionRequestInput, context) {
    await beforeRead("correctionRequests", context, ["faculty", "organizer"]);
    const currentContext = contextOrDefault(context);
    if (input.status === "rejected" && !input.reason?.trim()) {
      throw new RepositoryError("A rejection reason is required.", "VALIDATION_ERROR");
    }
    const request = getOrThrow(correctionRequestState, input.requestId, "Correction request");
    if (currentContext.actorRole === "faculty" && (!request.classId || !facultyClassIds(currentContext).includes(request.classId))) {
      throw new RepositoryError("Faculty can only review requests for assigned classes.", "PERMISSION_DENIED");
    }
    if (currentContext.actorRole === "organizer" && (!request.eventId || !organizerEventIds(currentContext).includes(request.eventId))) {
      throw new RepositoryError("Organizers can only review requests for their own events.", "PERMISSION_DENIED");
    }
    const updated = {
      ...request,
      status: input.status,
      reviewedByUserId: currentContext.actorUserId,
      reviewedAt: new Date().toISOString()
    };
    correctionRequestState = correctionRequestState.map((entry) => (entry.id === input.requestId ? updated : entry));
    auditLogState = [
      {
        id: `audit-correction-${Date.now()}`,
        actorUserId: currentContext.actorUserId,
        action: `correction.${input.status}`,
        targetType: "correction_request",
        targetId: input.requestId,
        timestamp: new Date().toISOString(),
        metadata: { reason: input.reason ?? "Approved" }
      },
      ...auditLogState
    ];
    return updated;
  }
};

export const simulatedCredentialRequestRepository: CredentialRequestRepository = {
  async listCredentialRequests(query, context) {
    await beforeRead("credentialRequests", context, ["admin", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    const ownedStudentIds = organizerStudentIds(currentContext);
    const items = credentialRequestState.filter((request) => (
      matchesSearch([request.reason, request.status, request.credentialType, request.requestType], query?.search) &&
      (currentContext.actorRole !== "student" ? currentContext.actorRole !== "organizer" || ownedStudentIds.has(request.studentId) : request.studentId === student?.id)
    ));
    return paginateList(items, query);
  },
  async createCredentialRequest(input: CreateCredentialRequestInput, context) {
    await beforeRead("credentialRequests", context, ["student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    if (!student || input.studentId !== student.id) {
      throw new RepositoryError("Students can only submit their own credential requests.", "PERMISSION_DENIED");
    }
    const duplicatePending = credentialRequestState.some((request) =>
      request.studentId === input.studentId &&
      request.credentialType === input.credentialType &&
      request.requestType === input.requestType &&
      request.status === "pending"
    );
    if (duplicatePending) {
      throw new RepositoryError("A pending request for this concern already exists.", "VALIDATION_ERROR");
    }
    const created: CredentialRequest = {
      id: `credential-request-${Date.now()}`,
      studentId: input.studentId,
      credentialType: input.credentialType,
      requestType: input.requestType,
      reason: input.reason,
      status: "pending",
      requestedAt: new Date().toISOString()
    };
    credentialRequestState = [created, ...credentialRequestState];
    return created;
  },
  async reviewCredentialRequest(input: ReviewCredentialRequestInput, context) {
    await beforeRead("credentialRequests", context, ["admin", "organizer"]);
    const existing = credentialRequestState.find((request) => request.id === input.requestId);
    if (!existing) {
      throw new RepositoryError("Credential request was not found.", "NOT_FOUND");
    }
    if (existing.status !== "pending") {
      throw new RepositoryError("Credential request has already been reviewed.", "VALIDATION_ERROR");
    }
    const updated: CredentialRequest = {
      ...existing,
      status: input.status,
      reviewedByUserId: contextOrDefault(context).actorUserId,
      reviewedAt: new Date().toISOString(),
      reviewRemarks: input.remarks
    };
    credentialRequestState = credentialRequestState.map((request) => request.id === input.requestId ? updated : request);
    return updated;
  }
};

export const simulatedStudentCredentialRepository: StudentCredentialRepository = {
  async listStudentCredentialStatuses(context, studentIds) {
    await beforeRead("studentCredentials", context, ["admin", "organizer"]);
    if (context?.actorRole === "organizer" && !studentIds?.length) return [];
    return [];
  },
  async getStudentCredentialStatus(studentId, context) {
    await beforeRead("studentCredentials", context, ["student", "admin", "organizer"]);
    const currentContext = contextOrDefault(context);
    if (currentContext.actorRole === "organizer" && !organizerStudentIds(currentContext).has(studentId)) {
      throw new RepositoryError("Organizers can only access credentials for participants in their own events.", "PERMISSION_DENIED");
    }
    return { studentId };
  },
  async issueQrCredential(input, context) {
    await beforeRead("studentCredentials", context, ["admin", "organizer"]);
    const currentContext = contextOrDefault(context);
    if (currentContext.actorRole === "organizer" && !organizerStudentIds(currentContext).has(input.studentId)) {
      throw new RepositoryError("Organizers can only manage credentials for participants in their own events.", "PERMISSION_DENIED");
    }
    return {
      studentId: input.studentId,
      qrCredential: {
        id: `qr-${input.studentId}`,
        studentId: input.studentId,
        tokenHash: `mock-${input.studentId}`,
        status: "activated",
        issuedAt: new Date().toISOString(),
        expiresAt: input.expiresAt
      }
    };
  },
  async enrollFacialProfile(input, context) {
    await beforeRead("studentCredentials", context, ["admin", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    if (currentContext.actorRole === "organizer" && !organizerStudentIds(currentContext).has(input.studentId)) {
      throw new RepositoryError("Organizers can only manage credentials for participants in their own events.", "PERMISSION_DENIED");
    }
    return {
      studentId: input.studentId,
      facialProfile: {
        id: `face-${input.studentId}`,
        studentId: input.studentId,
        status: "activated",
        enrollmentReference: input.enrollmentReference ?? `face-${input.studentId}`,
        enrolledAt: new Date().toISOString(),
        consentRecordedAt: new Date().toISOString()
      }
    };
  },
  async setCredentialStatus(input, context) {
    await beforeRead("studentCredentials", context, ["admin", "organizer"]);
    const currentContext = contextOrDefault(context);
    if (currentContext.actorRole === "organizer" && !organizerStudentIds(currentContext).has(input.studentId)) {
      throw new RepositoryError("Organizers can only manage credentials for participants in their own events.", "PERMISSION_DENIED");
    }
    return { studentId: input.studentId };
  }
};

export const simulatedEventFeedbackRepository: EventFeedbackRepository = {
  async listEventObjectives(eventId) {
    return eventObjectiveState
      .filter((entry) => entry.eventId === eventId)
      .sort((a, b) => a.order - b.order)
      .map((entry) => ({
        id: entry.id,
        eventId: entry.eventId,
        order: entry.order,
        text: entry.text
      }));
  },
  async listStudentFeedback() {
    return [];
  },
  async listStudentFeedbackTasks(studentId) {
    return attendanceRecordState.flatMap((record): EventFeedbackTask[] => {
      const session = attendanceSessionState.find((entry) => entry.id === record.sessionId);
      if (record.studentId !== studentId || !session?.eventId || !["present", "late"].includes(record.status)) return [];
      const id = `feedback-task-${record.id}`;
      const status = completedFeedbackTaskIds.has(id) || Boolean(record.note?.includes("Feedback submitted")) ? "completed" : "pending";
      const completedAt = record.checkedOutAt ?? session.endsAt ?? record.recordedAt;
      return [{
        id,
        attendanceRecordId: record.id,
        eventId: session.eventId,
        studentId: record.studentId,
        status,
        dueAt: status === "pending" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : new Date(new Date(completedAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        completedAt: status === "completed" ? completedAt : undefined,
        objectives: eventObjectiveState.filter((objective) => objective.eventId === session.eventId).map((objective) => ({ ...objective }))
      }];
    });
  },
  async submitEventFeedback(input) {
    completedFeedbackTaskIds.add(input.taskId);
    return {
      id: `feedback-${input.eventId}-${input.studentId}`,
      eventId: input.eventId,
      studentId: input.studentId,
      attendanceRecordId: input.attendanceRecordId,
      comment: input.comment,
      submittedAt: new Date().toISOString(),
      ratings: input.ratings.map((rating, index) => ({
        id: `feedback-rating-${index + 1}`,
        feedbackId: `feedback-${input.eventId}-${input.studentId}`,
        objectiveId: rating.objectiveId,
        rating: rating.rating
      }))
    };
  },
  async listAllEventObjectives(query) {
    return paginateList([], query);
  },
  async listAllEventSummarySnapshots(query) {
    return paginateList([], query);
  },
  async listAllEventFeedback(query) {
    return paginateList([], query);
  }
};

export const simulatedReportRepository: ReportRepository = {
  async listReports(query, context) {
    await beforeRead("reports", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const allowedClassIds = currentContext.actorRole === "faculty" ? facultyClassIds(currentContext) : undefined;
    const allowedEventIds = currentContext.actorRole === "organizer" ? organizerEventIds(currentContext) : undefined;
    const student = getStudentForContext(currentContext);
    const items = reportFixtures.filter(
        (report: Report) =>
          matchesSearch([report.title, report.scope, report.status], query?.search) &&
          (!allowedClassIds || allowedClassIds.includes(report.scope) || report.requestedByUserId === currentContext.actorUserId) &&
          (!allowedEventIds || allowedEventIds.includes(report.scope) || report.requestedByUserId === currentContext.actorUserId) &&
          (currentContext.actorRole !== "student" || report.scope === student?.id || report.requestedByUserId === currentContext.actorUserId)
      );
    return currentContext.actorRole === "faculty" || currentContext.actorRole === "organizer" || currentContext.actorRole === "student"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  }
};

export const simulatedNotificationRepository: NotificationRepository = {
  async listNotifications(query, context) {
    await beforeRead("notifications", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    return paginateList(
      notificationState.filter(
        (notification) =>
          notification.userId === currentContext.actorUserId &&
          matchesSearch([notification.title, notification.body, notification.status, notification.type], query?.search) &&
          (!query?.notificationStatus || notification.status === query.notificationStatus) &&
          (!query?.notificationType || notification.type === query.notificationType)
      ),
      query
    );
  },
  async markNotificationRead(notificationId, context) {
    await beforeRead("notifications", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const notification = notificationState.find((entry) => entry.id === notificationId);
    if (!notification) {
      throw new RepositoryError("Notification was not found.", "NOT_FOUND");
    }
    if (notification.userId !== currentContext.actorUserId) {
      throw new RepositoryError("Cannot update another user's notification.", "PERMISSION_DENIED");
    }
    notificationState = notificationState.map((entry) =>
      entry.id === notificationId ? { ...entry, status: "read" } : entry
    );
    return getOrThrow(notificationState, notificationId, "Notification");
  },
  async markAllNotificationsRead(context) {
    await beforeRead("notifications", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    notificationState = notificationState.map((entry) =>
      entry.userId === currentContext.actorUserId ? { ...entry, status: "read" } : entry
    );
    return notificationState.filter((entry) => entry.userId === currentContext.actorUserId);
  },
  async getPreferences(context) {
    const currentContext = contextOrDefault(context);
    return notificationPreferencesState[currentContext.actorUserId] ?? {
      reminders: true,
      eventUpdates: true,
      reports: true,
      attendanceExceptions: true
    };
  },
  async updatePreferences(input, context) {
    const currentContext = contextOrDefault(context);
    const current = await this.getPreferences(context);
    const updated = { ...current, ...input };
    notificationPreferencesState[currentContext.actorUserId] = updated;
    return updated;
  }
};

export const simulatedAuditLogRepository: AuditLogRepository = {
  async listAuditLogs(query, context) {
    await beforeRead("auditLogs", context, ["admin", "organizer"]);
    const currentContext = contextOrDefault(context);
    return paginate(auditLogState.filter((log) =>
      matchesSearch([log.action, log.targetType, log.targetId], query?.search) &&
      (currentContext.actorRole === "admin" || log.actorUserId === currentContext.actorUserId)
    ), query);
  },
  async logClientAction(input, context) {
    const currentContext = contextOrDefault(context);
    const metadata = Object.fromEntries(
      Object.entries(input.metadata ?? {}).filter(
        (entry): entry is [string, string | number | boolean] =>
          typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean"
      )
    );
    addSafeAudit(currentContext, input.action, input.targetType, input.targetId || "", metadata);
  }
};

export const simulatedAnalyticsMlRepository: AnalyticsMlRepository = {
  async listMlPredictions(query, context) {
    await beforeRead("analyticsMl", context, ["admin", "faculty", "organizer"]);
    const currentContext = contextOrDefault(context);
    const allowedClassIds = currentContext.actorRole === "faculty" ? facultyClassIds(currentContext) : undefined;
    const allowedEventIds = currentContext.actorRole === "organizer" ? organizerEventIds(currentContext) : undefined;
    const items = mlPredictionFixtures.filter(
        (prediction) =>
          matchesSearch([prediction.type, prediction.riskLevel, prediction.patternLabel], query?.search) &&
          (!query?.classId || prediction.classId === query.classId) &&
          (!query?.eventId || prediction.eventId === query.eventId) &&
          (!allowedClassIds || Boolean(prediction.classId && allowedClassIds.includes(prediction.classId))) &&
          (!allowedEventIds || Boolean(prediction.eventId && allowedEventIds.includes(prediction.eventId)))
      );
    return currentContext.actorRole === "faculty" || currentContext.actorRole === "organizer"
      ? paginateList(items, query)
      : paginateOrThrowEmpty(items, query);
  }
};

export const simulatedSystemSettingsRepository: SystemSettingsRepository = {
  async getSettings(context) {
    await beforeRead("systemSettings", context, ["admin"]);
    return { ...systemSettingsState };
  },
  async updateSettings(input: UpdateSystemSettingsInput, context) {
    await beforeRead("systemSettings", context, ["admin"]);
    if (
      input.attendanceLateCutoffMinutes !== undefined &&
      (input.attendanceLateCutoffMinutes < 0 || input.attendanceLateCutoffMinutes > 120)
    ) {
      throw new RepositoryError("Late cutoff must be between 0 and 120 minutes.", "VALIDATION_ERROR");
    }
    if (
      input.defaultSessionDurationMinutes !== undefined &&
      (input.defaultSessionDurationMinutes < 15 || input.defaultSessionDurationMinutes > 480)
    ) {
      throw new RepositoryError("Default session duration must be between 15 and 480 minutes.", "VALIDATION_ERROR");
    }
    systemSettingsState = {
      ...systemSettingsState,
      ...input,
      updatedAt: new Date().toISOString()
    };
    return { ...systemSettingsState };
  }
};

function requireHealthReason(reason: string) {
  if (!reason.trim()) {
    throw new RepositoryError("A reason is required for system recovery actions.", "VALIDATION_ERROR");
  }
}

export const simulatedSystemHealthRepository: SystemHealthRepository = {
  async getHealthSnapshot(context): Promise<SystemHealthSnapshot> {
    await beforeRead("systemHealth", context, ["admin"]);
    const checkedAt = new Date().toISOString();
    return {
      checks: [
        { key: "database", label: "Supabase connectivity", status: "healthy", message: "The application data layer is responding.", checkedAt },
        { key: "auth", label: "Authentication status", status: "healthy", message: "The administrator session is active.", checkedAt },
        { key: "storage", label: "Storage availability", status: "healthy", message: "Configured storage access is available.", checkedAt },
        { key: "edge-functions", label: "Edge Function availability", status: "healthy", message: "The configured application functions are available.", checkedAt }
      ],
      recentErrors: reportFixtures.filter((report) => report.status === "failed").map((report) => ({
        id: report.id,
        category: "application_error",
        severity: "critical",
        message: `${report.title} report generation failed.`,
        createdAt: report.generatedAt ?? "2026-06-26T08:00:00.000Z",
        referenceId: report.id
      })),
      failedNotifications: failedNotificationState.filter((job) => job.status === "failed"),
      stuckSessions: attendanceSessionState.filter((session) => session.status === "active" && new Date(session.endsAt ?? session.startsAt).getTime() < Date.now() - 30 * 60_000),
      consistencyIssues: [],
      lastSuccessfulEmailAt: "2026-09-16T08:00:00.000Z"
    };
  },
  async retryFailedNotification(input, context) {
    await beforeRead("systemHealth", context, ["admin"]);
    requireHealthReason(input.reason);
    const job = failedNotificationState.find((entry) => entry.id === input.jobId);
    if (!job) throw new RepositoryError("The failed notification could not be found.", "NOT_FOUND");
    if (job.source !== input.source) throw new RepositoryError("The failed notification source is invalid.", "VALIDATION_ERROR");
    if (job.status !== "failed") throw new RepositoryError("Only failed notifications can be retried.", "VALIDATION_ERROR");
    const updated = { ...job, status: "retrying" as const, updatedAt: new Date().toISOString() };
    failedNotificationState = failedNotificationState.map((entry) => entry.id === job.id ? updated : entry);
    addSafeAudit(contextOrDefault(context), "system.notification_retry", "notification_job", job.id, { reasonProvided: true });
    return updated;
  },
  async recoverAttendanceSession(input, context) {
    await beforeRead("systemHealth", context, ["admin"]);
    requireHealthReason(input.reason);
    const session = attendanceSessionState.find((entry) => entry.id === input.sessionId);
    if (!session) throw new RepositoryError("The attendance session could not be found.", "NOT_FOUND");
    if (session.status !== "active") throw new RepositoryError("Only active stuck sessions can be recovered.", "VALIDATION_ERROR");
    const recovered = { ...session, status: "completed" as const, endsAt: new Date().toISOString() };
    attendanceSessionState = attendanceSessionState.map((entry) => entry.id === session.id ? recovered : entry);
    addSafeAudit(contextOrDefault(context), "system.attendance_session_recovered", "attendance_session", session.id, { reasonProvided: true });
    return recovered;
  },
  async finishEvent(input, context) {
    await beforeRead("systemHealth", context, ["admin"]);
    requireHealthReason(input.reason);
    const event = eventState.find((entry) => entry.id === input.eventId);
    if (!event) throw new RepositoryError("The event could not be found.", "NOT_FOUND");
    const updated = { ...event, status: "completed" as const };
    eventState = eventState.map((entry) => entry.id === input.eventId ? updated : entry);
    attendanceSessionState = attendanceSessionState.map((entry) => entry.eventId === input.eventId && entry.status === "active" ? { ...entry, status: "completed" as const, endsAt: new Date().toISOString() } : entry);
    addSafeAudit(contextOrDefault(context), "system.event_finished", "event", input.eventId, { reasonProvided: true });
    return updated;
  },
  async runDataConsistencyCheck(context) {
    await beforeRead("systemHealth", context, ["admin"]);
    const issues: SystemHealthIssue[] = [];
    const duplicateRecords = attendanceRecordState.filter((record, index, records) => records.findIndex((entry) => entry.sessionId === record.sessionId && entry.studentId === record.studentId) !== index);
    if (duplicateRecords.length) {
      issues.push({ id: "consistency-duplicate-attendance", category: "consistency", severity: "critical", message: "Duplicate attendance records were found for a session and student.", createdAt: new Date().toISOString() });
    }
    addSafeAudit(contextOrDefault(context), "system.data_consistency_check", "system", "data", { issueCount: issues.length });
    return issues;
  }
};

export const simulatedRepositoryRegistry: RepositoryRegistry = {
  authentication: simulatedAuthenticationRepository,
  userManagement: simulatedUserManagementRepository,
  academicManagement: simulatedAcademicManagementRepository,
  classRosters: simulatedClassRosterRepository,
  eventManagement: simulatedEventManagementRepository,
  attendanceSessions: simulatedAttendanceSessionRepository,
  attendanceRecords: simulatedAttendanceRecordRepository,
  attendanceAttempts: simulatedAttendanceAttemptRepository,
  correctionRequests: simulatedCorrectionRequestRepository,
  credentialRequests: simulatedCredentialRequestRepository,
  studentCredentials: simulatedStudentCredentialRepository,
  eventFeedback: simulatedEventFeedbackRepository,
  reports: simulatedReportRepository,
  notifications: simulatedNotificationRepository,
  auditLogs: simulatedAuditLogRepository,
  analyticsMl: simulatedAnalyticsMlRepository,
  systemSettings: simulatedSystemSettingsRepository,
  systemHealth: simulatedSystemHealthRepository
};
