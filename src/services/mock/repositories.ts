import {
  attendanceRecordFixtures,
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
  nfcCredentialRequestFixtures,
  nfcCredentialFixtures,
  nfcReaderFixtures,
  nfcTapAttemptFixtures,
  notificationFixtures,
  organizerProfileFixtures,
  programFixtures,
  reportFixtures,
  semesterFixtures,
  studentFixtures,
  systemSettingsFixture,
  adminProfileFixtures,
  userFixtures
} from "@/mocks/fixtures";
import type {
  AddRosterStudentInput,
  AcademicManagementRepository,
  AnalyticsMlRepository,
  AttendanceScanInput,
  AttendanceSimulationResult,
  AttendanceRecordRepository,
  AttendanceSessionRepository,
  AuditLogRepository,
  AuthenticationRepository,
  ClassRosterRepository,
  CorrectionRequestRepository,
  CreateClassSessionInput,
  CreateCorrectionRequestInput,
  CreateEventInput,
  CreateEventSessionInput,
  CreateNfcCredentialRequestInput,
  EndAttendanceSessionInput,
  EventManagementRepository,
  ManualAttendanceInput,
  NfcCredentialRequestRepository,
  NfcCredentialRepository,
  NfcReaderRepository,
  NotificationRepository,
  ReportRepository,
  RepositoryRegistry,
  ReviewCorrectionRequestInput,
  SystemSettingsRepository,
  UpdateSystemSettingsInput,
  UserManagementRepository
} from "@/services/contracts";
import {
  applyMockMode,
  assertRole,
  defaultRepositoryContext,
  matchesSearch,
  paginate,
  RepositoryError,
  type RepositoryContext
} from "@/services/mock/mockRepositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
  Class,
  CorrectionRequest,
  Event,
  EventParticipant,
  NfcCredential,
  NfcCredentialRequest,
  Notification,
  Report,
  Student,
  User
} from "@/types/domain";
import type { AttendanceStatus, EventStatus, NfcCredentialStatus, NfcReaderStatus, VerificationMethod } from "@/types/enums";
import type { ListQuery, PaginatedResult } from "@/types/filters";

function contextOrDefault(context?: RepositoryContext) {
  return context ?? defaultRepositoryContext;
}

async function beforeRead(repositoryName: string, context?: RepositoryContext, roles: RepositoryContext["actorRole"][] = ["admin", "faculty", "organizer", "student"]) {
  await applyMockMode(repositoryName);
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
let auditLogState = auditLogFixtures.map((entry) => ({ ...entry }));
let eventState = eventFixtures.map((entry) => ({ ...entry }));
let nfcCredentialState = nfcCredentialFixtures.map((entry) => ({ ...entry }));
let nfcCredentialRequestState: NfcCredentialRequest[] = nfcCredentialRequestFixtures.map((entry) => ({ ...entry }));
let nfcReaderState = nfcReaderFixtures.map((entry) => ({ ...entry }));
let nfcTapAttemptState = nfcTapAttemptFixtures.map((entry) => ({ ...entry }));
let notificationState: Notification[] = notificationFixtures.map((notification) => ({ ...notification }));
let systemSettingsState = { ...systemSettingsFixture };

export function resetMockRepositoryState() {
  classRosterState = classRosterFixtures.map((entry) => ({ ...entry }));
  eventParticipantState = eventParticipantFixtures.map((entry) => ({ ...entry }));
  attendanceSessionState = attendanceSessionFixtures.map((entry) => ({ ...entry }));
  attendanceRecordState = attendanceRecordFixtures.map((entry) => ({ ...entry }));
  correctionRequestState = correctionRequestFixtures.map((entry) => ({ ...entry }));
  auditLogState = auditLogFixtures.map((entry) => ({ ...entry }));
  eventState = eventFixtures.map((entry) => ({ ...entry }));
  nfcCredentialState = nfcCredentialFixtures.map((entry) => ({ ...entry }));
  nfcCredentialRequestState = nfcCredentialRequestFixtures.map((entry) => ({ ...entry }));
  nfcReaderState = nfcReaderFixtures.map((entry) => ({ ...entry }));
  nfcTapAttemptState = nfcTapAttemptFixtures.map((entry) => ({ ...entry }));
  notificationState = notificationFixtures.map((notification) => ({ ...notification }));
  systemSettingsState = { ...systemSettingsFixture };
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
  return nfcTapAttemptState.filter((attempt) => attempt.sessionId === sessionId && attempt.message === message).length;
}

function sessionSummary(sessionId: string) {
  const records = attendanceRecordState.filter((record) => record.sessionId === sessionId);
  return {
    present: records.filter((record) => record.status === "present").length,
    late: records.filter((record) => record.status === "late").length,
    absent: records.filter((record) => record.status === "absent").length,
    duplicateAttempts: countAttempts(sessionId, "Already recorded"),
    failedAttempts: nfcTapAttemptState.filter((attempt) => attempt.sessionId === sessionId && !attempt.accepted).length
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

function addSafeTapAttempt(input: {
  sessionId: string;
  studentId?: string;
  accepted: boolean;
  attemptedAt: string;
  message: string;
  context: RepositoryContext;
}) {
  const reader = nfcReaderState.find((entry) => entry.assignedToUserId === input.context.actorUserId) ?? nfcReaderState[0];
  nfcTapAttemptState = [
    {
      id: `tap-simulated-${Date.now()}`,
      sessionId: input.sessionId,
      readerId: reader.id,
      nfcUid: "SIMULATED-CODE",
      studentId: input.studentId,
      accepted: input.accepted,
      attemptedAt: input.attemptedAt,
      message: input.message
    },
    ...nfcTapAttemptState
  ];
}

function resultFor(input: {
  resultStatus: AttendanceSimulationResult["resultStatus"];
  sessionId: string;
  method: VerificationMethod;
  recordedAt: string;
  safeMessage: string;
  studentId?: string;
  attendanceStatus?: AttendanceStatus;
  attendanceRecord?: AttendanceRecord;
}): AttendanceSimulationResult {
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
}): AttendanceSimulationResult {
  const existing = attendanceRecordState.find((record) => record.sessionId === input.session.id && record.studentId === input.studentId && record.status !== "excused");
  if (existing) {
    addSafeTapAttempt({ sessionId: input.session.id, studentId: input.studentId, accepted: false, attemptedAt: input.occurredAt, message: "Already recorded", context: input.context });
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

  const status = attendanceStatusForTime(input.session, input.occurredAt);
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
  addSafeTapAttempt({ sessionId: input.session.id, studentId: input.studentId, accepted: true, attemptedAt: input.occurredAt, message: "Attendance accepted", context: input.context });
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
  if ("credentialCode" in input) {
    const credential = nfcCredentialState.find((entry) => entry.nfcUid === input.credentialCode.trim());
    if (!credential) {
      addSafeTapAttempt({ sessionId: session.id, accepted: false, attemptedAt: occurredAt, message: "Invalid credential", context });
      addSafeAudit(context, `${method}_attendance.invalid`, "attendance_session", session.id, { method });
      return resultFor({ resultStatus: "Invalid Sticker", sessionId: session.id, method, recordedAt: occurredAt, safeMessage: "The scanned development sticker was not found." });
    }
    studentId = credential.studentId;
    if (credential.status !== "activated") {
      addSafeTapAttempt({ sessionId: session.id, studentId, accepted: false, attemptedAt: occurredAt, message: "Blocked credential", context });
      addSafeAudit(context, `${method}_attendance.blocked`, "attendance_session", session.id, { studentId, status: credential.status, method });
      return resultFor({ resultStatus: "Blocked Sticker", sessionId: session.id, method, recordedAt: occurredAt, safeMessage: "The development sticker is not active.", studentId });
    }
  } else {
    studentId = input.studentId;
    note = `${input.reason}: ${input.remarks}`;
    if (!input.reason.trim() || !input.remarks.trim()) {
      throw new RepositoryError("Student selection, manual reason, and remarks are required.", "VALIDATION_ERROR");
    }
  }

  if (!studentId || !expectedStudentIdsForSession(session).includes(studentId)) {
    if (studentId) {
      addSafeTapAttempt({ sessionId: session.id, studentId, accepted: false, attemptedAt: occurredAt, message: "Student not enrolled", context });
      addSafeAudit(context, `${method}_attendance.not_enrolled`, "attendance_session", session.id, { studentId, method });
    }
    return resultFor({ resultStatus: "Student Not Enrolled", sessionId: session.id, method, recordedAt: occurredAt, safeMessage: "The student is not part of this class or event.", studentId });
  }

  if (!validateSessionWindow(session, occurredAt)) {
    addSafeTapAttempt({ sessionId: session.id, studentId, accepted: false, attemptedAt: occurredAt, message: "Outside attendance window", context });
    addSafeAudit(context, `${method}_attendance.outside_window`, "attendance_session", session.id, { studentId, method });
    return resultFor({ resultStatus: "Outside Attendance Window", sessionId: session.id, method, recordedAt: occurredAt, safeMessage: "The attendance attempt is outside the configured window.", studentId });
  }

  return completeAttendanceRecord({ session, studentId, method, occurredAt, context, note });
}

export const mockAuthenticationRepository: AuthenticationRepository = {
  async listDevelopmentAccounts() {
    await applyMockMode("authentication");
    return userFixtures.map((user) => ({
      userId: user.id,
      role: user.role,
      displayName: user.displayName,
      email: user.email
    }));
  },
  async getSession(context = defaultRepositoryContext) {
    await applyMockMode("authentication");
    const user = getOrThrow(userFixtures, context.actorUserId, "User");
    return {
      userId: user.id,
      role: user.role,
      displayName: user.displayName,
      isAuthenticated: true
    };
  }
};

export const mockUserManagementRepository: UserManagementRepository = {
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
    );
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
  }
};

export const mockAcademicManagementRepository: AcademicManagementRepository = {
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
  }
};

export const mockClassRosterRepository: ClassRosterRepository = {
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

export const mockEventManagementRepository: EventManagementRepository = {
  async listEvents(query, context) {
    await beforeRead("eventManagement", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const items = filterEvents(query).filter((event) => isEventInOrganizerScope(event, currentContext) && isEventInStudentScope(event, currentContext));
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
  async createEvent(input: CreateEventInput, context) {
    await beforeRead("eventManagement", context, ["organizer"]);
    const currentContext = contextOrDefault(context);
    const profile = getOrganizerProfileForContext(currentContext);
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
      status: "pending"
    };
    const participants: EventParticipant[] = input.participantStudentIds.map((studentId) => ({
      id: `participant-${created.id}-${studentId}`,
      eventId: created.id,
      studentId,
      registeredAt: new Date().toISOString()
    }));
    eventState = [created, ...eventState];
    eventParticipantState = [...participants, ...eventParticipantState];
    auditLogState = [
      {
        id: `audit-event-created-${Date.now()}`,
        actorUserId: currentContext.actorUserId,
        action: "event.created",
        targetType: "event",
        targetId: created.id,
        timestamp: new Date().toISOString(),
        metadata: { participantCount: participants.length, attendanceMode: input.attendanceMode }
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
  }
};

export const mockAttendanceSessionRepository: AttendanceSessionRepository = {
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
    await beforeRead("attendanceSessions", context, ["organizer"]);
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
    await beforeRead("attendanceSessions", context, ["faculty", "organizer"]);
    const currentContext = contextOrDefault(context);
    if (!input.reason.trim()) {
      throw new RepositoryError("A reason is required to end this mock session.", "VALIDATION_ERROR");
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
        note: "Generated absence at mock session completion"
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

export const mockAttendanceRecordRepository: AttendanceRecordRepository = {
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
  async simulateCredentialAttendance(input, context) {
    await beforeRead("attendanceRecords", context, ["faculty", "organizer"]);
    const currentContext = contextOrDefault(context);
    return simulateAttendance(input, input.method, currentContext);
  },
  async simulateManualAttendance(input, context) {
    await beforeRead("attendanceRecords", context, ["faculty", "organizer"]);
    const currentContext = contextOrDefault(context);
    return simulateAttendance(input, "manual", currentContext);
  }
};

export const mockNfcCredentialRepository: NfcCredentialRepository = {
  async listNfcCredentials(query, context) {
    await beforeRead("nfcCredentials", context, ["admin", "faculty"]);
    return paginateOrThrowEmpty(
      nfcCredentialState.filter(
        (credential) =>
          matchesSearch([credential.nfcUid, credential.status, credential.studentId], query?.search) &&
          (!query?.credentialStatus || credential.status === query.credentialStatus)
      ),
      query
    );
  },
  async getCredentialForStudent(studentId, context): Promise<NfcCredential | null> {
    await beforeRead("nfcCredentials", context, ["admin", "faculty", "student"]);
    const currentContext = contextOrDefault(context);
    const student = studentFixtures.find((entry) => entry.id === studentId);
    if (currentContext.actorRole === "student" && student?.userId !== currentContext.actorUserId) {
      throw new RepositoryError("Students can only read their own NFC credential.", "PERMISSION_DENIED");
    }
    return nfcCredentialState.find((credential) => credential.studentId === studentId && credential.status === "activated") ?? null;
  },
  async updateCredentialStatus(credentialId, status: NfcCredentialStatus, context) {
    await beforeRead("nfcCredentials", context, ["admin"]);
    const credential = getOrThrow(nfcCredentialState, credentialId, "NFC credential");
    const updated = { ...credential, status };
    nfcCredentialState = nfcCredentialState.map((entry) => (entry.id === credentialId ? updated : entry));
    return updated;
  }
};

export const mockNfcCredentialRequestRepository: NfcCredentialRequestRepository = {
  async listNfcCredentialRequests(query, context) {
    await beforeRead("nfcCredentialRequests", context, ["admin", "student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    const items = nfcCredentialRequestState.filter(
      (request) =>
        matchesSearch([request.type, request.status, request.reason], query?.search) &&
        (currentContext.actorRole !== "student" || request.studentId === student?.id)
    );
    return currentContext.actorRole === "student" ? paginateList(items, query) : paginateOrThrowEmpty(items, query);
  },
  async createNfcCredentialRequest(input: CreateNfcCredentialRequestInput, context) {
    await beforeRead("nfcCredentialRequests", context, ["student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    if (!student || input.studentId !== student.id) {
      throw new RepositoryError("Students can only create NFC requests for their own profile.", "PERMISSION_DENIED");
    }
    if (!input.reason.trim() || input.reason.trim().length < 10) {
      throw new RepositoryError("NFC request reason must be at least 10 characters.", "VALIDATION_ERROR");
    }
    const duplicate = nfcCredentialRequestState.some(
      (request) => request.studentId === input.studentId && request.type === input.type && request.status === "pending"
    );
    if (duplicate) {
      throw new RepositoryError("A pending request of this type already exists.", "VALIDATION_ERROR");
    }
    const created: NfcCredentialRequest = {
      id: `nfc-request-created-${Date.now()}`,
      studentId: input.studentId,
      credentialId: input.credentialId,
      type: input.type,
      status: "pending",
      reason: input.reason,
      requestedAt: new Date().toISOString()
    };
    nfcCredentialRequestState = [created, ...nfcCredentialRequestState];
    auditLogState = [
      {
        id: `audit-nfc-request-${Date.now()}`,
        actorUserId: currentContext.actorUserId,
        action: "nfc_request.created",
        targetType: "nfc_credential_request",
        targetId: created.id,
        timestamp: new Date().toISOString(),
        metadata: { requestType: created.type }
      },
      ...auditLogState
    ];
    return created;
  }
};

export const mockNfcReaderRepository: NfcReaderRepository = {
  async listNfcReaders(query, context) {
    await beforeRead("nfcReaders", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(
      nfcReaderState.filter((reader) => matchesSearch([reader.label, reader.serialNumber, reader.status], query?.search)),
      query
    );
  },
  async listNfcTapAttempts(query, context) {
    await beforeRead("nfcReaders", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    const items = nfcTapAttemptState.filter(
        (attempt) =>
          matchesSearch([attempt.nfcUid, attempt.message], query?.search) &&
          (!query?.classId || attendanceSessionFixtures.find((session) => session.id === attempt.sessionId)?.classId === query.classId) &&
          (!query?.eventId || attendanceSessionFixtures.find((session) => session.id === attempt.sessionId)?.eventId === query.eventId) &&
          (currentContext.actorRole !== "student" || attempt.studentId === student?.id)
      );
    return currentContext.actorRole === "student" ? paginateList(items, query) : paginateOrThrowEmpty(items, query);
  },
  async updateReaderStatus(readerId, status: NfcReaderStatus, context) {
    await beforeRead("nfcReaders", context, ["admin"]);
    const reader = getOrThrow(nfcReaderState, readerId, "NFC reader");
    const updated = { ...reader, status };
    nfcReaderState = nfcReaderState.map((entry) => (entry.id === readerId ? updated : entry));
    return updated;
  }
};

export const mockCorrectionRequestRepository: CorrectionRequestRepository = {
  async listCorrectionRequests(query, context) {
    await beforeRead("correctionRequests", context, ["admin", "faculty", "organizer", "student"]);
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
    await beforeRead("correctionRequests", context, ["student", "faculty", "organizer", "admin"]);
    const currentContext = contextOrDefault(context);
    const student = getStudentForContext(currentContext);
    if (!input.reason.trim()) {
      throw new RepositoryError("Correction request reason is required.", "VALIDATION_ERROR");
    }
    if (currentContext.actorRole === "student") {
      if (!student || input.studentId !== student.id) {
        throw new RepositoryError("Students can only submit correction requests for themselves.", "PERMISSION_DENIED");
      }
      const record = getOrThrow(attendanceRecordFixtures, input.attendanceRecordId, "Attendance record");
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

export const mockReportRepository: ReportRepository = {
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

export const mockNotificationRepository: NotificationRepository = {
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
  }
};

export const mockAuditLogRepository: AuditLogRepository = {
  async listAuditLogs(query, context) {
    await beforeRead("auditLogs", context, ["admin"]);
    return paginate(auditLogState.filter((log) => matchesSearch([log.action, log.targetType, log.targetId], query?.search)), query);
  }
};

export const mockAnalyticsMlRepository: AnalyticsMlRepository = {
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

export const mockSystemSettingsRepository: SystemSettingsRepository = {
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

export const mockRepositoryRegistry: RepositoryRegistry = {
  authentication: mockAuthenticationRepository,
  userManagement: mockUserManagementRepository,
  academicManagement: mockAcademicManagementRepository,
  classRosters: mockClassRosterRepository,
  eventManagement: mockEventManagementRepository,
  attendanceSessions: mockAttendanceSessionRepository,
  attendanceRecords: mockAttendanceRecordRepository,
  nfcCredentials: mockNfcCredentialRepository,
  nfcCredentialRequests: mockNfcCredentialRequestRepository,
  nfcReaders: mockNfcReaderRepository,
  correctionRequests: mockCorrectionRequestRepository,
  reports: mockReportRepository,
  notifications: mockNotificationRepository,
  auditLogs: mockAuditLogRepository,
  analyticsMl: mockAnalyticsMlRepository,
  systemSettings: mockSystemSettingsRepository
};
