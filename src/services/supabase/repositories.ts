import type {
  AddRosterStudentInput,
  AcademicManagementRepository,
  AnalyticsMlRepository,
  AttendanceRecordRepository,
  AttendanceSessionRepository,
  AuditLogRepository,
  AuthenticationRepository,
  ClassRosterRepository,
  CorrectionRequestRepository,
  EndAttendanceSessionInput,
  EventManagementRepository,
  NfcCredentialRepository,
  NfcCredentialRequestRepository,
  NfcReaderRepository,
  NotificationRepository,
  ReportRepository,
  RepositoryRegistry,
  SystemSettingsRepository,
  UserManagementRepository
} from "@/services/contracts";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { mapSupabaseError, throwIfSupabaseError } from "@/lib/supabase/errors";
import {
  mapAttendanceRecord,
  mapAttendanceSession,
  mapAuditLog,
  mapClass,
  mapClassRoster,
  mapCorrectionRequest,
  mapEvent,
  mapEventParticipant,
  mapFaculty,
  mapNfcCredential,
  mapNfcCredentialRequest,
  mapNfcReader,
  mapNotification,
  mapOrganizer,
  mapProfileToUser,
  mapReport,
  mapStudent
} from "@/lib/supabase/mappers";
import { RepositoryError } from "@/services/mock/mockRepositoryUtils";
import type {
  AdminProfile,
  Department,
  MlPrediction,
  Program,
  Semester,
  Student,
  SystemSettings
} from "@/types/domain";
import type { EventStatus, NfcCredentialStatus, NfcReaderStatus } from "@/types/enums";
import type { ListQuery, PaginatedResult } from "@/types/filters";

type Row = Record<string, unknown>;
type TableName = keyof Database["public"]["Tables"];

const defaultPageSize = 20;
const classReadSelect = "*, subjects(subject_code, subject_name), rooms(room_code), sections(section_name, year_level, program_id, programs(department_id))";
const eventReadSelect = "*, event_categories(category_name)";
const nfcCredentialReadSelect = "id, student_id, nfc_status";

function deferredLiveMutation(message = "This Supabase mutation needs a reviewed live schema workflow before it is enabled."): never {
  throw new RepositoryError(message, "VALIDATION_ERROR");
}

function queryOrDefault(query?: ListQuery): ListQuery {
  return {
    pageIndex: query?.pageIndex ?? 0,
    pageSize: query?.pageSize ?? defaultPageSize,
    ...query
  };
}

function pageResult<T>(items: T[], total: number, query?: ListQuery): PaginatedResult<T> {
  const listQuery = queryOrDefault(query);
  return {
    items,
    total,
    pageIndex: listQuery.pageIndex,
    pageSize: listQuery.pageSize,
    pageCount: Math.max(1, Math.ceil(total / listQuery.pageSize))
  };
}

function emptyPage<T>(query?: ListQuery): PaginatedResult<T> {
  return pageResult([], 0, query);
}

async function selectRows(table: TableName, query?: ListQuery, columns = "*"): Promise<PaginatedResult<Row>> {
  const listQuery = queryOrDefault(query);
  const from = listQuery.pageIndex * listQuery.pageSize;
  const to = from + listQuery.pageSize - 1;
  const client = getSupabaseBrowserClient();
  let builder = client.from(table).select(columns, { count: "exact" });

  if (listQuery.sortBy) {
    builder = builder.order(listQuery.sortBy, { ascending: listQuery.sortDirection !== "desc" });
  }

  const { data, error, count } = await builder.range(from, to);
  throwIfSupabaseError(error);
  return pageResult((data ?? []) as unknown as Row[], count ?? data?.length ?? 0, listQuery);
}

async function selectSingleRow(table: TableName, id: string): Promise<Row> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
  throwIfSupabaseError(error);
  if (!data) {
    throw new RepositoryError(`${table} row was not found.`, "NOT_FOUND");
  }
  return data as unknown as Row;
}

async function selectSingleRowWithColumns(table: TableName, id: string, columns: string): Promise<Row> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.from(table).select(columns).eq("id", id).maybeSingle();
  throwIfSupabaseError(error);
  if (!data) {
    throw new RepositoryError(`${table} row was not found.`, "NOT_FOUND");
  }
  return data as unknown as Row;
}

async function insertRow(table: TableName, values: Row): Promise<Row> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.from(table).insert(values as never).select("*").single();
  throwIfSupabaseError(error);
  return data as unknown as Row;
}

async function updateRow(table: TableName, id: string, values: Row): Promise<Row> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.from(table).update(values as never).eq("id", id).select("*").single();
  throwIfSupabaseError(error);
  return data as unknown as Row;
}

async function currentProfile(): Promise<Row> {
  const client = getSupabaseBrowserClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  throwIfSupabaseError(authError);
  const user = authData.user;
  if (!user) {
    throw new RepositoryError("No authenticated Supabase session.", "PERMISSION_DENIED");
  }
  const { data, error } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
  throwIfSupabaseError(error);
  if (!data) {
    throw new RepositoryError("Authenticated user profile was not found.", "NOT_FOUND");
  }
  return { ...(data as Row), email: user.email ?? (data as Row).email };
}

export const supabaseAuthenticationRepository: AuthenticationRepository = {
  async listDevelopmentAccounts() {
    return [];
  },
  async getSession() {
    const profile = await currentProfile();
    const user = mapProfileToUser(profile);
    const status = typeof profile.account_status === "string" ? profile.account_status : "active";
    return {
      userId: user.id,
      role: user.role,
      displayName: user.displayName,
      isAuthenticated: status === "active"
    };
  }
};

export const supabaseUserManagementRepository: UserManagementRepository = {
  async listUsers(query) {
    const rows = await selectRows("profiles", query);
    return pageResult(rows.items.map(mapProfileToUser), rows.total, query);
  },
  async getUserById(userId) {
    return mapProfileToUser(await selectSingleRow("profiles", userId));
  },
  async listStudents(query) {
    const rows = await selectRows("students", query);
    return pageResult(rows.items.map(mapStudent), rows.total, query);
  },
  async listFacultyProfiles(query) {
    const rows = await selectRows("faculty", query);
    return pageResult(rows.items.map(mapFaculty), rows.total, query);
  },
  async listOrganizerProfiles(query) {
    const rows = await selectRows("organizers", query);
    return pageResult(rows.items.map(mapOrganizer), rows.total, query);
  },
  async listAdminProfiles(query) {
    const rows = await selectRows("profiles", query);
    const adminRows = rows.items.filter((row) => row.role === "admin");
    return pageResult(
      adminRows.map((row): AdminProfile => ({
        id: String(row.id ?? ""),
        userId: String(row.id ?? ""),
        employeeNumber: String(row.employee_id ?? row.id ?? ""),
        departmentId: String(row.department_id ?? ""),
        officeName: "Admin profile"
      })),
      adminRows.length,
      query
    );
  }
};

export const supabaseAcademicManagementRepository: AcademicManagementRepository = {
  async listDepartments(query) {
    const rows = await selectRows("departments", query);
    return pageResult(rows.items.map((row): Department => ({ id: String(row.id ?? ""), code: String(row.department_code ?? row.code ?? ""), name: String(row.name ?? row.department_name ?? "") })), rows.total, query);
  },
  async listPrograms(query) {
    const rows = await selectRows("programs", query);
    return pageResult(rows.items.map((row): Program => ({ id: String(row.id ?? ""), departmentId: String(row.department_id ?? ""), code: String(row.program_code ?? row.code ?? ""), name: String(row.name ?? row.program_name ?? "") })), rows.total, query);
  },
  async listSemesters(query) {
    const rows = await selectRows("semesters", query);
    return pageResult(rows.items.map((row): Semester => ({ id: String(row.id ?? ""), label: String(row.label ?? row.semester_name ?? ""), schoolYear: String(row.school_year ?? ""), startsAt: String(row.starts_at ?? row.start_date ?? ""), endsAt: String(row.ends_at ?? row.end_date ?? ""), isActive: Boolean(row.is_active) })), rows.total, query);
  },
  async listClasses(query) {
    const rows = await selectRows("classes", query, classReadSelect);
    return pageResult(rows.items.map(mapClass), rows.total, query);
  },
  async getClassById(classId) {
    return mapClass(await selectSingleRowWithColumns("classes", classId, classReadSelect));
  }
};

export const supabaseClassRosterRepository: ClassRosterRepository = {
  async listClassRosters(query) {
    const rows = await selectRows("class_enrollments", query);
    return pageResult(rows.items.map(mapClassRoster), rows.total, query);
  },
  async listStudentsForClass(classId, query) {
    const client = getSupabaseBrowserClient();
    const { data, error, count } = await client.from("class_enrollments").select("student_id", { count: "exact" }).eq("class_id", classId);
    throwIfSupabaseError(error);
    const studentIds = (data ?? []).map((row) => String((row as Row).student_id ?? ""));
    if (studentIds.length === 0) {
      return emptyPage<Student>(query);
    }
    const students = await selectRows("students", { ...queryOrDefault(query), pageSize: Math.max(studentIds.length, query?.pageSize ?? defaultPageSize) });
    return pageResult(students.items.filter((row) => studentIds.includes(String(row.id))).map(mapStudent), count ?? studentIds.length, query);
  },
  async addStudentToClass(input: AddRosterStudentInput) {
    return mapClassRoster(await insertRow("class_enrollments", { class_id: input.classId, student_id: input.studentId }));
  },
  async removeStudentFromClass(classId, studentId) {
    const client = getSupabaseBrowserClient();
    const { error } = await client.from("class_enrollments").delete().eq("class_id", classId).eq("student_id", studentId);
    throwIfSupabaseError(error);
  }
};

export const supabaseEventManagementRepository: EventManagementRepository = {
  async listEvents(query) {
    const rows = await selectRows("events", query, eventReadSelect);
    return pageResult(rows.items.map(mapEvent), rows.total, query);
  },
  async getEventById(eventId) {
    return mapEvent(await selectSingleRowWithColumns("events", eventId, eventReadSelect));
  },
  async listEventParticipants(eventId, query) {
    const rows = await selectRows("event_participants", query);
    return pageResult(rows.items.filter((row) => String(row.event_id ?? "") === eventId).map(mapEventParticipant), rows.total, query);
  },
  async createEvent() {
    deferredLiveMutation("Live event creation is deferred until the Supabase event schema has reviewed category/date/session mappings.");
  },
  async updateEventStatus(eventId, status: Extract<EventStatus, "approved" | "rejected">, reason) {
    const approvalStatus = status === "approved" ? "approved" : "declined";
    void reason;
    return mapEvent(await updateRow("events", eventId, { approval_status: approvalStatus }));
  }
};

export const supabaseAttendanceSessionRepository: AttendanceSessionRepository = {
  async listAttendanceSessions(query) {
    const [classRows, eventRows] = await Promise.all([selectRows("class_sessions", query), selectRows("event_sessions", query)]);
    const items = [...classRows.items.map((row) => mapAttendanceSession(row, "class")), ...eventRows.items.map((row) => mapAttendanceSession(row, "event"))];
    return pageResult(items, classRows.total + eventRows.total, query);
  },
  async getAttendanceSessionById(sessionId) {
    try {
      return mapAttendanceSession(await selectSingleRow("class_sessions", sessionId), "class");
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "NOT_FOUND") {
        return mapAttendanceSession(await selectSingleRow("event_sessions", sessionId), "event");
      }
      throw error;
    }
  },
  async createClassSession() {
    deferredLiveMutation("Live class session creation is deferred until Phase 10 session-start workflows are reviewed.");
  },
  async createEventSession() {
    deferredLiveMutation("Live event session creation is deferred until Phase 10 session-start workflows are reviewed.");
  },
  async endAttendanceSession(input: EndAttendanceSessionInput) {
    const session = await supabaseAttendanceSessionRepository.getAttendanceSessionById(input.sessionId);
    const table = session.type === "class" ? "class_sessions" : "event_sessions";
    void input.reason;
    return mapAttendanceSession(await updateRow(table, input.sessionId, { session_status: "completed", actual_end: new Date().toISOString() }), session.type);
  }
};

export const supabaseAttendanceRecordRepository: AttendanceRecordRepository = {
  async listAttendanceRecords(query) {
    const rows = await selectRows("attendance_records", query);
    return pageResult(rows.items.map(mapAttendanceRecord), rows.total, query);
  },
  async getAttendanceRecordById(recordId) {
    return mapAttendanceRecord(await selectSingleRow("attendance_records", recordId));
  },
  async simulateCredentialAttendance() {
    throw new RepositoryError("Live NFC and QR attendance writes are intentionally deferred to Phase 10.", "VALIDATION_ERROR");
  },
  async simulateManualAttendance() {
    throw new RepositoryError("Live manual attendance writes are intentionally deferred to Phase 10.", "VALIDATION_ERROR");
  }
};

export const supabaseNfcCredentialRepository: NfcCredentialRepository = {
  async listNfcCredentials(query) {
    const rows = await selectRows("nfc_credentials", query, nfcCredentialReadSelect);
    return pageResult(rows.items.map(mapNfcCredential), rows.total, query);
  },
  async getCredentialForStudent(studentId) {
    const rows = await selectRows("nfc_credentials", { pageIndex: 0, pageSize: 10 }, nfcCredentialReadSelect);
    return rows.items.map(mapNfcCredential).find((credential) => credential.studentId === studentId && credential.status === "activated") ?? null;
  },
  async updateCredentialStatus(credentialId, status: NfcCredentialStatus) {
    return mapNfcCredential(await updateRow("nfc_credentials", credentialId, { nfc_status: status }));
  }
};

export const supabaseNfcCredentialRequestRepository: NfcCredentialRequestRepository = {
  async listNfcCredentialRequests(query) {
    const rows = await selectRows("credential_requests", query);
    return pageResult(rows.items.map(mapNfcCredentialRequest), rows.total, query);
  },
  async createNfcCredentialRequest() {
    deferredLiveMutation("Live credential request creation is deferred until credential request reason and credential linkage fields are reviewed.");
  }
};

export const supabaseNfcReaderRepository: NfcReaderRepository = {
  async listNfcReaders(query) {
    const rows = await selectRows("devices", query);
    return pageResult(rows.items.map(mapNfcReader), rows.total, query);
  },
  async listNfcTapAttempts(query) {
    const rows = await selectRows("attendance_logs", query);
    return pageResult(
      rows.items.map((row) => ({
        id: String(row.id ?? ""),
        sessionId: String(row.attendance_record_id ?? ""),
        readerId: String(row.device_id ?? ""),
        nfcUid: "SIMULATED-CODE",
        studentId: typeof row.student_id === "string" ? row.student_id : undefined,
        accepted: row.action_type === "time_in",
        attemptedAt: String(row.logged_at ?? new Date().toISOString()),
        message: String(row.method ?? "Attendance log")
      })),
      rows.total,
      query
    );
  },
  async updateReaderStatus(readerId, status: NfcReaderStatus) {
    if (status === "maintenance") {
      deferredLiveMutation("The live devices.status enum does not include maintenance.");
    }
    return mapNfcReader(await updateRow("devices", readerId, { status }));
  }
};

export const supabaseCorrectionRequestRepository: CorrectionRequestRepository = {
  async listCorrectionRequests(query) {
    const rows = await selectRows("attendance_requests", query);
    return pageResult(rows.items.map(mapCorrectionRequest), rows.total, query);
  },
  async createCorrectionRequest() {
    deferredLiveMutation("Live correction request creation is deferred until correction reason/status fields are reviewed.");
  },
  async reviewCorrectionRequest() {
    deferredLiveMutation("Live correction request review is deferred until review metadata fields are reviewed.");
  }
};

export const supabaseReportRepository: ReportRepository = {
  async listReports(query) {
    const rows = await selectRows("generated_reports", query);
    return pageResult(rows.items.map(mapReport), rows.total, query);
  }
};

export const supabaseNotificationRepository: NotificationRepository = {
  async listNotifications(query) {
    const rows = await selectRows("notifications", query);
    return pageResult(rows.items.map(mapNotification), rows.total, query);
  },
  async markNotificationRead(notificationId) {
    return mapNotification(await updateRow("notifications", notificationId, { notification_status: "read" }));
  },
  async markAllNotificationsRead() {
    const client = getSupabaseBrowserClient();
    const profile = await currentProfile();
    const { data, error } = await client.from("notifications").update({ notification_status: "read" }).eq("recipient_id", String(profile.id)).select("*");
    throwIfSupabaseError(error);
    return ((data ?? []) as Row[]).map(mapNotification);
  }
};

export const supabaseAuditLogRepository: AuditLogRepository = {
  async listAuditLogs(query) {
    const rows = await selectRows("session_audit_logs", query);
    return pageResult(rows.items.map(mapAuditLog), rows.total, query);
  }
};

export const supabaseAnalyticsMlRepository: AnalyticsMlRepository = {
  async listMlPredictions(query) {
    const [risk, anomalies, clusters] = await Promise.all([
      selectRows("ml_absenteeism_predictions", query).catch(() => emptyPage<Row>(query)),
      selectRows("ml_attendance_anomalies", query).catch(() => emptyPage<Row>(query)),
      selectRows("ml_participation_clusters", query).catch(() => emptyPage<Row>(query))
    ]);
    const rows = [...risk.items, ...anomalies.items, ...clusters.items];
    return pageResult(
      rows.map((row, index): MlPrediction => ({
        id: String(row.id ?? `ml-${index}`),
        type: String(row.prediction_type ?? row.type ?? (row.risk_score !== undefined ? "random_forest_risk" : row.anomaly_level !== undefined ? "linear_regression_anomaly" : "k_means_cluster")) as MlPrediction["type"],
        riskLevel: String(row.risk_level ?? "low") as MlPrediction["riskLevel"],
        studentId: typeof row.student_id === "string" ? row.student_id : undefined,
        classId: typeof row.class_id === "string" ? row.class_id : undefined,
        eventId: typeof row.event_id === "string" ? row.event_id : undefined,
        patternLabel: String(row.pattern_label ?? row.cluster_name ?? row.anomaly_level ?? "Review-only ML signal"),
        score: typeof row.score === "number" ? row.score : typeof row.risk_score === "number" ? row.risk_score : typeof row.actual_rate === "number" ? row.actual_rate : typeof row.cluster_no === "number" ? row.cluster_no : 0,
        generatedAt: String(row.generated_at ?? row.created_at ?? new Date().toISOString()),
        explanation: String(row.explanation ?? "Supabase ML result mapped for review only.")
      })),
      risk.total + anomalies.total + clusters.total,
      query
    );
  }
};

export const supabaseSystemSettingsRepository: SystemSettingsRepository = {
  async getSettings(): Promise<SystemSettings> {
    return {
      id: "supabase-settings",
      institutionName: "PLPass",
      currentSchoolYear: "",
      currentSemesterId: "",
      attendanceLateCutoffMinutes: 15,
      defaultSessionDurationMinutes: 90,
      readerPolicy: "Managed in Supabase policies.",
      credentialStatusPolicy: "Managed in Supabase policies.",
      notificationPreferencePlaceholder: "Managed by Supabase profile settings.",
      updatedAt: new Date().toISOString()
    };
  },
  async updateSettings(): Promise<SystemSettings> {
    throw new RepositoryError("System setting writes require an approved Supabase settings table mapping.", "VALIDATION_ERROR");
  }
};

export const supabaseRepositoryRegistry: RepositoryRegistry = {
  authentication: supabaseAuthenticationRepository,
  userManagement: supabaseUserManagementRepository,
  academicManagement: supabaseAcademicManagementRepository,
  classRosters: supabaseClassRosterRepository,
  eventManagement: supabaseEventManagementRepository,
  attendanceSessions: supabaseAttendanceSessionRepository,
  attendanceRecords: supabaseAttendanceRecordRepository,
  nfcCredentials: supabaseNfcCredentialRepository,
  nfcCredentialRequests: supabaseNfcCredentialRequestRepository,
  nfcReaders: supabaseNfcReaderRepository,
  correctionRequests: supabaseCorrectionRequestRepository,
  reports: supabaseReportRepository,
  notifications: supabaseNotificationRepository,
  auditLogs: supabaseAuditLogRepository,
  analyticsMl: supabaseAnalyticsMlRepository,
  systemSettings: supabaseSystemSettingsRepository
};

export function mapSupabaseRepositoryError(error: unknown) {
  if (error instanceof RepositoryError) {
    return error;
  }
  if (error instanceof Error) {
    return mapSupabaseError(error);
  }
  return new RepositoryError("Unexpected Supabase repository error.", "SERVER_ERROR");
}
