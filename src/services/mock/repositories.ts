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
  nfcCredentialFixtures,
  nfcReaderFixtures,
  nfcTapAttemptFixtures,
  notificationFixtures,
  organizerProfileFixtures,
  programFixtures,
  reportFixtures,
  semesterFixtures,
  studentFixtures,
  adminProfileFixtures,
  userFixtures
} from "@/mocks/fixtures";
import type {
  AcademicManagementRepository,
  AnalyticsMlRepository,
  AttendanceRecordRepository,
  AttendanceSessionRepository,
  AuditLogRepository,
  AuthenticationRepository,
  ClassRosterRepository,
  CorrectionRequestRepository,
  CreateCorrectionRequestInput,
  EventManagementRepository,
  NfcCredentialRepository,
  NfcReaderRepository,
  NotificationRepository,
  ReportRepository,
  RepositoryRegistry,
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
  NfcCredential,
  Student,
  User
} from "@/types/domain";
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

function filterEvents(query?: ListQuery): Event[] {
  return eventFixtures.filter(
    (event) =>
      matchesSearch([event.title, event.venue, event.status], query?.search) &&
      (!query?.departmentId || event.departmentId === query.departmentId)
  );
}

function filterAttendanceSessions(query?: ListQuery): AttendanceSession[] {
  return attendanceSessionFixtures.filter(
    (session) =>
      matchesSearch([session.title, session.status, session.type], query?.search) &&
      (!query?.sessionStatus || session.status === query.sessionStatus) &&
      (!query?.classId || session.classId === query.classId) &&
      (!query?.eventId || session.eventId === query.eventId)
  );
}

function filterAttendanceRecords(query?: ListQuery): AttendanceRecord[] {
  return attendanceRecordFixtures.filter((record) => {
    const session = attendanceSessionFixtures.find((entry) => entry.id === record.sessionId);
    return (
      matchesSearch([record.studentId, record.status, record.verificationMethod], query?.search) &&
      (!query?.attendanceStatus || record.status === query.attendanceStatus) &&
      (!query?.classId || session?.classId === query.classId) &&
      (!query?.eventId || session?.eventId === query.eventId)
    );
  });
}

export const mockAuthenticationRepository: AuthenticationRepository = {
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
    await beforeRead("userManagement", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(filterStudents(query), query);
  },
  async listFacultyProfiles(query, context) {
    await beforeRead("userManagement", context, ["admin"]);
    return paginateOrThrowEmpty(
      facultyProfileFixtures.filter((profile) => matchesSearch([profile.employeeNumber, profile.title], query?.search)),
      query
    );
  },
  async listOrganizerProfiles(query, context) {
    await beforeRead("userManagement", context, ["admin"]);
    return paginateOrThrowEmpty(
      organizerProfileFixtures.filter((profile) => matchesSearch([profile.organizationName], query?.search)),
      query
    );
  },
  async listAdminProfiles(query, context) {
    await beforeRead("userManagement", context, ["admin"]);
    return paginateOrThrowEmpty(adminProfileFixtures, query);
  }
};

export const mockAcademicManagementRepository: AcademicManagementRepository = {
  async listDepartments(query, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(departmentFixtures.filter((department) => matchesSearch([department.code, department.name], query?.search)), query);
  },
  async listPrograms(query, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer"]);
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
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(
      semesterFixtures.filter((semester) => matchesSearch([semester.label, semester.schoolYear], query?.search)),
      query
    );
  },
  async listClasses(query, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer", "student"]);
    return paginateOrThrowEmpty(filterClasses(query), query);
  },
  async getClassById(classId, context) {
    await beforeRead("academicManagement", context, ["admin", "faculty", "organizer", "student"]);
    return getOrThrow(classFixtures, classId, "Class");
  }
};

export const mockClassRosterRepository: ClassRosterRepository = {
  async listClassRosters(query, context) {
    await beforeRead("classRosters", context, ["admin", "faculty"]);
    return paginateOrThrowEmpty(
      classRosterFixtures.filter((entry) => !query?.classId || entry.classId === query.classId),
      query
    );
  },
  async listStudentsForClass(classId, query, context) {
    await beforeRead("classRosters", context, ["admin", "faculty"]);
    const studentIds = classRosterFixtures.filter((entry) => entry.classId === classId).map((entry) => entry.studentId);
    return paginateOrThrowEmpty(filterStudents(query).filter((student) => studentIds.includes(student.id)), query);
  }
};

export const mockEventManagementRepository: EventManagementRepository = {
  async listEvents(query, context) {
    await beforeRead("eventManagement", context, ["admin", "faculty", "organizer", "student"]);
    return paginateOrThrowEmpty(filterEvents(query), query);
  },
  async getEventById(eventId, context) {
    await beforeRead("eventManagement", context, ["admin", "faculty", "organizer", "student"]);
    return getOrThrow(eventFixtures, eventId, "Event");
  },
  async listEventParticipants(eventId, query, context) {
    await beforeRead("eventManagement", context, ["admin", "organizer"]);
    return paginateOrThrowEmpty(
      eventParticipantFixtures.filter((participant) => participant.eventId === eventId),
      query
    );
  }
};

export const mockAttendanceSessionRepository: AttendanceSessionRepository = {
  async listAttendanceSessions(query, context) {
    await beforeRead("attendanceSessions", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(filterAttendanceSessions(query), query);
  },
  async getAttendanceSessionById(sessionId, context) {
    await beforeRead("attendanceSessions", context, ["admin", "faculty", "organizer"]);
    return getOrThrow(attendanceSessionFixtures, sessionId, "Attendance session");
  }
};

export const mockAttendanceRecordRepository: AttendanceRecordRepository = {
  async listAttendanceRecords(query, context) {
    await beforeRead("attendanceRecords", context, ["admin", "faculty", "organizer", "student"]);
    return paginateOrThrowEmpty(filterAttendanceRecords(query), query);
  },
  async getAttendanceRecordById(recordId, context) {
    await beforeRead("attendanceRecords", context, ["admin", "faculty", "organizer", "student"]);
    return getOrThrow(attendanceRecordFixtures, recordId, "Attendance record");
  }
};

export const mockNfcCredentialRepository: NfcCredentialRepository = {
  async listNfcCredentials(query, context) {
    await beforeRead("nfcCredentials", context, ["admin", "faculty"]);
    return paginateOrThrowEmpty(
      nfcCredentialFixtures.filter(
        (credential) =>
          matchesSearch([credential.nfcUid, credential.status, credential.studentId], query?.search) &&
          (!query?.credentialStatus || credential.status === query.credentialStatus)
      ),
      query
    );
  },
  async getCredentialForStudent(studentId, context): Promise<NfcCredential | null> {
    await beforeRead("nfcCredentials", context, ["admin", "faculty"]);
    return nfcCredentialFixtures.find((credential) => credential.studentId === studentId && credential.status === "activated") ?? null;
  }
};

export const mockNfcReaderRepository: NfcReaderRepository = {
  async listNfcReaders(query, context) {
    await beforeRead("nfcReaders", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(nfcReaderFixtures.filter((reader) => matchesSearch([reader.label, reader.serialNumber], query?.search)), query);
  },
  async listNfcTapAttempts(query, context) {
    await beforeRead("nfcReaders", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(
      nfcTapAttemptFixtures.filter(
        (attempt) =>
          matchesSearch([attempt.nfcUid, attempt.message], query?.search) &&
          (!query?.classId || attendanceSessionFixtures.find((session) => session.id === attempt.sessionId)?.classId === query.classId) &&
          (!query?.eventId || attendanceSessionFixtures.find((session) => session.id === attempt.sessionId)?.eventId === query.eventId)
      ),
      query
    );
  }
};

export const mockCorrectionRequestRepository: CorrectionRequestRepository = {
  async listCorrectionRequests(query, context) {
    await beforeRead("correctionRequests", context, ["admin", "faculty", "organizer", "student"]);
    return paginateOrThrowEmpty(
      correctionRequestFixtures.filter(
        (request) =>
          matchesSearch([request.reason, request.status, request.studentId], query?.search) &&
          (!query?.classId || request.classId === query.classId) &&
          (!query?.eventId || request.eventId === query.eventId)
      ),
      query
    );
  },
  async createCorrectionRequest(input: CreateCorrectionRequestInput, context) {
    await beforeRead("correctionRequests", context, ["student", "faculty", "organizer", "admin"]);
    if (!input.reason.trim()) {
      throw new RepositoryError("Correction request reason is required.", "VALIDATION_ERROR");
    }
    const created: CorrectionRequest = {
      id: `correction-created-${Date.now()}`,
      ...input,
      status: "pending",
      requestedAt: new Date().toISOString()
    };
    return created;
  }
};

export const mockReportRepository: ReportRepository = {
  async listReports(query, context) {
    await beforeRead("reports", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(
      reportFixtures.filter((report) => matchesSearch([report.title, report.scope, report.status], query?.search)),
      query
    );
  }
};

export const mockNotificationRepository: NotificationRepository = {
  async listNotifications(query, context) {
    await beforeRead("notifications", context, ["admin", "faculty", "organizer", "student"]);
    const currentContext = contextOrDefault(context);
    return paginateOrThrowEmpty(
      notificationFixtures.filter(
        (notification) =>
          (currentContext.actorRole === "admin" || notification.userId === currentContext.actorUserId) &&
          matchesSearch([notification.title, notification.body, notification.status], query?.search)
      ),
      query
    );
  }
};

export const mockAuditLogRepository: AuditLogRepository = {
  async listAuditLogs(query, context) {
    await beforeRead("auditLogs", context, ["admin"]);
    return paginateOrThrowEmpty(
      auditLogFixtures.filter((log) => matchesSearch([log.action, log.targetType, log.targetId], query?.search)),
      query
    );
  }
};

export const mockAnalyticsMlRepository: AnalyticsMlRepository = {
  async listMlPredictions(query, context) {
    await beforeRead("analyticsMl", context, ["admin", "faculty", "organizer"]);
    return paginateOrThrowEmpty(
      mlPredictionFixtures.filter(
        (prediction) =>
          matchesSearch([prediction.type, prediction.riskLevel, prediction.patternLabel], query?.search) &&
          (!query?.classId || prediction.classId === query.classId) &&
          (!query?.eventId || prediction.eventId === query.eventId)
      ),
      query
    );
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
  nfcReaders: mockNfcReaderRepository,
  correctionRequests: mockCorrectionRequestRepository,
  reports: mockReportRepository,
  notifications: mockNotificationRepository,
  auditLogs: mockAuditLogRepository,
  analyticsMl: mockAnalyticsMlRepository
};
