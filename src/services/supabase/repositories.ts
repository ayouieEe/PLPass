import type {
  AddRosterStudentInput,
  AcademicManagementRepository,
  AnalyticsMlRepository,
  AttendanceRecordRepository,
  AttendanceAttemptRepository,
  AttendanceSessionRepository,
  AuditLogRepository,
  AuthenticationRepository,
  ClassRosterRepository,
  CorrectionRequestRepository,
  EndAttendanceSessionInput,
  EventManagementRepository,
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
  mapCorrectionRequest,
  mapEvent,
  mapEventParticipant,
  mapNotification,
  mapOrganizer,
  mapProfileToUser,
  mapReport,
  mapStudent
} from "@/lib/supabase/mappers";
import { RepositoryError } from "@/services/repositoryUtils";
import type {
  AdminProfile,
  Department,
  MlPrediction,
  Program,
  Semester,
  Student,
  SystemSettings
} from "@/types/domain";
import type { EventStatus } from "@/types/enums";
import type { ListQuery, PaginatedResult } from "@/types/filters";

type Row = Record<string, unknown>;
type TableName = keyof Database["public"]["Tables"];

const defaultPageSize = 20;
const eventReadSelect = "*, event_categories(category_name)";
const studentReadSelect = "*, profiles(first_name, middle_name, last_name, email), sections(section_name, year_level), programs(program_code, program_name)";

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

async function selectRowsFiltered(
  table: TableName,
  query: ListQuery | undefined,
  columns: string,
  filters: Record<string, string | number | boolean | undefined>
): Promise<PaginatedResult<Row>> {
  const listQuery = queryOrDefault(query);
  const from = listQuery.pageIndex * listQuery.pageSize;
  const to = from + listQuery.pageSize - 1;
  const client = getSupabaseBrowserClient();
  let builder = client.from(table).select(columns, { count: "exact" });

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      builder = builder.eq(key, value);
    }
  }

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
    const rows = await selectRows("students", query, studentReadSelect);
    return pageResult(rows.items.map(mapStudent), rows.total, query);
  },
  async listFacultyProfiles(query) {
    return emptyPage(query);
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
  return pageResult(
    rows.items.map((row): Semester => ({
      id: String(row.id ?? ""),
      label: String(row.semester_name ?? ""),
      schoolYear: String(row.academic_year ?? ""),
      startsAt: String(row.start_date ?? ""),
      endsAt: String(row.end_date ?? ""),
      isActive: row.status === "active"
    })),
    rows.total,
    query
  );
},
  async listClasses(query) {
    return emptyPage(query);
  },
  async getClassById(classId) {
    void classId;
    throw new RepositoryError("Class attendance is not part of the event-only PLPass schema.", "NOT_FOUND");
  }
};

export const supabaseClassRosterRepository: ClassRosterRepository = {
  async listClassRosters(query) {
    return emptyPage(query);
  },
  async listStudentsForClass(classId, query) {
    void classId;
    return emptyPage<Student>(query);
  },
  async addStudentToClass(input: AddRosterStudentInput) {
    void input;
    throw new RepositoryError("Class rosters are not part of the event-only PLPass schema.", "VALIDATION_ERROR");
  },
  async removeStudentFromClass(classId, studentId) {
    void classId;
    void studentId;
    throw new RepositoryError("Class rosters are not part of the event-only PLPass schema.", "VALIDATION_ERROR");
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
  async createEvent(input) {
    const client = getSupabaseBrowserClient();
    const profile = await currentProfile();
    const { data: organizer, error: organizerError } = await client
      .from("organizers")
      .select("id")
      .eq("profile_id", String(profile.id))
      .maybeSingle();
    throwIfSupabaseError(organizerError);
    if (!organizer) {
      throw new RepositoryError("The signed-in account is not linked to an organizer profile.", "PERMISSION_DENIED");
    }

    const { data: category, error: categoryError } = await client
      .from("event_categories")
      .select("id")
      .eq("category_name", input.category)
      .maybeSingle();
    throwIfSupabaseError(categoryError);
    if (!category) {
      throw new RepositoryError("Select an event category that exists in Supabase.", "VALIDATION_ERROR");
    }

    const scheduledStart = new Date(`${input.date}T${input.startTime}:00`).toISOString();
    const scheduledEnd = new Date(`${input.date}T${input.endTime}:00`).toISOString();
    const { data: eventRow, error: eventError } = await client
      .from("events")
      .insert({
        event_code: input.code,
        title: input.title,
        category_id: category.id,
        venue: input.venue,
        starts_at: scheduledStart,
        ends_at: scheduledEnd,
        description: [input.description, input.remarks].filter(Boolean).join("\n\n") || null,
        event_status: "scheduled",
        approval_status: "pending",
        organizer_id: organizer.id,
        priority_level: input.priorityLevel,
        impact_score: input.impactScore ?? null
      })
      .select(eventReadSelect)
      .single();
    throwIfSupabaseError(eventError);

    if (input.participantStudentIds.length > 0) {
      const { error: participantError } = await client.from("event_participants").insert(
        input.participantStudentIds.map((studentId) => ({
          event_id: eventRow.id,
          student_id: studentId,
          participant_status: "invited" as const
        }))
      );
      if (participantError) {
        await client.from("events").delete().eq("id", eventRow.id);
        throwIfSupabaseError(participantError);
      }
    }

    return mapEvent(eventRow as Row);
  },
  async updateEventStatus(eventId, status: Extract<EventStatus, "approved" | "rejected">, reason) {
    const approvalStatus = status === "approved" ? "approved" : "declined";
    void reason;
    return mapEvent(await updateRow("events", eventId, { approval_status: approvalStatus }));
  },
  async completeEvent(eventId) {
    return mapEvent(await updateRow("events", eventId, { event_status: "completed" }));
  }
};



export const supabaseAttendanceSessionRepository: AttendanceSessionRepository = {
  async listAttendanceSessions(query) {
    const rows = await selectRows("event_sessions", query);
    return pageResult(rows.items.map((row) => mapAttendanceSession(row, "event")), rows.total, query);
  },

  async getAttendanceSessionById(sessionId) {
    return mapAttendanceSession(await selectSingleRow("event_sessions", sessionId), "event");
  },
  async createClassSession(input) {
    void input;
    throw new RepositoryError("Class sessions are not part of the event-only PLPass schema.", "VALIDATION_ERROR");
},
 async createEventSession(input) {
  const profile = await currentProfile();
  const scheduledStart = new Date(`${input.date}T${input.startTime}:00`).toISOString();
  const scheduledEnd = new Date(`${input.date}T${input.expectedEndTime}:00`).toISOString();
  const inserted = await insertRow("event_sessions", {
    event_id: input.eventId,
    created_by: String(profile.id),
    session_name: `${input.date} attendance`,
    venue: input.venue,
    mode: input.attendanceMode === "online" ? "online" : "f2f",
    session_status: "ongoing",
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
    attendance_window_start_at: scheduledStart,
    attendance_window_end_at: scheduledEnd,
    late_cutoff_at: new Date(new Date(scheduledStart).getTime() + 15 * 60_000).toISOString(),
    actual_start: new Date().toISOString()
  });

  await updateRow("events", input.eventId, { event_status: "ongoing" });

  return mapAttendanceSession(inserted, "event");
},
  async endAttendanceSession(input: EndAttendanceSessionInput) {
  const session = await supabaseAttendanceSessionRepository.getAttendanceSessionById(input.sessionId);
  const updatedSession = await updateRow("event_sessions", input.sessionId, {
    session_status: "completed",
    actual_end: new Date().toISOString(),
    ended_reason: input.reason
  });

  if (session.eventId) {
    await updateRow("events", session.eventId, { event_status: "completed" });
  }

  return mapAttendanceSession(updatedSession, "event");
}
};

export const supabaseAttendanceRecordRepository: AttendanceRecordRepository = {
  async listAttendanceRecords(query) {
    const sessionId = (query as { sessionId?: string })?.sessionId;
    const rows = sessionId
      ? await selectRowsFiltered("attendance_records", query, "*", { event_session_id: sessionId })
      : await selectRows("attendance_records", query);
    return pageResult(rows.items.map(mapAttendanceRecord), rows.total, query);
  },
  async getAttendanceRecordById(recordId) {
    return mapAttendanceRecord(await selectSingleRow("attendance_records", recordId));
  },
  async simulateCredentialAttendance() {
    throw new RepositoryError("QR and facial attendance require the secure Supabase verifier function before they can be enabled.", "VALIDATION_ERROR");
  },
  async simulateManualAttendance(input) {
    const session = await supabaseAttendanceSessionRepository.getAttendanceSessionById(input.sessionId);
    if (session.status !== "active") throw new RepositoryError("This attendance session is not active.", "VALIDATION_ERROR");
    const client = getSupabaseBrowserClient();
    const { data: existing, error: existingError } = await client.from("attendance_records").select("*").eq("event_session_id", input.sessionId).eq("student_id", input.studentId).maybeSingle();
    throwIfSupabaseError(existingError);
    if (existing) {
      const record = mapAttendanceRecord(existing as Row);
      return { resultStatus: "Already Recorded", attendanceStatus: record.status, verificationMethod: "manual", recordedAt: record.recordedAt, safeMessage: "Attendance was already recorded.", attendanceRecord: record, summary: { present: 0, late: 0, absent: 0, duplicateAttempts: 1, failedAttempts: 0 } };
    }
    const sessionStart = new Date(session.startsAt).getTime();
    const fallbackRecordedAt = new Date(sessionStart + 2 * 60_000).toISOString();
    const recordedAt = input.occurredAt ?? fallbackRecordedAt;
    const lateCutoff = new Date(session.lateCutoffAt ?? new Date(sessionStart + 15 * 60_000).toISOString()).getTime();
    const status = input.statusOverride ?? (new Date(recordedAt).getTime() <= lateCutoff ? "present" : "late");
    const row = await insertRow("attendance_records", {
      event_session_id: input.sessionId,
      student_id: input.studentId,
      attendance_status: status,
      verification_method: "manual",
      time_in: recordedAt,
      recorded_at: recordedAt,
      remarks: [input.reason, input.remarks].filter(Boolean).join(": "),
      late_reason_category: status === "late" ? (input.lateReason ?? "Other") : null
    });
    const record = mapAttendanceRecord(row);
    return { resultStatus: status === "late" ? "Late" : "Present", attendanceStatus: status, verificationMethod: "manual", recordedAt, safeMessage: `Attendance recorded as ${status}.`, attendanceRecord: record, summary: { present: status === "present" ? 1 : 0, late: status === "late" ? 1 : 0, absent: 0, duplicateAttempts: 0, failedAttempts: 0 } };
  }
};

export const supabaseAttendanceAttemptRepository: AttendanceAttemptRepository = {
  async listAttendanceAttempts(query) {
    const rows = await selectRows("verification_attempts", query);
    return pageResult(
      rows.items.map((row) => ({
        id: String(row.id ?? ""),
        sessionId: String(row.event_session_id ?? ""),
        studentId: typeof row.student_id === "string" ? row.student_id : undefined,
        accepted: Boolean(row.accepted),
        attemptedAt: String(row.attempted_at ?? new Date().toISOString()),
        message: String(row.message ?? "Verification attempt")
      })),
      rows.total,
      query
    );
  }
};

export const supabaseCorrectionRequestRepository: CorrectionRequestRepository = {
  async listCorrectionRequests(query) {
    const rows = await selectRows("attendance_requests", query);
    return pageResult(rows.items.map(mapCorrectionRequest), rows.total, query);
  },
  async createCorrectionRequest(input) {
    const inserted = await insertRow("attendance_requests", {
      student_id: input.studentId,
      attendance_record_id: input.attendanceRecordId,
      explanation: input.reason,
      requested_status: input.requestedStatus,
      request_status: "pending"
    });
    return mapCorrectionRequest(inserted);
  },
  async reviewCorrectionRequest(input) {
    const profile = await currentProfile();
    const request = await selectSingleRow("attendance_requests", input.requestId);
    const updated = await updateRow("attendance_requests", input.requestId, {
      request_status: input.status,
      review_reason: input.reason ?? (input.status === "rejected" ? "Rejected by reviewer" : "Approved by reviewer"),
      reviewed_by: String(profile.id),
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (input.status === "approved" && request.attendance_record_id) {
      await updateRow("attendance_records", String(request.attendance_record_id), {
        attendance_status: String(request.requested_status ?? "present"),
        remarks: input.reason ?? "Approved attendance correction"
      });
    }
    return mapCorrectionRequest(updated);
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
    return mapNotification(await updateRow("notifications", notificationId, { notification_status: "read", read_at: new Date().toISOString() }));
  },
  async markAllNotificationsRead() {
    const client = getSupabaseBrowserClient();
    const profile = await currentProfile();
    const { data, error } = await client.from("notifications").update({ notification_status: "read", read_at: new Date().toISOString() }).eq("recipient_id", String(profile.id)).select("*");
    throwIfSupabaseError(error);
    return ((data ?? []) as Row[]).map(mapNotification);
  }
};

export const supabaseAuditLogRepository: AuditLogRepository = {
  async listAuditLogs(query) {
    const rows = await selectRows("audit_logs", query);
    return pageResult(rows.items.map(mapAuditLog), rows.total, query);
  }
};

export const supabaseAnalyticsMlRepository: AnalyticsMlRepository = {
  async listMlPredictions(query) {
    const result = await selectRows("ml_predictions", query);
    const rows = result.items;
    return pageResult(
      rows.map((row, index): MlPrediction => ({
        id: String(row.id ?? `ml-${index}`),
        type: "random_forest_risk",
        riskLevel: String(row.risk_level ?? "low") as MlPrediction["riskLevel"],
        studentId: typeof row.student_id === "string" ? row.student_id : undefined,
        classId: typeof row.class_id === "string" ? row.class_id : undefined,
        eventId: typeof row.event_id === "string" ? row.event_id : undefined,
        patternLabel: String(row.pattern_label ?? row.cluster_name ?? row.anomaly_level ?? "Review-only ML signal"),
        score: typeof row.score === "number" ? row.score : typeof row.risk_score === "number" ? row.risk_score : typeof row.actual_rate === "number" ? row.actual_rate : typeof row.cluster_no === "number" ? row.cluster_no : 0,
        generatedAt: String(row.generated_at ?? row.created_at ?? new Date().toISOString()),
        explanation: String(row.explanation ?? "Supabase ML result mapped for review only.")
      })),
      result.total,
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
  attendanceAttempts: supabaseAttendanceAttemptRepository,
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
