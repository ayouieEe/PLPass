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
  CredentialRequestRepository,
  EndAttendanceSessionInput,
  EventFeedbackRepository,
  EventManagementRepository,
  NotificationRepository,
  ReportRepository,
  RepositoryRegistry,
  RepositoryContext,
  AttendanceScanInput,
  AttendanceSubmissionResultStatus,
  EnrollFacialProfileInput,
  IssueQrCredentialInput,
  RescheduleEventInput,
  StudentCredentialRepository,
  SubmitLateReasonInput,
  SubmitEventFeedbackInput,
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
  mapCredentialRequest,
  mapEvent,
  mapEventFeedback,
  mapEventObjective,
  mapEventParticipant,
  mapFacialProfile,
  mapNotification,
  mapOrganizer,
  mapProfileToUser,
  mapQrCredential,
  mapReport,
  mapStudent
} from "@/lib/supabase/mappers";
import { RepositoryError } from "@/services/repositoryUtils";
import { extractQrCredentialId } from "@/lib/credentials/qrCredential";
import { getPhilippineNowIso } from "@/lib/utils/date";
import type {
  AdminProfile,
  Department,
  MlPrediction,
  Program,
  Semester,
  Student,
  SystemSettings
} from "@/types/domain";
import type { AttendanceStatus, EventStatus } from "@/types/enums";
import type { ListQuery, PaginatedResult } from "@/types/filters";

type Row = Record<string, unknown>;
type TableName = keyof Database["public"]["Tables"];

function getErrorMessageText(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message.toLowerCase();
  }

  return null;
}

export function isMissingRescheduleSchemaColumnError(error: unknown): boolean {
  const message = getErrorMessageText(error);
  if (!message) {
    return false;
  }

  return (
    message.includes("rescheduled_at") ||
    message.includes("session_archive_status") ||
    (message.includes("could not find the") && message.includes("schema cache"))
  );
}

export function isNonBlockingAuditLoggingError(error: unknown): boolean {
  const message = getErrorMessageText(error);
  if (!message) {
    return false;
  }

  return (
    message.includes("permission denied for table audit_logs") ||
    (message.includes("permission denied") && message.includes("audit_logs")) ||
    (message.includes("row level security") && message.includes("audit_logs")) ||
    (message.includes("rls") && message.includes("audit_logs"))
  );
}

const defaultPageSize = 20;
const eventReadSelect = "*, event_categories(category_name)";
const studentReadSelect = "*, profiles(first_name, middle_name, last_name, email), sections(section_name, year_level), programs(program_code, program_name)";
const attendanceRequestProofBucket = "attendance-request-proofs";
const credentialRequestProofBucket = "credential-request-proofs";
const facialEnrollmentBucket = "facial-enrollments";

function sanitizeStorageFileName(fileName: string) {
  const safeName = fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safeName || "proof-attachment";
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

function allowedCorrectionStatusesForAttendance(status: AttendanceStatus): AttendanceStatus[] {
  if (status === "late") {
    return ["present", "excused"];
  }
  if (status === "absent") {
    return ["present", "late", "excused"];
  }
  return [];
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

async function currentStudentIdForProfile(profileId: string): Promise<string> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client
    .from("students")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!data?.id) {
    throw new RepositoryError("The signed-in account is not linked to a student profile.", "PERMISSION_DENIED");
  }
  return String(data.id);
}

function normalizeQrCredentialCode(rawCode: string) {
  return extractQrCredentialId(rawCode);
}

function credentialScanResult(
  input: AttendanceScanInput,
  resultStatus: AttendanceSubmissionResultStatus,
  recordedAt: string,
  safeMessage: string,
  options: Partial<{
    attendanceRecord: ReturnType<typeof mapAttendanceRecord>;
    attendanceStatus: AttendanceStatus;
    present: number;
    late: number;
    absent: number;
    duplicateAttempts: number;
    failedAttempts: number;
    studentDisplayName: string;
    studentNumber: string;
  }> = {}
) {
  return {
    resultStatus,
    studentDisplayName: options.studentDisplayName,
    studentNumber: options.studentNumber,
    attendanceStatus: options.attendanceStatus,
    verificationMethod: input.method,
    recordedAt,
    safeMessage,
    attendanceRecord: options.attendanceRecord,
    summary: {
      present: options.present ?? 0,
      late: options.late ?? 0,
      absent: options.absent ?? 0,
      duplicateAttempts: options.duplicateAttempts ?? 0,
      failedAttempts: options.failedAttempts ?? 0
    }
  };
}

async function insertVerificationAttempt(
  sessionId: string,
  method: AttendanceScanInput["method"],
  accepted: boolean,
  failureCode: string | undefined,
  message: string,
  attemptedAt: string,
  options: Partial<{ studentId: string; qrCredentialId: string; facialProfileId: string }> = {}
): Promise<Row> {
  return insertRow("verification_attempts", {
    event_session_id: sessionId,
    student_id: options.studentId || null,
    verification_method: method,
    accepted,
    failure_code: failureCode ?? null,
    message,
    attempted_at: attemptedAt,
    qr_credential_id: method === "qr" ? options.qrCredentialId ?? null : null,
    facial_profile_id: method === "facial" ? options.facialProfileId ?? null : null
  });
}

async function studentScanSummary(studentId: string): Promise<{ displayName?: string; studentNumber?: string }> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client
    .from("students")
    .select("student_id, profiles(first_name, middle_name, last_name, email)")
    .eq("id", studentId)
    .maybeSingle();
  throwIfSupabaseError(error);
  const row = (data ?? {}) as unknown as Row;
  const profile = row.profiles as Row | undefined;
  const displayName = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ")
    : undefined;

  return {
    displayName: displayName || undefined,
    studentNumber: typeof row.student_id === "string" ? row.student_id : undefined
  };
}

function requireOrganizerContext(context?: { actorRole?: string }) {
  if (context?.actorRole && context.actorRole !== "organizer" && context.actorRole !== "admin") {
    throw new RepositoryError("Only organizers can manage student credentials.", "PERMISSION_DENIED");
  }
}

function requireCredentialManagerContext(context?: { actorRole?: string }) {
  if (context?.actorRole && context.actorRole !== "student" && context.actorRole !== "organizer" && context.actorRole !== "admin") {
    throw new RepositoryError("Only students, organizers, and admins can manage this credential.", "PERMISSION_DENIED");
  }
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
  async listStudents(query, context) {
    const rows =
      context?.actorRole === "student"
        ? await selectRowsFiltered("students", query, studentReadSelect, { profile_id: context.actorUserId })
        : await selectRows("students", query, studentReadSelect);
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
  async listEvents(query, context) {
    if (context?.actorRole === "student") {
      const listQuery = queryOrDefault(query);
      const from = listQuery.pageIndex * listQuery.pageSize;
      const to = from + listQuery.pageSize - 1;
      const client = getSupabaseBrowserClient();
      let builder = client
        .from("events")
        .select(eventReadSelect, { count: "exact" })
        .eq("approval_status", "approved");

      if (listQuery.sortBy) {
        builder = builder.order(listQuery.sortBy, { ascending: listQuery.sortDirection !== "desc" });
      }

      const { data, error, count } = await builder.range(from, to);
      throwIfSupabaseError(error);
      const rows = pageResult((data ?? []) as unknown as Row[], count ?? data?.length ?? 0, listQuery);
      return pageResult(rows.items.map(mapEvent), rows.total, query);
    }

    const rows = await selectRows("events", query, eventReadSelect);
    return pageResult(rows.items.map(mapEvent), rows.total, query);
  },
  async getEventById(eventId, context) {
    const event = mapEvent(await selectSingleRowWithColumns("events", eventId, eventReadSelect));
    if (context?.actorRole === "student" && event.status !== "approved" && event.status !== "completed") {
      throw new RepositoryError("This event is not published for students.", "PERMISSION_DENIED");
    }
    return event;
  },
  async listEventParticipants(eventId, query) {
    const rows = await selectRows("event_participants", query);
    return pageResult(rows.items.filter((row) => String(row.event_id ?? "") === eventId).map(mapEventParticipant), rows.total, query);
  },
  async generateNextEventCode(context?: RepositoryContext) {
    const client = getSupabaseBrowserClient();
    const currentYear = new Date().getFullYear();
    
    const { data: events, error } = await client
      .from("events")
      .select("event_code")
      .order("created_at", { ascending: false })
      .limit(1);
    
    throwIfSupabaseError(error);
    
    let nextNumber = 1;
    if (events && events.length > 0) {
      const lastCode = events[0].event_code;
      const match = lastCode.match(/EVT-\d+-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    
    return `EVT-${currentYear}-${String(nextNumber).padStart(3, "0")}`;
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
        approval_status: "approved",
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

    const trimmedObjectives = (input.objectives ?? [])
      .map((objective) => objective.trim())
      .filter((objective) => objective.length > 0);

    if (trimmedObjectives.length > 0) {
      const { error: objectiveError } = await client.from("event_objectives").insert(
        trimmedObjectives.map((objective, index) => ({
          event_id: eventRow.id,
          objective_order: index + 1,
          objective_text: objective
        }))
      );
      if (objectiveError) {
        await client.from("events").delete().eq("id", eventRow.id);
        throwIfSupabaseError(objectiveError);
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
  },
  async rescheduleEvent(input: RescheduleEventInput) {
    const client = getSupabaseBrowserClient();
    const profile = await currentProfile();

    // Fetch current event
    const currentEvent = await supabaseEventManagementRepository.getEventById(input.eventId);

    // Build update payload with only provided fields
    const updatePayloadData: Record<string, unknown> = {};

    if (input.venue) {
      updatePayloadData.venue = input.venue;
    }

    // Handle date/time changes
    if (input.date || input.startTime || input.endTime) {
      const dateStr = input.date || currentEvent.startsAt.split("T")[0];
      const startTimeStr = input.startTime || currentEvent.startsAt.split("T")[1].substring(0, 5);
      const endTimeStr = input.endTime || currentEvent.endsAt.split("T")[1].substring(0, 5);

      updatePayloadData.starts_at = new Date(`${dateStr}T${startTimeStr}:00`).toISOString();
      updatePayloadData.ends_at = new Date(`${dateStr}T${endTimeStr}:00`).toISOString();
    }

    // Update event with type assertion for new migration columns
    const { data: updatedEvent, error: eventError } = await client
      .from("events")
      .update(updatePayloadData as never)
      .eq("id", input.eventId)
      .select(eventReadSelect)
      .single();
    throwIfSupabaseError(eventError);

    // Archive existing active sessions for this event if the linked schema includes the
    // migration columns. Older Supabase projects do not have these fields yet, so we
    // gracefully skip the archive step instead of making the reschedule save fail.
    const rescheduledReason = input.reason || `Event rescheduled on ${new Date().toLocaleDateString()}`;
    try {
      const { error: archiveError } = await client
        .from("event_sessions")
        .update({
          session_archive_status: "archived" as never,
          rescheduled_at: new Date().toISOString() as never,
          rescheduled_reason: rescheduledReason as never
        } as never)
        .eq("event_id", input.eventId)
        .eq("session_archive_status" as never, "active");
      throwIfSupabaseError(archiveError);
    } catch (error) {
      if (!isMissingRescheduleSchemaColumnError(error)) {
        throw error;
      }
    }

    // Log audit entry using the actual live audit_logs column name.
    const auditMetadata = {
      oldDate: currentEvent.startsAt,
      newDate: updatedEvent.starts_at,
      venue: input.venue || currentEvent.venue,
      reason: rescheduledReason
    };

    const { error: auditError } = await client.from("audit_logs").insert({
      actor_user_id: profile.id,
      action: "Rescheduled Event",
      target_type: "event",
      target_id: input.eventId,
      metadata: auditMetadata as never
    } as never);
    if (auditError && !isMissingRescheduleSchemaColumnError(auditError) && !isNonBlockingAuditLoggingError(auditError)) {
      throwIfSupabaseError(auditError);
    }

    return mapEvent(updatedEvent as Row);
  }
};



export const supabaseAttendanceSessionRepository: AttendanceSessionRepository = {
  async listAttendanceSessions(query) {
    const rows = await selectRowsFiltered("event_sessions", query, "*", {
      event_id: query?.eventId
    });
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
  async listAttendanceRecords(query, context) {
    const listQuery = queryOrDefault(query);
    const sessionId = (query as { sessionId?: string })?.sessionId;
    const studentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : undefined;
    const eventId = (query as { eventId?: string })?.eventId;

    const client = getSupabaseBrowserClient();
    let builder = client.from("attendance_records").select("*", { count: "exact" });

    if (eventId) {
      const { data: sessionRows, error: sessionError } = await client
        .from("event_sessions")
        .select("id")
        .eq("event_id", eventId);
      throwIfSupabaseError(sessionError);
      const sessionIds = (sessionRows ?? []).map((row) => String((row as Row).id ?? "")).filter(Boolean);
      if (sessionIds.length === 0) {
        return emptyPage(listQuery);
      }
      builder = builder.in("event_session_id", sessionIds);
    }

    if (sessionId) {
      builder = builder.eq("event_session_id", sessionId);
    }
    if (studentId) {
      builder = builder.eq("student_id", studentId);
    }
    if (listQuery.sortBy) {
      builder = builder.order(listQuery.sortBy, { ascending: listQuery.sortDirection !== "desc" });
    }

    const from = listQuery.pageIndex * listQuery.pageSize;
    const to = from + listQuery.pageSize - 1;
    const { data, error, count } = await builder.range(from, to);
    throwIfSupabaseError(error);
    return pageResult((data ?? []).map(mapAttendanceRecord), count ?? data?.length ?? 0, listQuery);
  },
  async getAttendanceRecordById(recordId, context) {
    const row = await selectSingleRow("attendance_records", recordId);
    if (context?.actorRole === "student") {
      const studentId = await currentStudentIdForProfile(context.actorUserId);
      if (String(row.student_id ?? "") !== studentId) {
        throw new RepositoryError("Students can only read their own attendance records.", "PERMISSION_DENIED");
      }
    }
    return mapAttendanceRecord(row);
  },
  async recordCredentialAttendance(input) {
    const session = await supabaseAttendanceSessionRepository.getAttendanceSessionById(input.sessionId);
    const occurredAt = input.occurredAt ?? getPhilippineNowIso();

    if (session.status !== "active") {
      return credentialScanResult(input, "No Active Session", occurredAt, "This attendance session is not active.", {
        failedAttempts: 1
      });
    }

    const client = getSupabaseBrowserClient();
    if (input.method === "facial") {
      const studentId = input.credentialCode.trim();
      const similarity = input.faceSimilarity ?? 0;
      if (!studentId || similarity < 0.82) {
        await insertVerificationAttempt(input.sessionId, "facial", false, "facial_no_match", "Face did not meet the attendance verification threshold.", occurredAt, {
          studentId: studentId || undefined
        });
        return credentialScanResult(input, "Invalid Credential", occurredAt, "Face could not be verified for attendance.", { failedAttempts: 1 });
      }

      const { data: facialProfile, error: facialProfileError } = await client
        .from("facial_profiles")
        .select("id, facial_status")
        .eq("student_id", studentId)
        .maybeSingle();
      throwIfSupabaseError(facialProfileError);
      const facialProfileRow = facialProfile as Row | null;
      if (!facialProfileRow || facialProfileRow.facial_status !== "activated") {
        await insertVerificationAttempt(input.sessionId, "facial", false, "facial_not_enrolled", "Student has no active facial enrollment.", occurredAt, { studentId });
        return credentialScanResult(input, "Blocked Credential", occurredAt, "Student has no active facial enrollment.", { failedAttempts: 1 });
      }

      const { data: participant, error: participantError } = await client
        .from("event_participants")
        .select("id")
        .eq("event_id", session.eventId ?? "")
        .eq("student_id", studentId)
        .maybeSingle();
      throwIfSupabaseError(participantError);
      if (!participant) {
        await insertVerificationAttempt(input.sessionId, "facial", false, "not_enrolled", "Student is not enrolled in this event.", occurredAt, { studentId, facialProfileId: String(facialProfileRow.id) });
        return credentialScanResult(input, "Student Not Enrolled", occurredAt, "Student is not enrolled in this event.", { failedAttempts: 1 });
      }

      const windowStart = new Date(session.attendanceWindowStartAt ?? session.startsAt).getTime();
      const windowEnd = session.attendanceWindowEndAt ?? session.endsAt;
      const scannedAt = new Date(occurredAt).getTime();
      const lateCutoff = new Date(session.lateCutoffAt ?? new Date(new Date(session.startsAt).getTime() + 15 * 60_000).toISOString()).getTime();
      if (scannedAt < windowStart || (windowEnd && scannedAt > new Date(windowEnd).getTime()) || scannedAt > lateCutoff) {
        await insertVerificationAttempt(input.sessionId, "facial", false, "outside_window", "Facial verification is outside the attendance window.", occurredAt, { studentId, facialProfileId: String(facialProfileRow.id) });
        return credentialScanResult(input, "Outside Attendance Window", occurredAt, "Facial verification is outside the attendance window or needs late review.", { failedAttempts: 1 });
      }

      const { data: existingRows, error: existingError } = await client
        .from("attendance_records")
        .select("*")
        .eq("event_session_id", input.sessionId)
        .eq("student_id", studentId)
        .limit(1);
      throwIfSupabaseError(existingError);
      const existing = existingRows?.[0] as Row | undefined;
      const studentSummary = await studentScanSummary(studentId);

      if (existing?.time_in && existing.time_out) {
        const record = mapAttendanceRecord(existing);
        return credentialScanResult(input, "Already Recorded", record.recordedAt, "Student has already checked in and out.", {
          duplicateAttempts: 1, attendanceRecord: record, attendanceStatus: record.status, ...studentSummary
        });
      }

      const profile = await currentProfile();
      if (existing?.time_in) {
        const updatedRow = await updateRow("attendance_records", String(existing.id ?? ""), {
          time_out: occurredAt,
          checkout_verification_method: "facial",
          updated_at: new Date().toISOString(),
          recorded_by: String(profile.id ?? "")
        });
        const updatedRecord = mapAttendanceRecord(updatedRow);
        await insertVerificationAttempt(input.sessionId, "facial", true, undefined, "Face verified for check-out.", occurredAt, { studentId, facialProfileId: String(facialProfileRow.id) });
        await updateRow("facial_profiles", String(facialProfileRow.id), { last_verified_at: occurredAt, updated_at: new Date().toISOString() });
        return credentialScanResult(input, "Present", occurredAt, "Student checked out successfully.", {
          attendanceRecord: updatedRecord, attendanceStatus: updatedRecord.status, present: 1, ...studentSummary
        });
      }

      const attempt = await insertVerificationAttempt(input.sessionId, "facial", true, undefined, "Face verified for check-in.", occurredAt, { studentId, facialProfileId: String(facialProfileRow.id) });
      const recordRow = await insertRow("attendance_records", {
        event_session_id: input.sessionId,
        student_id: studentId,
        verification_attempt_id: String(attempt.id ?? ""),
        attendance_status: "present",
        verification_method: "facial",
        time_in: occurredAt,
        recorded_at: occurredAt,
        recorded_by: String(profile.id ?? "")
      });
      await updateRow("facial_profiles", String(facialProfileRow.id), { last_verified_at: occurredAt, updated_at: new Date().toISOString() });
      const record = mapAttendanceRecord(recordRow);
      return credentialScanResult(input, "Present", occurredAt, "Student checked in successfully.", {
        attendanceRecord: record, attendanceStatus: "present", present: 1, ...studentSummary
      });
    }

    const code = normalizeQrCredentialCode(input.credentialCode);

    if (!code) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "invalid_code", "QR code is empty.", occurredAt);
      return credentialScanResult(input, "Invalid Credential", occurredAt, "QR code is empty.", { failedAttempts: 1 });
    }

    const { data: credential, error: credentialError } = await client
      .from("qr_credentials")
      .select("*")
      .eq("id", code)
      .maybeSingle();
    throwIfSupabaseError(credentialError);

    if (!credential) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "invalid_qr", "QR credential was not found.", occurredAt);
      return credentialScanResult(input, "Invalid Credential", occurredAt, "QR credential was not found.", { failedAttempts: 1 });
    }

    const credentialRow = credential as Row;
    const credentialStatus = String(credentialRow.credential_status ?? "");
    const expiresAt = typeof credentialRow.expires_at === "string" ? credentialRow.expires_at : undefined;
    const isExpired = Boolean(expiresAt && new Date(expiresAt).getTime() <= new Date(occurredAt).getTime());
    if (credentialStatus !== "activated" || credentialRow.revoked_at || isExpired) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "blocked_qr", "QR credential is not active.", occurredAt, {
        studentId: String(credentialRow.student_id ?? ""),
        qrCredentialId: String(credentialRow.id ?? "")
      });
      return credentialScanResult(input, "Blocked Credential", occurredAt, "QR credential is not active.", { failedAttempts: 1 });
    }

    const studentId = String(credentialRow.student_id ?? "");
    const { data: participant, error: participantError } = await client
      .from("event_participants")
      .select("id")
      .eq("event_id", session.eventId ?? "")
      .eq("student_id", studentId)
      .maybeSingle();
    throwIfSupabaseError(participantError);

    if (!participant) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "not_enrolled", "Student is not enrolled in this event.", occurredAt, {
        studentId,
        qrCredentialId: String(credentialRow.id ?? "")
      });
      return credentialScanResult(input, "Student Not Enrolled", occurredAt, "Student is not enrolled in this event.", { failedAttempts: 1 });
    }

    const windowStart = new Date(session.attendanceWindowStartAt ?? session.startsAt).getTime();
    const windowEnd = session.attendanceWindowEndAt ?? session.endsAt;
    const scannedAt = new Date(occurredAt).getTime();
    if (scannedAt < windowStart || (windowEnd && scannedAt > new Date(windowEnd).getTime())) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "outside_window", "QR scan is outside the attendance window.", occurredAt, {
        studentId,
        qrCredentialId: String(credentialRow.id ?? "")
      });
      return credentialScanResult(input, "Outside Attendance Window", occurredAt, "QR scan is outside the attendance window.", { failedAttempts: 1 });
    }

    const lateCutoff = new Date(session.lateCutoffAt ?? new Date(new Date(session.startsAt).getTime() + 15 * 60_000).toISOString()).getTime();
    if (scannedAt > lateCutoff) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "late_reason_required", "Late QR scans need organizer review before they are recorded.", occurredAt, {
        studentId,
        qrCredentialId: String(credentialRow.id ?? "")
      });
      return credentialScanResult(input, "Outside Attendance Window", occurredAt, "Late QR scans need organizer review before they are recorded.", { failedAttempts: 1 });
    }

    const { data: existingRows, error: existingError } = await client
      .from("attendance_records")
      .select("*")
      .eq("event_session_id", input.sessionId)
      .eq("student_id", studentId)
      .limit(1);
    throwIfSupabaseError(existingError);

    const existing = existingRows?.[0] as Row | undefined;
    
    // Handle check-in/check-out logic
    if (existing) {
      const existingTimeOut = existing.time_out;
      
      // If both time_in and time_out are already set, this is a duplicate attempt after check-out
      if (existing.time_in && existingTimeOut) {
        const record = mapAttendanceRecord(existing);
        return credentialScanResult(input, "Already Recorded", record.recordedAt, "Student has already checked in and out.", {
          duplicateAttempts: 1,
          attendanceRecord: record,
          attendanceStatus: record.status
        });
      }
      
      // If time_out is NULL, this is a CHECK-OUT attempt
      if (!existingTimeOut && existing.time_in) {
        const record = mapAttendanceRecord(existing);
        const profile = await currentProfile();
        
        // Update the record with check-out time and verification method
        const updatedRow = await updateRow("attendance_records", String(existing.id ?? ""), {
          time_out: occurredAt,
          updated_at: new Date().toISOString(),
          recorded_by: String(profile.id ?? "")
        });
        
        const updatedRecord = mapAttendanceRecord(updatedRow as Row);
        const studentSummary = await studentScanSummary(studentId);
        
        await insertVerificationAttempt(input.sessionId, input.method, true, undefined, "QR credential accepted for check-out.", occurredAt, {
          studentId,
          qrCredentialId: String(credentialRow.id ?? "")
        });
        
        return credentialScanResult(input, "Present", occurredAt, "Student checked out successfully.", {
          attendanceRecord: updatedRecord,
          attendanceStatus: updatedRecord.status,
          present: 1,
          studentDisplayName: studentSummary.displayName,
          studentNumber: studentSummary.studentNumber
        });
      }
    }

    // No existing record: CREATE CHECK-IN
    const attempt = await insertVerificationAttempt(input.sessionId, input.method, true, undefined, "QR credential accepted.", occurredAt, {
      studentId,
      qrCredentialId: String(credentialRow.id ?? "")
    });
    const profile = await currentProfile();
    const recordRow = await insertRow("attendance_records", {
      event_session_id: input.sessionId,
      student_id: studentId,
      verification_attempt_id: String(attempt.id ?? ""),
      attendance_status: "present",
      verification_method: "qr",
      time_in: occurredAt,
      recorded_at: occurredAt,
      recorded_by: String(profile.id ?? "")
    });
    await updateRow("qr_credentials", String(credentialRow.id ?? ""), {
      last_successful_check_in_at: occurredAt,
      updated_at: new Date().toISOString()
    });

    const record = mapAttendanceRecord(recordRow);
    const studentSummary = await studentScanSummary(studentId);
    return credentialScanResult(input, "Present", occurredAt, "Student checked in successfully.", {
      attendanceRecord: record,
      attendanceStatus: "present",
      present: 1,
      studentDisplayName: studentSummary.displayName,
      studentNumber: studentSummary.studentNumber
    });
  },
  async recordManualAttendance(input) {
    const session = await supabaseAttendanceSessionRepository.getAttendanceSessionById(input.sessionId);
    if (session.status !== "active") throw new RepositoryError("This attendance session is not active.", "VALIDATION_ERROR");
    const client = getSupabaseBrowserClient();
    const { data: existing, error: existingError } = await client.from("attendance_records").select("*").eq("event_session_id", input.sessionId).eq("student_id", input.studentId).maybeSingle();
    throwIfSupabaseError(existingError);
    
    const sessionStart = new Date(session.startsAt).getTime();
    const recordedAt = input.occurredAt ?? getPhilippineNowIso();
    const lateCutoff = new Date(session.lateCutoffAt ?? new Date(sessionStart + 15 * 60_000).toISOString()).getTime();
    
    // Handle check-in/check-out logic
    if (existing) {
      const existingTimeOut = existing.time_out;
      
      // If both time_in and time_out are already set, this is a duplicate attempt after check-out
      if (existing.time_in && existingTimeOut) {
        const record = mapAttendanceRecord(existing);
        return { 
          resultStatus: "Already Recorded", 
          attendanceStatus: record.status, 
          verificationMethod: "manual", 
          recordedAt: record.recordedAt, 
          safeMessage: "Student has already checked in and out.", 
          attendanceRecord: record, 
          summary: { present: 0, late: 0, absent: 0, duplicateAttempts: 1, failedAttempts: 0 } 
        };
      }
      
      // If time_out is NULL, this is a CHECK-OUT attempt
      if (!existingTimeOut && existing.time_in) {
        const profile = await currentProfile();
        const existingStatus = ((existing.attendance_status as string | null) ?? "present").toLowerCase();
        const existingLateReason = typeof existing.late_reason_category === "string" ? existing.late_reason_category : undefined;

        // During checkout, preserve the original status and never overwrite an
        // already-recorded late reason. Only the checkout timestamp and method change.
        const updateData: Record<string, unknown> = {
          time_out: recordedAt,
          updated_at: new Date().toISOString(),
          recorded_by: String(profile.id ?? "")
        };

        if (existingStatus === "late" && existingLateReason) {
          updateData.late_reason_category = existingLateReason;
        }

        const updatedRow = await updateRow("attendance_records", String(existing.id ?? ""), updateData);
        const updatedRecord = mapAttendanceRecord(updatedRow as Row);

        return {
          resultStatus: updatedRecord.status === "late" ? "Late" : "Present",
          attendanceStatus: updatedRecord.status,
          verificationMethod: "manual",
          recordedAt,
          safeMessage: "Student checked out successfully.",
          attendanceRecord: updatedRecord,
          summary: { present: updatedRecord.status === "present" ? 1 : 0, late: updatedRecord.status === "late" ? 1 : 0, absent: 0, duplicateAttempts: 0, failedAttempts: 0 }
        };
      }
    }
    
    // No existing record: CREATE CHECK-IN
    // During check-in, determine status based on time and allow status override
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
    return { 
      resultStatus: status === "late" ? "Late" : "Present", 
      attendanceStatus: status, 
      verificationMethod: "manual", 
      recordedAt, 
      safeMessage: `Student checked in as ${status}.`, 
      attendanceRecord: record, 
      summary: { present: status === "present" ? 1 : 0, late: status === "late" ? 1 : 0, absent: 0, duplicateAttempts: 0, failedAttempts: 0 } 
    };
  },
  async submitLateReason(input: SubmitLateReasonInput, context) {
    const client = getSupabaseBrowserClient();
    if (context?.actorRole === "student") {
      const studentId = await currentStudentIdForProfile(context.actorUserId);
      const { data: record, error: recordError } = await client
        .from("attendance_records")
        .select("id, student_id")
        .eq("id", input.attendanceRecordId)
        .maybeSingle();
      throwIfSupabaseError(recordError);
      if (!record || String(record.student_id) !== studentId) {
        throw new RepositoryError("Students can only submit late reasons for their own attendance records.", "PERMISSION_DENIED");
      }
    }
    const { data, error } = await client.rpc("submit_late_reason", {
      p_attendance_record_id: input.attendanceRecordId,
      p_late_reason_category: input.reason
    });
    throwIfSupabaseError(error);
    return mapAttendanceRecord(data as Row);
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
  async listCorrectionRequests(query, context) {
    const studentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : undefined;
    const rows = studentId
      ? await selectRowsFiltered("attendance_requests", query, "*", { student_id: studentId })
      : await selectRows("attendance_requests", query);
    return pageResult(rows.items.map(mapCorrectionRequest), rows.total, query);
  },
  async createCorrectionRequest(input, context) {
    if (!input.attendanceRecordId) {
      throw new RepositoryError("An attendance record is required to create a correction request.", "VALIDATION_ERROR");
    }

    const studentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : input.studentId;
    if (!studentId) {
      throw new RepositoryError("A student profile is required to create a correction request.", "VALIDATION_ERROR");
    }

    const reason = input.reason.trim();
    if (!reason) {
      throw new RepositoryError("A reason is required to create a correction request.", "VALIDATION_ERROR");
    }

    const client = getSupabaseBrowserClient();
    if (context?.actorRole === "student") {
      const { data: record, error: recordError } = await client
        .from("attendance_records")
        .select("id, student_id, attendance_status")
        .eq("id", input.attendanceRecordId)
        .maybeSingle();
      throwIfSupabaseError(recordError);
      if (!record || String(record.student_id) !== studentId) {
        throw new RepositoryError("Students can only create correction requests for their own attendance records.", "PERMISSION_DENIED");
      }
      const allowedStatuses = allowedCorrectionStatusesForAttendance(String(record.attendance_status) as AttendanceStatus);
      if (!allowedStatuses.includes(input.requestedStatus)) {
        throw new RepositoryError("This attendance record is not eligible for the requested correction.", "VALIDATION_ERROR");
      }
    }

    const { data: existingPendingRequests, error: existingPendingRequestError } = await client
      .from("attendance_requests")
      .select("id")
      .eq("student_id", studentId)
      .eq("attendance_record_id", input.attendanceRecordId)
      .eq("request_status", "pending")
      .limit(1);
    throwIfSupabaseError(existingPendingRequestError);
    if (existingPendingRequests?.length) {
      throw new RepositoryError("You already have a pending correction request for this attendance record.", "VALIDATION_ERROR");
    }

    if (!input.proofAttachment) {
      throw new RepositoryError("Proof attachment is required to create a correction request.", "VALIDATION_ERROR");
    }

    const requestId = crypto.randomUUID();
    const proofFileId = crypto.randomUUID();
    const safeFileName = sanitizeStorageFileName(input.proofAttachment.name);
    const proofObjectPath = `${studentId}/${requestId}/${proofFileId}-${safeFileName}`;
    const { error: uploadError } = await client.storage
      .from(attendanceRequestProofBucket)
      .upload(proofObjectPath, input.proofAttachment, {
        cacheControl: "3600",
        contentType: input.proofAttachment.type || undefined,
        upsert: false
      });
    throwIfSupabaseError(uploadError);

    const inserted = await insertRow("attendance_requests", {
      id: requestId,
      student_id: studentId,
      attendance_record_id: input.attendanceRecordId,
      explanation: reason,
      requested_status: input.requestedStatus,
      request_status: "pending"
    });

    await insertRow("attendance_request_attachments", {
      request_id: requestId,
      storage_bucket: attendanceRequestProofBucket,
      storage_object_path: proofObjectPath,
      original_file_name: input.proofAttachment.name,
      mime_type: input.proofAttachment.type || "application/octet-stream",
      file_size_bytes: input.proofAttachment.size
    });

    return mapCorrectionRequest(inserted);
  },
  async reviewCorrectionRequest(input, context) {
    requireOrganizerContext(context);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.rpc("review_attendance_request", {
      p_request_id: input.requestId,
      p_status: input.status,
      p_reason: input.reason ?? null
    });
    throwIfSupabaseError(error);
    return mapCorrectionRequest(data as Row);
  }
};

export const supabaseCredentialRequestRepository: CredentialRequestRepository = {
  async listCredentialRequests(query, context) {
    if (context?.actorRole === "student") {
      const studentId = await currentStudentIdForProfile(context.actorUserId);
      const rows = await selectRowsFiltered("credential_requests", query, "*", { student_id: studentId });
      return pageResult(rows.items.map(mapCredentialRequest), rows.total, query);
    }

    const rows = await selectRows("credential_requests", query);
    return pageResult(rows.items.map(mapCredentialRequest), rows.total, query);
  },
  async createCredentialRequest(input, context) {
    const studentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : input.studentId;
    if (!studentId) {
      throw new RepositoryError("A student profile is required to create a credential request.", "VALIDATION_ERROR");
    }

    const reason = input.reason.trim();
    if (!reason) {
      throw new RepositoryError("A reason is required to create a credential request.", "VALIDATION_ERROR");
    }

    const client = getSupabaseBrowserClient();
    const { data: existingPendingRequest, error: existingPendingRequestError } = await client
      .from("credential_requests")
      .select("id")
      .eq("student_id", studentId)
      .eq("credential_type", input.credentialType)
      .eq("request_type", input.requestType)
      .eq("request_status", "pending")
      .maybeSingle();
    throwIfSupabaseError(existingPendingRequestError);
    if (existingPendingRequest) {
      throw new RepositoryError("You already have a pending request for this credential issue.", "VALIDATION_ERROR");
    }

    const requestId = crypto.randomUUID();
    let proofObjectPath: string | undefined;

    if (input.proofAttachment) {
      const proofFileId = crypto.randomUUID();
      const safeFileName = sanitizeStorageFileName(input.proofAttachment.name);
      proofObjectPath = `${studentId}/${requestId}/${proofFileId}-${safeFileName}`;
      const { error: uploadError } = await client.storage
        .from(credentialRequestProofBucket)
        .upload(proofObjectPath, input.proofAttachment, {
          cacheControl: "3600",
          contentType: input.proofAttachment.type || undefined,
          upsert: false
        });
      throwIfSupabaseError(uploadError);
    }

    const inserted = await insertRow("credential_requests", {
      id: requestId,
      student_id: studentId,
      credential_type: input.credentialType,
      request_type: input.requestType,
      reason,
      request_status: "pending"
    });

    if (input.proofAttachment && proofObjectPath) {
      await insertRow("credential_request_attachments", {
        request_id: requestId,
        storage_bucket: credentialRequestProofBucket,
        storage_object_path: proofObjectPath,
        original_file_name: input.proofAttachment.name,
        mime_type: input.proofAttachment.type || "application/octet-stream",
        file_size_bytes: input.proofAttachment.size
      });
    }

    return mapCredentialRequest(inserted);
  },
  async reviewCredentialRequest(input, context) {
    requireOrganizerContext(context);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.rpc("review_credential_request", {
      p_request_id: input.requestId,
      p_status: input.status,
      p_remarks: input.remarks ?? null
    });
    throwIfSupabaseError(error);
    return mapCredentialRequest(data as Row);
  }
};

export const supabaseStudentCredentialRepository: StudentCredentialRepository = {
  async getStudentCredentialStatus(studentId, context) {
    const scopedStudentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : studentId;
    const client = getSupabaseBrowserClient();
    const { data: qrRows, error: qrError } = await client
      .from("qr_credentials")
      .select("id, student_id, credential_status, issued_at, expires_at, revoked_at, last_successful_check_in_at, created_at, updated_at")
      .eq("student_id", scopedStudentId)
      .order("issued_at", { ascending: false })
      .limit(1);
    throwIfSupabaseError(qrError);

    const { data: facialRow, error: facialError } = await client
      .from("facial_profiles")
      .select("id, student_id, facial_status, enrolled_at, last_verified_at, consent_recorded_at, created_at, updated_at")
      .eq("student_id", scopedStudentId)
      .maybeSingle();
    throwIfSupabaseError(facialError);

    return {
      studentId: scopedStudentId,
      qrCredential: qrRows?.[0] ? mapQrCredential(qrRows[0] as Row) : undefined,
      facialProfile: facialRow ? mapFacialProfile(facialRow as Row) : undefined
    };
  },
  async issueQrCredential(input: IssueQrCredentialInput, context) {
    requireOrganizerContext(context);
    const client = getSupabaseBrowserClient();
    const { error } = await client.rpc("issue_qr_credential", {
      p_student_id: input.studentId,
      p_expires_at: input.expiresAt ?? null
    });
    throwIfSupabaseError(error);
    return supabaseStudentCredentialRepository.getStudentCredentialStatus(input.studentId, context);
  },
  async enrollFacialProfile(input: EnrollFacialProfileInput, context) {
    requireCredentialManagerContext(context);
    const client = getSupabaseBrowserClient();
    const isStudentEnrollment = context?.actorRole === "student";
    const scopedStudentId = isStudentEnrollment ? await currentStudentIdForProfile(context.actorUserId) : input.studentId;

    if (isStudentEnrollment && scopedStudentId !== input.studentId) {
      throw new RepositoryError("Students can only enroll their own facial profile.", "PERMISSION_DENIED");
    }

    if (isStudentEnrollment) {
      if (!input.faceImage) {
        throw new RepositoryError("A face photo is required for student facial enrollment.", "VALIDATION_ERROR");
      }
      if (!input.faceDescriptor || input.faceDescriptor.length < 32) {
        throw new RepositoryError("A clear live face descriptor is required for facial enrollment.", "VALIDATION_ERROR");
      }
    }

    let enrollmentReference = input.enrollmentReference?.trim() || `face-${scopedStudentId}-${Date.now()}`;

    if (input.faceImage) {
      const safeFileName = sanitizeStorageFileName(input.faceImage.name || "face-enrollment.jpg");
      const filePath = `${scopedStudentId}/${Date.now()}-${safeFileName}`;
      const { error: uploadError } = await client.storage
        .from(facialEnrollmentBucket)
        .upload(filePath, input.faceImage, {
          cacheControl: "3600",
          contentType: input.faceImage.type || "image/jpeg",
          upsert: false
        });
      throwIfSupabaseError(uploadError);
      enrollmentReference = filePath;
    }

    if (!isStudentEnrollment) {
      throw new RepositoryError("Facial enrollment must be completed by the signed-in student after organizer approval.", "PERMISSION_DENIED");
    }

    const { data, error } = await client.rpc("complete_facial_enrollment", {
      p_enrollment_reference: enrollmentReference
    });
    throwIfSupabaseError(error);
    void data;

    const { error: descriptorError } = await client.rpc("store_facial_descriptor", {
      p_face_descriptor: input.faceDescriptor ?? []
    });
    throwIfSupabaseError(descriptorError);

    return supabaseStudentCredentialRepository.getStudentCredentialStatus(scopedStudentId, context);
  },
  async setCredentialStatus(input, context) {
    requireOrganizerContext(context);
    const client = getSupabaseBrowserClient();
    const { error } = await client.rpc("set_student_credential_status", {
      p_student_id: input.studentId,
      p_credential_type: input.credentialType,
      p_status: input.status
    });
    throwIfSupabaseError(error);
    return supabaseStudentCredentialRepository.getStudentCredentialStatus(input.studentId, context);
  }
};

export const supabaseEventFeedbackRepository: EventFeedbackRepository = {
  async listEventObjectives(eventId, context) {
    if (context?.actorRole === "student") {
      await supabaseEventManagementRepository.getEventById(eventId, context);
    }
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("event_objectives")
      .select("*")
      .eq("event_id", eventId)
      .order("objective_order", { ascending: true });
    throwIfSupabaseError(error);
    return ((data ?? []) as Row[]).map(mapEventObjective);
  },

  async listStudentFeedback(studentId, context) {
    const client = getSupabaseBrowserClient();
    const scopedStudentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : studentId;
    if (!scopedStudentId) return [];
    const { data, error } = await client
      .from("event_feedback")
      .select("*, event_feedback_ratings(*)")
      .eq("student_id", scopedStudentId)
      .order("submitted_at", { ascending: false });
    throwIfSupabaseError(error);
    return ((data ?? []) as Row[]).map(mapEventFeedback);
  },

  async submitEventFeedback(input: SubmitEventFeedbackInput, context) {
    const client = getSupabaseBrowserClient();
    const studentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : input.studentId;
    if (!studentId) {
      throw new RepositoryError("A student profile is required to submit event feedback.", "VALIDATION_ERROR");
    }
    if (context?.actorRole === "student") {
      await supabaseEventManagementRepository.getEventById(input.eventId, context);
      const { data: record, error: recordError } = await client
        .from("attendance_records")
        .select("id, student_id, event_session_id, event_sessions(event_id)")
        .eq("id", input.attendanceRecordId)
        .maybeSingle();
      throwIfSupabaseError(recordError);
      const session = Array.isArray(record?.event_sessions) ? record?.event_sessions[0] : record?.event_sessions;
      const recordEventId = typeof session?.event_id === "string" ? session.event_id : "";
      if (!record || String(record.student_id) !== studentId || recordEventId !== input.eventId) {
        throw new RepositoryError("Students can only submit feedback for their own attendance records.", "PERMISSION_DENIED");
      }
    }
    if (input.ratings.length > 0) {
      const objectiveIds = input.ratings.map((rating) => rating.objectiveId);
      if (
        input.ratings.some((rating) => !Number.isInteger(rating.rating) || rating.rating < 1 || rating.rating > 5) ||
        new Set(objectiveIds).size !== objectiveIds.length
      ) {
        throw new RepositoryError("Feedback ratings must be unique whole numbers from 1 to 5.", "VALIDATION_ERROR");
      }

      const { data: objectives, error: objectivesError } = await client
        .from("event_objectives")
        .select("id")
        .eq("event_id", input.eventId)
        .in("id", objectiveIds);
      throwIfSupabaseError(objectivesError);
      const validObjectiveIds = new Set((objectives ?? []).map((objective) => String(objective.id)));
      if (objectiveIds.some((objectiveId) => !validObjectiveIds.has(objectiveId))) {
        throw new RepositoryError("Feedback ratings can only reference objectives from this event.", "VALIDATION_ERROR");
      }
    }
    const comment = input.comment?.trim() || null;
    const { data: existing, error: existingError } = await client
      .from("event_feedback")
      .select("*")
      .eq("event_id", input.eventId)
      .eq("student_id", studentId)
      .maybeSingle();
    throwIfSupabaseError(existingError);

    const feedbackValues = {
      event_id: input.eventId,
      student_id: studentId,
      attendance_record_id: input.attendanceRecordId,
      comment,
      updated_at: new Date().toISOString()
    };

    const feedbackResult = existing
      ? await client
          .from("event_feedback")
          .update(feedbackValues)
          .eq("id", existing.id)
          .select("*")
          .single()
      : await client
          .from("event_feedback")
          .insert(feedbackValues)
          .select("*")
          .single();
    throwIfSupabaseError(feedbackResult.error);

    const feedback = feedbackResult.data as Row;
    const feedbackId = String(feedback.id ?? "");
    const { error: clearRatingsError } = await client
      .from("event_feedback_ratings")
      .delete()
      .eq("feedback_id", feedbackId);
    throwIfSupabaseError(clearRatingsError);

    if (input.ratings.length > 0) {
      const { error: ratingsError } = await client
        .from("event_feedback_ratings")
        .insert(
          input.ratings.map((rating) => ({
            feedback_id: feedbackId,
            objective_id: rating.objectiveId,
            rating: rating.rating
          }))
        );
      throwIfSupabaseError(ratingsError);
    }

    const { data: saved, error: savedError } = await client
      .from("event_feedback")
      .select("*, event_feedback_ratings(*)")
      .eq("id", feedbackId)
      .single();
    throwIfSupabaseError(savedError);
    return mapEventFeedback(saved as Row);
  }
};

export const supabaseReportRepository: ReportRepository = {
  async listReports(query) {
    const rows = await selectRows("generated_reports", query);
    return pageResult(rows.items.map(mapReport), rows.total, query);
  }
};

export const supabaseNotificationRepository: NotificationRepository = {
  async listNotifications(query, context) {
    const recipientId = context?.actorUserId ?? String((await currentProfile()).id ?? "");
    const rows = await selectRowsFiltered("notifications", query, "*", { recipient_id: recipientId });
    return pageResult(rows.items.map(mapNotification), rows.total, query);
  },
  async markNotificationRead(notificationId, context) {
    const recipientId = context?.actorUserId ?? String((await currentProfile()).id ?? "");
    const row = await selectSingleRow("notifications", notificationId);
    if (String(row.recipient_id ?? "") !== recipientId) {
      throw new RepositoryError("Users can only update their own notifications.", "PERMISSION_DENIED");
    }
    return mapNotification(await updateRow("notifications", notificationId, { notification_status: "read", read_at: new Date().toISOString() }));
  },
  async markAllNotificationsRead(context) {
    const client = getSupabaseBrowserClient();
    const recipientId = context?.actorUserId ?? String((await currentProfile()).id ?? "");
    const { data, error } = await client.from("notifications").update({ notification_status: "read", read_at: new Date().toISOString() }).eq("recipient_id", recipientId).select("*");
    throwIfSupabaseError(error);
    return ((data ?? []) as Row[]).map(mapNotification);
  }
};

export const supabaseAuditLogRepository: AuditLogRepository = {
  async listAuditLogs(query) {
    const rows = await selectRows("audit_logs", query);
    return pageResult(rows.items.map(mapAuditLog), rows.total, query);
  },
  async logClientAction(input) {
    console.log("[logClientAction] Called with input:", input);
    // Note: log_client_action RPC is not currently defined in Supabase.
    // Audit logging is available through the audit_logs table if needed.
    // For now, we only log to console for debugging purposes.
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
  credentialRequests: supabaseCredentialRequestRepository,
  studentCredentials: supabaseStudentCredentialRepository,
  eventFeedback: supabaseEventFeedbackRepository,
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
