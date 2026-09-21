import type {
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
  AttendanceScanInput,
  AttendanceSubmissionResultStatus,
  EnrollFacialProfileInput,
  IssueQrCredentialInput,
  RescheduleEventInput,
  StudentCredentialRepository,
  SubmitLateReasonInput,
  SubmitEventFeedbackInput,
  SystemHealthRepository,
  SystemHealthIssue,
  SystemHealthSnapshot,
  FailedNotificationJob,
  SystemSettingsRepository,
  UserManagementRepository
} from "@/services/contracts";
import type { Database, Json } from "@/lib/supabase/database.types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { APP_ROUTES } from "@/lib/constants/routes";
import { dateKey, manilaDateTimeToIso } from "@/lib/utils/date";
import { mapSupabaseError, throwIfSupabaseError } from "@/lib/supabase/errors";
import {
  mapAttendanceRecord,
  mapAttendanceSession,
  mapAuditLog,
  mapCorrectionRequest,
  mapCredentialRequest,
  mapEvent,
  mapEventFeedback,
  mapEventFeedbackTask,
  mapEventObjective,
  mapEventParticipant,
  mapEventSummarySnapshot,
  mapLateReasonOption,
  mapFacialProfile,
  mapNotification,
  mapOrganizer,
  mapProfileToUser,
  mapQrCredential,
  mapReport,
  mapStudent
} from "@/lib/supabase/mappers";
import { RepositoryError } from "@/services/repositoryUtils";
import { normalizeStudentIdentityValue, studentIdentityMatchesPayload } from "@/lib/credentials/qrCredential";
import { getPhilippineNowIso } from "@/lib/utils/date";
import type {
  AdminProfile,
  DepartmentBranding,
  Class,
  ClassRoster,
  Department,
  FacultyProfile,
  MlPrediction,
  Program,
  Semester,
  StudentCredentialStatus,
  StudentDashboardSummary,
  SystemSettings
} from "@/types/domain";
import type { FacultyEmploymentStatus } from "@/types/enums";
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

async function getFunctionInvocationErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "The server could not complete the request.";
  const response = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;

  if (response && typeof response === "object" && "json" in response && typeof response.json === "function") {
    const body = await (response as Response).clone().json().catch(() => null) as { error?: unknown } | null;
    if (typeof body?.error === "string" && body.error.trim()) return body.error;
  }

  return fallback;
}

const defaultPageSize = 20;
const eventReadSelect = "*, event_categories(category_name)";
const studentReadSelect = "*, profiles(first_name, middle_name, last_name, name_extension, email, account_status), sections(section_name, year_level), programs(program_code, program_name)";
const attendanceSessionReadSelect = "id, event_id, created_by, session_name, venue, mode, session_status, scheduled_start, scheduled_end, actual_start, actual_end, attendance_window_start_at, attendance_window_end_at, late_cutoff_at, ended_reason, session_archive_status, superseded_by, created_at, updated_at";
const attendanceRecordReadSelect = "id, event_session_id, student_id, attendance_status, verification_method, checkout_verification_method, time_in, time_out, recorded_at, recorded_by, remarks, late_reason_category, late_reason_option_id, verification_attempt_id, local_attendance_uuid, created_at, updated_at";
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
  const { data, error } = await client.from(table).select("*").eq("id" as never, id).maybeSingle();
  throwIfSupabaseError(error);
  if (!data) {
    throw new RepositoryError(`${table} row was not found.`, "NOT_FOUND");
  }
  return data as unknown as Row;
}

async function selectSingleRowWithColumns(table: TableName, id: string, columns: string): Promise<Row> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.from(table).select(columns).eq("id" as never, id).maybeSingle();
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
  const { data, error } = await client.from(table).update(values as never).eq("id" as never, id).select("*").single();
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

function requireBrandingContext(context: { actorRole?: string } | undefined, organizerId: string) {
  if (context?.actorRole === "student") {
    throw new RepositoryError("Students cannot manage organizer branding.", "PERMISSION_DENIED");
  }
  if (context?.actorRole === "organizer" && !organizerId) {
    throw new RepositoryError("Organizer branding requires an organizer profile.", "VALIDATION_ERROR");
  }
}

async function signedBrandingUrl(path?: string | null) {
  if (!path) return undefined;
  const { data, error } = await getSupabaseBrowserClient().storage.from("branding-assets").createSignedUrl(path, 3600);
  return error ? undefined : data?.signedUrl;
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
  async listStudentsByIds(studentIds, context) {
    void context;
    const uniqueStudentIds = [...new Set(studentIds.filter(Boolean))];
    if (uniqueStudentIds.length === 0) return [];

    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("students")
      .select(studentReadSelect)
      .in("id", uniqueStudentIds);
    throwIfSupabaseError(error);
    return (data ?? []).map((row) => mapStudent(row as Row));
  },
  async createStudent(input) {
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", {
      body: { action: "create-student", students: [input] }
    });
    if (error) throw new RepositoryError(await getFunctionInvocationErrorMessage(error), "VALIDATION_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    if (data?.failed > 0) throw new RepositoryError(data.errors?.[0]?.error || "Failed to create student", "VALIDATION_ERROR");

    // Fetch the newly created student to return it
    const { data: studentRow, error: fetchError } = await client
      .from("students")
      .select(studentReadSelect)
      .eq("student_id", input.studentNumber)
      .single();
    throwIfSupabaseError(fetchError);
    return mapStudent(studentRow as Row);
  },
  async updateStudent(input) {
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", {
      body: { action: "update-student", student: input }
    });
    if (error) throw new RepositoryError(await getFunctionInvocationErrorMessage(error), "VALIDATION_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");

    const { data: studentRow, error: fetchError } = await client
      .from("students")
      .select(studentReadSelect)
      .eq("id", input.id)
      .single();
    throwIfSupabaseError(fetchError);
    return mapStudent(studentRow as Row);
  },
  async bulkCreateStudents(inputs) {
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", {
      body: { action: "bulk-create-students", students: inputs }
    });
    if (error) throw new RepositoryError(await getFunctionInvocationErrorMessage(error), "VALIDATION_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    
    return {
      success: Number(data?.success ?? 0),
      failed: Number(data?.failed ?? 0),
      errors: Array.isArray(data?.errors) ? data.errors : []
    };
  },
  async listFacultyProfiles(query) {
    const rows = await selectRowsFiltered("faculty_profiles", query, "*, profiles(*)", {});
    return pageResult(
      rows.items.map((row: Row): FacultyProfile => {
        const profiles = row.profiles as Record<string, unknown> | undefined;
        return {
          id: String(row.id ?? ""),
          userId: String(row.profile_id ?? ""),
          employeeNumber: String(row.employee_number ?? ""),
          departmentId: String(row.department_id ?? ""),
          employmentStatus: row.employment_status as FacultyEmploymentStatus,
          title: String(row.title ?? ""),
          displayName: `${profiles?.first_name || ""} ${profiles?.last_name || ""}`.trim()
        };
      }),
      rows.total,
      query
    );
  },
  async listOrganizerProfiles(query) {
    const rows = await selectRows("organizers", query);
    return pageResult(rows.items.map(mapOrganizer), rows.total, query);
  },
  async listAdminProfiles(query) {
    const rows = await selectRowsFiltered("admin_profiles", query, "*, profiles(*)", {});
    return pageResult(
      rows.items.map((row: Row): AdminProfile => ({
        id: String(row.id ?? ""),
        userId: String(row.profile_id ?? ""),
        employeeNumber: String(row.employee_number ?? ""),
        departmentId: String(row.department_id ?? ""),
        officeName: String(row.office_name ?? "")
      })),
      rows.total,
      query
    );
  },
  async createOrganizer(input, context) {
    if (context?.actorRole !== "admin") throw new RepositoryError("Only administrators can create organizer accounts.", "PERMISSION_DENIED");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", { body: { action: "create-organizer", organizer: input } });
    if (error) throw new RepositoryError(await getFunctionInvocationErrorMessage(error), "VALIDATION_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    const generatedEmployeeNumber = String(data?.employeeNumber ?? input.employeeNumber);
    const { data: row, error: fetchError } = await client.from("organizers").select("id, profile_id, employee_id, organization_name, department_id, position, organizer_status").eq("employee_id", generatedEmployeeNumber).single();
    throwIfSupabaseError(fetchError);
    return mapOrganizer(row as Row);
  },
  async updateOrganizer(input, context) {
    if (context?.actorRole !== "admin") throw new RepositoryError("Only administrators can update organizer accounts.", "PERMISSION_DENIED");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", { body: { action: "update-organizer", organizer: input } });
    if (error) throw new RepositoryError(await getFunctionInvocationErrorMessage(error), "VALIDATION_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    const { data: row, error: fetchError } = await client
      .from("organizers")
      .select("id, profile_id, employee_id, organization_name, department_id, position, organizer_status")
      .eq("id", input.id)
      .single();
    throwIfSupabaseError(fetchError);
    return mapOrganizer(row as Row);
  },
  async createAdmin(input, context) {
    if (context?.actorRole !== "admin") throw new RepositoryError("Only administrators can create admin accounts.", "PERMISSION_DENIED");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", { body: { action: "create-admin", admin: input } });
    if (error) throw new RepositoryError(await getFunctionInvocationErrorMessage(error), "VALIDATION_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    const { data: row, error: fetchError } = await client.from("admin_profiles").select("id, profile_id, employee_number, department_id, office_name").eq("employee_number", input.employeeNumber).single();
    throwIfSupabaseError(fetchError);
    return {
      id: String(row.id), userId: String(row.profile_id), employeeNumber: String(row.employee_number),
      departmentId: String(row.department_id), officeName: String(row.office_name)
    };
  },
  async updateAdmin(input, context) {
    if (context?.actorRole !== "admin") throw new RepositoryError("Only administrators can update admin accounts.", "PERMISSION_DENIED");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", { body: { action: "update-admin", admin: input } });
    if (error) throw new RepositoryError(error.message, "VALIDATION_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    const { data: row, error: fetchError } = await client.from("admin_profiles").select("id, profile_id, employee_number, department_id, office_name").eq("id", input.id).single();
    throwIfSupabaseError(fetchError);
    return { id: String(row.id), userId: String(row.profile_id), employeeNumber: String(row.employee_number), departmentId: String(row.department_id), officeName: String(row.office_name) };
  },
  async revokeUserSessions(input, context) {
    if (context?.actorRole !== "admin") throw new RepositoryError("Only administrators can revoke user sessions.", "PERMISSION_DENIED");
    if (context.actorUserId === input.userId) throw new RepositoryError("Administrators cannot revoke their own sessions.", "VALIDATION_ERROR");
    const reason = input.reason.trim();
    if (!reason) throw new RepositoryError("A reason is required to revoke user sessions.", "VALIDATION_ERROR");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", {
      body: { action: "revoke-user-sessions", userId: input.userId, reason }
    });
    if (error) throw new RepositoryError(error.message, "SERVER_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    return { revokedSessionCount: Number(data?.revokedSessionCount ?? 0) };
  },
  async resendUserInvitation(input, context) {
    if (context?.actorRole !== "admin") throw new RepositoryError("Only university administrators can resend account invitations.", "PERMISSION_DENIED");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", {
      body: { action: "prepare-user-invitation-resend", userId: input.userId }
    });
    if (error) throw new RepositoryError(await getFunctionInvocationErrorMessage(error), "SERVER_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    if (typeof data?.email !== "string" || !data.email) throw new RepositoryError("The invitation could not be prepared.", "SERVER_ERROR");
    const { error: resetError } = await client.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${window.location.origin}${APP_ROUTES.resetPassword}`
    });
    if (resetError) throw new RepositoryError(resetError.message, "SERVER_ERROR");
  },
  async resendAdminInvitation(input, context) {
    return this.resendUserInvitation(input, context);
  },
  async bulkCreateOrganizers(inputs, context) {
    if (context?.actorRole !== "admin") throw new RepositoryError("Only administrators can create organizer accounts.", "PERMISSION_DENIED");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.functions.invoke("manage-users", { body: { action: "bulk-create-organizers", organizers: inputs } });
    if (error) throw new RepositoryError(error.message, "VALIDATION_ERROR");
    if (data?.error) throw new RepositoryError(data.error, "VALIDATION_ERROR");
    return { success: Number(data?.success ?? 0), failed: Number(data?.failed ?? 0), errors: Array.isArray(data?.errors) ? data.errors : [] };
  },
  async getOrganizerBranding(organizerId, context) {
    requireBrandingContext(context, organizerId);
    const currentContext = context;
    if (currentContext?.actorRole === "organizer") {
      const current = await selectRowsFiltered("organizers", { pageIndex: 0, pageSize: 1 }, "id, profile_id, organization_name, college_logo_path, updated_at", { profile_id: currentContext.actorUserId });
      const owned = current.items[0];
      if (!owned || String(owned.id) !== organizerId) throw new RepositoryError("You can only view your own branding.", "PERMISSION_DENIED");
    }
    const row = await selectSingleRowWithColumns("organizers", organizerId, "id, organization_name, college_logo_path, updated_at");
    return {
      organizerId: String(row.id),
      collegeName: String(row.organization_name ?? "PLP"),
      collegeLogoPath: typeof row.college_logo_path === "string" ? row.college_logo_path : undefined,
      collegeLogoUrl: await signedBrandingUrl(typeof row.college_logo_path === "string" ? row.college_logo_path : undefined),
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined
    };
  },
  async updateOrganizerBranding(input, context) {
    requireBrandingContext(context, input.organizerId);
    if (!input.collegeName.trim()) throw new RepositoryError("College name is required.", "VALIDATION_ERROR");
    if (input.logo && (!["image/jpeg", "image/png", "image/webp"].includes(input.logo.type) || input.logo.size > 2 * 1024 * 1024)) {
      throw new RepositoryError("College logos must be JPG, PNG, or WebP files up to 2 MB.", "VALIDATION_ERROR");
    }
    if (context?.actorRole === "organizer") {
      const profile = await selectRowsFiltered("organizers", { pageIndex: 0, pageSize: 1 }, "id", { profile_id: context.actorUserId });
      if (String(profile.items[0]?.id ?? "") !== input.organizerId) throw new RepositoryError("You can only update your own branding.", "PERMISSION_DENIED");
    }
    const current = await selectSingleRowWithColumns("organizers", input.organizerId, "id, college_logo_path");
    let logoPath = typeof current.college_logo_path === "string" ? current.college_logo_path : null;
    const client = getSupabaseBrowserClient();
    if (input.logo) {
      const extension = input.logo.type === "image/png" ? "png" : input.logo.type === "image/webp" ? "webp" : "jpg";
      logoPath = `${input.organizerId}/college-logo.${extension}`;
      if (typeof current.college_logo_path === "string" && current.college_logo_path !== logoPath) {
        await client.storage.from("branding-assets").remove([current.college_logo_path]);
      }
      const { error } = await client.storage.from("branding-assets").upload(logoPath, input.logo, { contentType: input.logo.type, cacheControl: "3600", upsert: true });
      throwIfSupabaseError(error);
    } else if (input.removeLogo) {
      if (logoPath) await client.storage.from("branding-assets").remove([logoPath]);
      logoPath = null;
    }
    const { data, error } = await client.from("organizers").update({ organization_name: input.collegeName.trim(), college_logo_path: logoPath, updated_at: new Date().toISOString() } as never).eq("id", input.organizerId).select("id, organization_name, college_logo_path, updated_at").single();
    throwIfSupabaseError(error);
    const row = data as unknown as Row;
    const result = { organizerId: String(row.id), collegeName: String(row.organization_name ?? "PLP"), collegeLogoPath: typeof row.college_logo_path === "string" ? row.college_logo_path : undefined, collegeLogoUrl: await signedBrandingUrl(typeof row.college_logo_path === "string" ? row.college_logo_path : undefined), updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined };
    try { await supabaseAuditLogRepository.logClientAction({ action: "organizer.branding_updated", targetType: "organizer_profile", targetId: input.organizerId, metadata: { collegeName: result.collegeName, logoUpdated: Boolean(input.logo), logoRemoved: Boolean(input.removeLogo) } }, context); } catch { /* Branding remains committed if audit logging is unavailable. */ }
    return result;
  },
  async getDepartmentBranding(departmentId, context) {
    if (context?.actorRole !== "department_admin" && context?.actorRole !== "admin") {
      throw new RepositoryError("Only department administrators can view department branding.", "PERMISSION_DENIED");
    }
    const row = await selectSingleRowWithColumns("departments", departmentId, "id, department_name, brand_name_override, logo_path, primary_color, secondary_color, updated_at");
    return {
      departmentId: String(row.id),
      displayName: typeof row.brand_name_override === "string" && row.brand_name_override.trim() ? row.brand_name_override : String(row.department_name ?? ""),
      logoPath: typeof row.logo_path === "string" ? row.logo_path : undefined,
      logoUrl: await signedBrandingUrl(typeof row.logo_path === "string" ? row.logo_path : undefined),
      primaryColor: typeof row.primary_color === "string" ? row.primary_color : undefined,
      secondaryColor: typeof row.secondary_color === "string" ? row.secondary_color : undefined,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined
    } satisfies DepartmentBranding;
  },
  async updateDepartmentBranding(input, context) {
    if (context?.actorRole !== "department_admin" && context?.actorRole !== "admin") {
      throw new RepositoryError("Only department administrators can update department branding.", "PERMISSION_DENIED");
    }
    const displayName = input.displayName.trim();
    if (!displayName) throw new RepositoryError("A department display name is required.", "VALIDATION_ERROR");
    if (input.logo && (!["image/jpeg", "image/png", "image/webp"].includes(input.logo.type) || input.logo.size > 2 * 1024 * 1024)) {
      throw new RepositoryError("Department logos must be JPG, PNG, or WebP files up to 2 MB.", "VALIDATION_ERROR");
    }
    const client = getSupabaseBrowserClient();
    const current = await selectSingleRowWithColumns("departments", input.departmentId, "id, logo_path");
    let logoPath = typeof current.logo_path === "string" ? current.logo_path : null;
    if (input.logo) {
      const extension = input.logo.type === "image/png" ? "png" : input.logo.type === "image/webp" ? "webp" : "jpg";
      const nextPath = `departments/${input.departmentId}/logo.${extension}`;
      if (logoPath && logoPath !== nextPath) await client.storage.from("branding-assets").remove([logoPath]);
      const { error } = await client.storage.from("branding-assets").upload(nextPath, input.logo, { contentType: input.logo.type, cacheControl: "3600", upsert: true });
      throwIfSupabaseError(error);
      logoPath = nextPath;
    } else if (input.removeLogo) {
      if (logoPath) await client.storage.from("branding-assets").remove([logoPath]);
      logoPath = null;
    }
    const { data, error } = await client.from("departments").update({
      brand_name_override: displayName,
      logo_path: logoPath,
      primary_color: input.primaryColor?.trim() || null,
      secondary_color: input.secondaryColor?.trim() || null,
      updated_at: new Date().toISOString()
    } as never).eq("id", input.departmentId).select("id, department_name, brand_name_override, logo_path, primary_color, secondary_color, updated_at").single();
    throwIfSupabaseError(error);
    const row = data as unknown as Row;
    return {
      departmentId: String(row.id),
      displayName: String(row.brand_name_override ?? row.department_name ?? ""),
      logoPath: typeof row.logo_path === "string" ? row.logo_path : undefined,
      logoUrl: await signedBrandingUrl(typeof row.logo_path === "string" ? row.logo_path : undefined),
      primaryColor: typeof row.primary_color === "string" ? row.primary_color : undefined,
      secondaryColor: typeof row.secondary_color === "string" ? row.secondary_color : undefined,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined
    } satisfies DepartmentBranding;
  }
};

export const supabaseAcademicManagementRepository: AcademicManagementRepository = {
  async listDepartments(query) {
    const rows = await selectRows("departments", query);
    return pageResult(rows.items.map((row): Department => ({ id: String(row.id ?? ""), code: String(row.department_code ?? row.code ?? ""), name: String(row.name ?? row.department_name ?? ""), isActive: row.is_active !== false })), rows.total, query);
  },
  async listPrograms(query) {
    const rows = await selectRows("programs", query);
    return pageResult(rows.items.map((row): Program => ({ id: String(row.id ?? ""), departmentId: String(row.department_id ?? ""), code: String(row.program_code ?? row.code ?? ""), name: String(row.name ?? row.program_name ?? ""), isActive: row.is_active !== false })), rows.total, query);
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
  async listSections(query) {
    const rows = await selectRows("sections", query);
    return pageResult(rows.items.map((row) => ({
      id: String(row.id ?? ""), programId: String(row.program_id ?? ""), name: String(row.section_name ?? ""),
      yearLevel: Number(row.year_level ?? 0), academicYear: String(row.academic_year ?? ""), semester: String(row.semester ?? ""), isActive: row.is_active !== false
    })), rows.total, query);
  },
  async listEventCategories(query) {
    const rows = await selectRows("event_categories", query);
    return pageResult(rows.items.map((row) => ({ id: String(row.id ?? ""), name: String(row.category_name ?? ""), isActive: row.is_active !== false })), rows.total, query);
  },
  async createOrUpdateDepartment(input, context) {
    requireAdminContext(context);
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_manage_catalog_entry" as never, { p_table: "departments", p_id: input.id ?? null, p_values: { department_code: input.code.trim(), department_name: input.name.trim(), is_active: input.isActive ?? true } as Json } as never);
    throwIfSupabaseError(error);
    const row = await selectSingleRow("departments", String(data));
    return { id: String(row.id), code: String(row.department_code), name: String(row.department_name), isActive: row.is_active !== false };
  },
  async createOrUpdateProgram(input, context) {
    requireAdminContext(context);
    const values = { department_id: input.departmentId, program_code: input.code.trim(), program_name: input.name.trim(), is_active: input.isActive ?? true };
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_manage_catalog_entry" as never, { p_table: "programs", p_id: input.id ?? null, p_values: values as Json } as never);
    throwIfSupabaseError(error);
    const row = await selectSingleRow("programs", String(data));
    return { id: String(row.id), departmentId: String(row.department_id), code: String(row.program_code), name: String(row.program_name), isActive: row.is_active !== false };
  },
  async createOrUpdateSection(input, context) {
    requireAdminContext(context);
    const values = { program_id: input.programId, section_name: input.name.trim(), year_level: input.yearLevel, academic_year: input.academicYear.trim(), semester: input.semester.trim(), is_active: input.isActive ?? true };
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_manage_catalog_entry" as never, { p_table: "sections", p_id: input.id ?? null, p_values: values as Json } as never);
    throwIfSupabaseError(error);
    const row = await selectSingleRow("sections", String(data));
    return { id: String(row.id), programId: String(row.program_id), name: String(row.section_name), yearLevel: Number(row.year_level), academicYear: String(row.academic_year), semester: String(row.semester), isActive: row.is_active !== false };
  },
  async createOrUpdateEventCategory(input, context) {
    requireAdminContext(context);
    const values = { category_name: input.name.trim(), is_active: input.isActive ?? true };
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_manage_catalog_entry" as never, { p_table: "event_categories", p_id: input.id ?? null, p_values: values as Json } as never);
    throwIfSupabaseError(error);
    const row = await selectSingleRow("event_categories", String(data));
    return { id: String(row.id), name: String(row.category_name), isActive: row.is_active !== false };
  },
  async setCatalogActive(table, id, isActive, context) {
    requireAdminContext(context);
    const { error } = await getSupabaseBrowserClient().rpc("admin_manage_catalog_entry" as never, { p_table: table, p_id: id, p_values: { is_active: isActive } as Json } as never);
    throwIfSupabaseError(error);
  },
  async listClasses(query) {
    const rows = await selectRowsFiltered("classes", query, "*, section:sections(section_name)", {});
    return pageResult(
      rows.items.map((row: Row): Class => {
        const section = row.section as Record<string, unknown> | undefined;
        return {
          id: String(row.id ?? ""),
          facultyId: String(row.faculty_id ?? ""),
          programId: String(row.program_id ?? ""),
          departmentId: String(row.department_id ?? ""),
          semesterId: String(row.semester_id ?? ""),
          subjectCode: String(row.subject_code ?? ""),
          subjectTitle: String(row.subject_title ?? ""),
          room: String(row.room ?? ""),
          section: String(section?.section_name ?? ""),
          yearLevel: Number(row.year_level ?? 0),
          scheduleLabel: String(row.schedule_label ?? ""),
          status: row.status as "active" | "archived",
          rosterId: String(row.id ?? "")
        };
      }),
      rows.total,
      query
    );
  },
  async getClassById(classId) {
    const row = await selectSingleRowWithColumns("classes", classId, "*, section:sections(section_name)");
    if (!row) {
      throw new RepositoryError("Class not found", "NOT_FOUND");
    }
    return {
      id: String(row.id ?? ""),
      facultyId: String(row.faculty_id ?? ""),
      programId: String(row.program_id ?? ""),
      departmentId: String(row.department_id ?? ""),
      semesterId: String(row.semester_id ?? ""),
      subjectCode: String(row.subject_code ?? ""),
      subjectTitle: String(row.subject_title ?? ""),
      room: String(row.room ?? ""),
      section: String((row.section as Record<string, unknown> | undefined)?.section_name ?? ""),
      yearLevel: Number(row.year_level ?? 0),
      scheduleLabel: String(row.schedule_label ?? ""),
      status: row.status as "active" | "archived",
      rosterId: String(row.id ?? "")
    };
  }
};

export const supabaseClassRosterRepository: ClassRosterRepository = {
  async listClassRosters(query) {
    const rows = await selectRowsFiltered("class_rosters", query, "*", {});
    return pageResult(
      rows.items.map((row: Row): ClassRoster => ({
        id: String(row.id ?? ""),
        classId: String(row.class_id ?? ""),
        studentId: String(row.student_id ?? ""),
        enrolledAt: String(row.enrolled_at ?? "")
      })),
      rows.total,
      query
    );
  },
  async listStudentsForClass(classId, query) {
    const client = getSupabaseBrowserClient();
    let builder = client.from("class_rosters").select("*, student:students(*, profiles(*))", { count: "exact" }).eq("class_id", classId);
    const listQuery = queryOrDefault(query);
    const from = listQuery.pageIndex * listQuery.pageSize;
    const to = from + listQuery.pageSize - 1;
    builder = builder.range(from, to);
    
    const { data, count, error } = await builder;
    throwIfSupabaseError(error);
    
    return pageResult(
      (data || []).map((row: Record<string, unknown>) => mapStudent(row.student as Row)),
      count ?? 0,
      query
    );
  },
  async addStudentToClass(input) {
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.from("class_rosters").insert({
      class_id: input.classId,
      student_id: input.studentId
    }).select("*").single();
    throwIfSupabaseError(error);
    const row = data as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      classId: String(row.class_id ?? ""),
      studentId: String(row.student_id ?? ""),
      enrolledAt: String(row.enrolled_at ?? "")
    };
  },
  async removeStudentFromClass(classId, studentId) {
    const client = getSupabaseBrowserClient();
    const { error } = await client.from("class_rosters").delete().eq("class_id", classId).eq("student_id", studentId);
    throwIfSupabaseError(error);
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
      if (listQuery.search) {
        const term = listQuery.search.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
        if (term) builder = builder.or(`event_code.ilike.*${term}*,title.ilike.*${term}*,category.ilike.*${term}*,venue.ilike.*${term}*`);
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
    const eventParticipants = rows.items.filter(
      (row) => String(row.event_id ?? "") === eventId && String(row.participant_status ?? "confirmed") !== "removed"
    );
    return pageResult(eventParticipants.map(mapEventParticipant), eventParticipants.length, query);
  },
  async generateNextEventCode() {
    const client = getSupabaseBrowserClient();
    const currentYear = new Date().getFullYear();
    
    const { data: events, error } = await client
      .from("events")
      .select("event_code");
    
    throwIfSupabaseError(error);
    
    let nextNumber = 1;
    for (const event of events ?? []) {
      const match = String(event.event_code ?? "").match(new RegExp(`^EVT-${currentYear}-(\\d+)$`, "i"));
      if (match) nextNumber = Math.max(nextNumber, Number.parseInt(match[1], 10) + 1);
    }
    
    return `EVT-${currentYear}-${String(nextNumber).padStart(3, "0")}`;
  },
  async createEvent(input) {
    const client = getSupabaseBrowserClient();
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
    const trimmedObjectives = (input.objectives ?? [])
      .map((objective) => objective.trim())
      .filter((objective) => objective.length > 0);
    const { data: eventRow, error: eventError } = await client.rpc("create_organizer_event_with_metadata", {
      p_event_code: input.code,
      p_category_id: category.id,
      p_title: input.title,
      p_description: [input.description, input.remarks].filter(Boolean).join("\n\n"),
      p_venue: input.venue,
      p_starts_at: scheduledStart,
      p_ends_at: scheduledEnd,
      p_priority_level: input.priorityLevel,
      p_impact_score: input.impactScore ?? 0,
      p_visibility: input.visibility ?? "assigned",
      p_participant_ids: input.participantStudentIds,
      p_objectives: trimmedObjectives,
      p_publish_reason: input.publishReason ?? "Published by event organizer"
    });
    throwIfSupabaseError(eventError);
    const createdEvent = eventRow as Row;
    const { data: metadataRow, error: metadataError } = await client.rpc("update_organizer_event_metadata", {
      p_event_id: String(createdEvent.id ?? ""),
      p_requested_by: input.requestedBy?.trim() || undefined,
      p_college_office: input.collegeOffice?.trim() || undefined,
      p_number_of_pax: input.numberOfPax ?? input.participantStudentIds.length,
      p_institutional_category: input.institutionalCategory ?? undefined,
      p_participation_status: input.participationStatus ?? undefined,
      p_target_group: input.targetGroup ?? undefined,
      p_urgency_points: input.urgencyPoints ?? 0,
      p_priority_score: input.priorityScore ?? 0,
      p_priority_tier: input.priorityTier ?? "Low",
      p_fixed_priority: input.fixedPriority ?? false
    });
    throwIfSupabaseError(metadataError);
    const savedEvent = mapEvent((metadataRow as Row | null) ?? createdEvent);
    return savedEvent;
  },
  async listEventResources(eventId, query) {
    const rows = await selectRowsFiltered("event_resources", query, "*", { event_id: eventId });
    return pageResult(rows.items.map((row) => ({
      id: String(row.id ?? ""),
      eventId: String(row.event_id ?? ""),
      title: String(row.resource_title ?? "Event resource"),
      externalUrl: typeof row.external_url === "string" ? row.external_url : undefined,
      storageBucket: typeof row.storage_bucket === "string" ? row.storage_bucket : undefined,
      storageObjectPath: typeof row.storage_object_path === "string" ? row.storage_object_path : undefined
    })), rows.total, query);
  },
  async addEventResource(input) {
    const client = getSupabaseBrowserClient();
    const { data: authData, error: authError } = await client.auth.getUser();
    throwIfSupabaseError(authError);
    if (!authData.user) throw new RepositoryError("You must be signed in to manage event resources.", "PERMISSION_DENIED");
    const { data, error } = await client
      .from("event_resources")
      .insert({
        event_id: input.eventId,
        resource_title: input.title,
        external_url: input.externalUrl ?? null,
        storage_bucket: input.storageBucket ?? null,
        storage_object_path: input.storageObjectPath ?? null,
        created_by: authData.user.id
      })
      .select("*")
      .single();
    throwIfSupabaseError(error);
    return {
      id: String(data.id ?? ""),
      eventId: String(data.event_id ?? ""),
      title: String(data.resource_title ?? "Event resource"),
      externalUrl: typeof data.external_url === "string" ? data.external_url : undefined,
      storageBucket: typeof data.storage_bucket === "string" ? data.storage_bucket : undefined,
      storageObjectPath: typeof data.storage_object_path === "string" ? data.storage_object_path : undefined
    };
  },
  async removeEventResource(resourceId) {
    const { error } = await getSupabaseBrowserClient().from("event_resources").delete().eq("id", resourceId);
    throwIfSupabaseError(error);
  },
  async updateEventStatus(eventId, status: Extract<EventStatus, "approved" | "rejected">, reason) {
    const approvalStatus = status === "approved" ? "approved" : "declined";
    if (status === "rejected" && !reason?.trim()) {
      throw new RepositoryError("A rejection reason is required.", "VALIDATION_ERROR");
    }
    return mapEvent(await updateRow("events", eventId, {
      approval_status: approvalStatus,
      approval_reason: reason?.trim() || (status === "approved" ? "Approved by organizer" : null)
    }));
  },
  async completeEvent(eventId) {
    return mapEvent(await updateRow("events", eventId, { event_status: "completed" }));
  },
  async cancelEvent(eventId, reason) {
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new RepositoryError("A cancellation reason is required.", "VALIDATION_ERROR");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.rpc("cancel_organizer_event", {
      p_event_id: eventId,
      p_reason: trimmedReason
    });
    throwIfSupabaseError(error);
    return mapEvent(data as Row);
  },
  async rescheduleEvent(input: RescheduleEventInput) {
    const client = getSupabaseBrowserClient();
    const currentEvent = await supabaseEventManagementRepository.getEventById(input.eventId);
    const reason = input.reason?.trim() ?? "";
    if (reason.length < 5) throw new RepositoryError("A rescheduling reason is required.", "VALIDATION_ERROR");
    const date = input.date || currentEvent.startsAt.split("T")[0];
    const startTime = input.startTime || currentEvent.startsAt.split("T")[1].substring(0, 5);
    const endTime = input.endTime || currentEvent.endsAt.split("T")[1].substring(0, 5);
    const { data, error } = await client.rpc("reschedule_organizer_event", {
      p_event_id: input.eventId,
      p_venue: input.venue?.trim() || currentEvent.venue,
      p_starts_at: manilaDateTimeToIso(date, startTime),
      p_ends_at: manilaDateTimeToIso(date, endTime),
      p_reason: reason
    });
    throwIfSupabaseError(error);
    return mapEvent(data as Row);
  }
};



export const supabaseAttendanceSessionRepository: AttendanceSessionRepository = {
  async listAttendanceSessions(query) {
    const listQuery = queryOrDefault(query);
    const from = listQuery.pageIndex * listQuery.pageSize;
    const to = from + listQuery.pageSize - 1;
    const client = getSupabaseBrowserClient();
    let builder = client
      .from("event_sessions")
      .select(attendanceSessionReadSelect, query?.eventId ? { count: "exact" } : undefined);

    if (query?.eventId) builder = builder.eq("event_id", query.eventId);
    if (query?.sessionStatus) builder = builder.eq("session_status", query.sessionStatus);
    if (listQuery.dateFrom) builder = builder.gte("scheduled_start", listQuery.dateFrom);
    if (listQuery.dateTo) builder = builder.lt("scheduled_start", listQuery.dateTo);
    if (listQuery.sortBy) builder = builder.order(listQuery.sortBy, { ascending: listQuery.sortDirection !== "desc" });

    const { data, error, count } = await builder.range(from, to);
    throwIfSupabaseError(error);
    const rows = (data ?? []) as unknown as Row[];
    return pageResult(rows.map((row) => mapAttendanceSession(row, "event")), count ?? rows.length, listQuery);
  },

  async getAttendanceSessionById(sessionId) {
    return mapAttendanceSession(await selectSingleRow("event_sessions", sessionId), "event");
  },
  async createClassSession(input) {
    void input;
    throw new RepositoryError("Class sessions are not part of the event-only PLPass schema.", "VALIDATION_ERROR");
},
 async createEventSession(input) {
  if (input.date !== dateKey(new Date())) {
    throw new RepositoryError("An attendance session can only be started on the event's scheduled Manila date. Reschedule the event to today first.", "VALIDATION_ERROR");
  }
  const scheduledStart = manilaDateTimeToIso(input.date, input.startTime);
  const scheduledEnd = manilaDateTimeToIso(input.date, input.expectedEndTime);
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.rpc("start_event_attendance_session", {
    p_event_id: input.eventId,
    p_venue: input.venue,
    p_scheduled_start: scheduledStart,
    p_scheduled_end: scheduledEnd,
    p_mode: input.attendanceMode === "online" ? "online" : "f2f",
    p_late_cutoff_minutes: input.lateCutoffMinutes ?? 15
  });
  if (error && (error.code === "23505" || /already has an active attendance session/i.test(error.message))) {
    const { data: activeSession, error: activeSessionError } = await client
      .from("event_sessions")
      .select("*")
      .eq("event_id", input.eventId)
      .eq("session_status", "ongoing")
      .order("actual_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfSupabaseError(activeSessionError);
    if (activeSession) {
      return mapAttendanceSession(activeSession as Row, "event");
    }
  }
  throwIfSupabaseError(error);
  return mapAttendanceSession(data as Row, "event");
},
  async endAttendanceSession(input: EndAttendanceSessionInput) {
  const client = getSupabaseBrowserClient();
  const { data, error } = input.attendanceRecords
    ? await client.rpc("finalize_event_attendance_session" as never, {
        p_session_id: input.sessionId,
        p_reason: input.reason,
        p_attendance_records: input.attendanceRecords.map((record) => ({
          student_id: record.studentId,
          attendance_status: record.status,
          verification_method: record.verificationMethod,
          time_in: record.timeIn,
          ...(record.timeOut ? { time_out: record.timeOut } : {}),
          ...(record.lateReason ? { late_reason: record.lateReason } : {}),
          ...(record.remarks ? { remarks: record.remarks } : {})
        }))
      } as never)
    : await client.rpc("end_event_attendance_session", {
        p_session_id: input.sessionId,
        p_reason: input.reason
      });
  throwIfSupabaseError(error);
  return mapAttendanceSession(data as Row, "event");
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
    const hasScopedFilter = Boolean(eventId || sessionId || studentId || listQuery.dateFrom || listQuery.dateTo || listQuery.attendanceStatus);
    let builder = client
      .from("attendance_records")
      .select(attendanceRecordReadSelect, hasScopedFilter ? { count: "exact" } : undefined);

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

    if (listQuery.dateFrom || listQuery.dateTo) {
      let sessionsForDate = client.from("event_sessions").select("id");
      if (listQuery.dateFrom) sessionsForDate = sessionsForDate.gte("scheduled_start", listQuery.dateFrom);
      if (listQuery.dateTo) sessionsForDate = sessionsForDate.lt("scheduled_start", listQuery.dateTo);
      const { data: sessionRows, error: sessionError } = await sessionsForDate;
      throwIfSupabaseError(sessionError);
      const sessionIds = (sessionRows ?? []).map((row) => String((row as Row).id ?? "")).filter(Boolean);
      if (sessionIds.length === 0) return emptyPage(listQuery);
      builder = builder.in("event_session_id", sessionIds);
    }

    if (sessionId) {
      builder = builder.eq("event_session_id", sessionId);
    }
    if (studentId) {
      builder = builder.eq("student_id", studentId);
    }
    if (listQuery.attendanceStatus) {
      builder = builder.eq("attendance_status", listQuery.attendanceStatus);
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
  async listFinalizedEventYears(context) {
    if (context?.actorRole !== "student") return [];
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.rpc("list_student_finalized_event_years");
    throwIfSupabaseError(error);
    return (data ?? [])
      .map((row) => Number((row as Row).event_year))
      .filter((year) => Number.isInteger(year) && year > 0);
  },
  async getStudentDashboardSummary(context) {
    if (context?.actorRole !== "student") {
      throw new RepositoryError("A student profile is required to load the dashboard summary.", "PERMISSION_DENIED");
    }
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.rpc("get_student_dashboard_summary");
    throwIfSupabaseError(error);
    const summary = (data ?? {}) as Row;
    const tasks = Array.isArray(summary.tasks) ? summary.tasks : [];
    return {
      totalCount: Number(summary.totalCount ?? 0),
      presentCount: Number(summary.presentCount ?? 0),
      lateCount: Number(summary.lateCount ?? 0),
      absentCount: Number(summary.absentCount ?? 0),
      excusedCount: Number(summary.excusedCount ?? 0),
      attendedCount: Number(summary.attendedCount ?? 0),
      attendanceRate: Number(summary.attendanceRate ?? 0),
      lateReasonTaskCount: Number(summary.lateReasonTaskCount ?? 0),
      feedbackTaskCount: Number(summary.feedbackTaskCount ?? 0),
      rejectedCorrectionCount: Number(summary.rejectedCorrectionCount ?? 0),
      pendingTaskCount: Number(summary.pendingTaskCount ?? 0),
      tasks: tasks.map((task) => {
        const row = task as Row;
        return {
          id: String(row.id ?? ""),
          kind: String(row.kind ?? "feedback") as StudentDashboardSummary["tasks"][number]["kind"],
          attendanceRecordId: typeof row.attendanceRecordId === "string" ? row.attendanceRecordId : undefined,
          eventId: typeof row.eventId === "string" ? row.eventId : undefined,
          title: String(row.title ?? "Required attendance task"),
          code: typeof row.code === "string" ? row.code : undefined,
          category: typeof row.category === "string" ? row.category : undefined,
          status: String(row.status ?? "pending"),
          startsAt: typeof row.startsAt === "string" ? row.startsAt : undefined,
          dueAt: typeof row.dueAt === "string" ? row.dueAt : undefined
        };
      })
    } satisfies StudentDashboardSummary;
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

    const code = normalizeStudentIdentityValue(input.credentialCode);

    if (!code) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "invalid_code", "QR code is empty.", occurredAt);
      return credentialScanResult(input, "Invalid Credential", occurredAt, "QR code is empty.", { failedAttempts: 1 });
    }

    const { data: participantRows, error: studentError } = await client
      .from("event_participants")
      .select("student_id, participant_status, students(student_id, profiles(first_name, middle_name, last_name, name_extension))")
      .eq("event_id", session.eventId ?? "")
      .neq("participant_status", "removed");
    throwIfSupabaseError(studentError);
    const matchedParticipant = (participantRows ?? []).find((candidate) => {
      const student = Array.isArray(candidate.students) ? candidate.students[0] : candidate.students;
      const profile = Array.isArray(student?.profiles) ? student.profiles[0] : student?.profiles;
      const fullName = [profile?.first_name, profile?.middle_name, profile?.last_name, profile?.name_extension].filter(Boolean).join(" ");
      return studentIdentityMatchesPayload(input.credentialCode, String(student?.student_id ?? ""), fullName);
    });

    if (!matchedParticipant?.student_id) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "invalid_qr", "No active event participant matches this student number or name.", occurredAt);
      return credentialScanResult(input, "Invalid Credential", occurredAt, "No active event participant matches this student number or name.", { failedAttempts: 1 });
    }
    const studentId = String(matchedParticipant.student_id);
    const credentialAttemptMetadata = {};
    const { data: enrolledParticipant, error: participantError } = await client
      .from("event_participants")
      .select("id")
      .eq("event_id", session.eventId ?? "")
      .eq("student_id", studentId)
      .maybeSingle();
    throwIfSupabaseError(participantError);

    if (!enrolledParticipant) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "not_enrolled", "Student is not enrolled in this event.", occurredAt, {
        studentId,
        ...credentialAttemptMetadata
      });
      return credentialScanResult(input, "Student Not Enrolled", occurredAt, "Student is not enrolled in this event.", { failedAttempts: 1 });
    }

    const windowStart = new Date(session.attendanceWindowStartAt ?? session.startsAt).getTime();
    const windowEnd = session.attendanceWindowEndAt ?? session.endsAt;
    const scannedAt = new Date(occurredAt).getTime();
    if (scannedAt < windowStart || (windowEnd && scannedAt > new Date(windowEnd).getTime())) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "outside_window", "QR scan is outside the attendance window.", occurredAt, {
        studentId,
        ...credentialAttemptMetadata
      });
      return credentialScanResult(input, "Outside Attendance Window", occurredAt, "QR scan is outside the attendance window.", { failedAttempts: 1 });
    }

    const lateCutoff = new Date(session.lateCutoffAt ?? new Date(new Date(session.startsAt).getTime() + 15 * 60_000).toISOString()).getTime();
    if (scannedAt > lateCutoff) {
      await insertVerificationAttempt(input.sessionId, input.method, false, "late_reason_required", "Late QR scans need organizer review before they are recorded.", occurredAt, {
        studentId,
        ...credentialAttemptMetadata
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
          ...credentialAttemptMetadata
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
      ...credentialAttemptMetadata
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
    if (input.reason.trim().length < 5) throw new RepositoryError("A manual attendance reason is required.", "VALIDATION_ERROR");
    const client = getSupabaseBrowserClient();
    const recordedAt = input.occurredAt ?? getPhilippineNowIso();
    const { data, error } = await client.rpc("record_manual_event_attendance", {
      p_session_id: input.sessionId,
      p_student_id: input.studentId,
      p_status: input.statusOverride ?? "present",
      p_reason: input.reason.trim(),
      ...(input.remarks.trim() ? { p_remarks: input.remarks.trim() } : {}),
      ...(input.lateReason ? { p_late_reason: input.lateReason } : {}),
      p_occurred_at: recordedAt
    });
    throwIfSupabaseError(error);
    const record = mapAttendanceRecord(data as Row);
    const studentSummary = await studentScanSummary(input.studentId);
    return {
      resultStatus: record.status === "late" ? "Late" : "Present",
      attendanceStatus: record.status,
      verificationMethod: "manual",
      recordedAt,
      safeMessage: record.checkedOutAt ? "Student checked out successfully." : `Student checked in as ${record.status}.`,
      attendanceRecord: record,
      summary: { present: record.status === "present" ? 1 : 0, late: record.status === "late" ? 1 : 0, absent: 0, duplicateAttempts: 0, failedAttempts: 0 },
      ...studentSummary
    };
    /* Legacy client-side implementation retained below only for reference during
       migration rollout; execution returns from the secured RPC above. */
    /*
    const { data: existing, error: existingError } = await client.from("attendance_records").select("*").eq("session_id", input.sessionId).eq("student_id", input.studentId).maybeSingle();
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
      session_id: input.sessionId,
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
    */
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
      p_late_reason_option_id: input.reasonOptionId,
      p_late_reason: input.customReason
    });
    throwIfSupabaseError(error);
    return mapAttendanceRecord(data as Row);
  },
  async listLateReasonOptions(locale = "en", context) {
    void context;
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("attendance_late_reason_options")
      .select("id, code, default_label, sort_order, is_active, attendance_late_reason_option_translations(label, locale)")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    throwIfSupabaseError(error);
    return (data ?? [] as unknown as Array<Record<string, unknown>>).map((row) => {
      const translations = Array.isArray((row as Record<string, unknown>).attendance_late_reason_option_translations)
        ? ((row as Record<string, unknown>).attendance_late_reason_option_translations as Array<Record<string, unknown>>)
        : [];
      const translation = translations.find((item) => item.locale === locale) ?? translations.find((item) => item.locale === "en");
      return mapLateReasonOption(
        { ...(row as Record<string, unknown>), translation_label: typeof translation?.label === "string" ? translation.label : undefined },
        typeof translation?.locale === "string" ? translation.locale : "en"
      );
    });
  }
};

export const supabaseAttendanceAttemptRepository: AttendanceAttemptRepository = {
  async listAttendanceAttempts(query) {
    const rows = await selectRows("verification_attempts", query);
    return pageResult(
      rows.items.map((row) => ({
        id: String(row.id ?? ""),
        sessionId: String(row.event_session_id ?? row.session_id ?? ""),
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
    if (context?.actorRole === "admin") {
      throw new RepositoryError("Administrators cannot access correction requests.", "PERMISSION_DENIED");
    }
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
      ...(input.reason ? { p_reason: input.reason } : {})
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
      ...(input.remarks ? { p_remarks: input.remarks } : {})
    });
    throwIfSupabaseError(error);
    return mapCredentialRequest(data as Row);
  }
};

export const supabaseStudentCredentialRepository: StudentCredentialRepository = {
  async listStudentCredentialStatuses(context, studentIds) {
    requireOrganizerContext(context);
    const client = getSupabaseBrowserClient();

    if (context?.actorRole === "admin") {
      const { data, error } = await client.rpc("admin_list_credential_statuses" as never);
      throwIfSupabaseError(error);

      return ((data ?? []) as unknown as Row[])
        .map((row) => ({
          studentId: String(row.student_id ?? ""),
          qrCredential: row.qr_id
            ? mapQrCredential({
                id: row.qr_id,
                student_id: row.student_id,
                credential_status: row.qr_credential_status,
                issued_at: row.qr_issued_at,
                expires_at: row.qr_expires_at,
                revoked_at: row.qr_revoked_at,
                last_successful_check_in_at: row.qr_last_successful_check_in_at,
                created_at: row.qr_created_at,
                updated_at: row.qr_updated_at
              } as Row)
            : undefined,
          facialProfile: row.facial_id
            ? mapFacialProfile({
                id: row.facial_id,
                student_id: row.student_id,
                facial_status: row.facial_status,
                enrolled_at: row.facial_enrolled_at,
                last_verified_at: row.facial_last_verified_at,
                consent_recorded_at: row.facial_consent_recorded_at,
                created_at: row.facial_created_at,
                updated_at: row.facial_updated_at
              } as Row)
            : undefined
        }))
        .filter((status) => status.studentId);
    }

    const scopedStudentIds = [...new Set(studentIds ?? [])];
    if (context?.actorRole === "organizer" && scopedStudentIds.length === 0) return [];
    let qrQuery = client
        .from("qr_credentials")
        .select("id, student_id, credential_status, issued_at, expires_at, revoked_at, last_successful_check_in_at, created_at, updated_at")
        .order("issued_at", { ascending: false });
    let facialQuery = client
        .from("facial_profiles")
        .select("id, student_id, facial_status, enrolled_at, last_verified_at, consent_recorded_at, created_at, updated_at");
    if (context?.actorRole === "organizer") {
      qrQuery = qrQuery.in("student_id", scopedStudentIds);
      facialQuery = facialQuery.in("student_id", scopedStudentIds);
    }
    const [{ data: qrRows, error: qrError }, { data: facialRows, error: facialError }] = await Promise.all([qrQuery, facialQuery]);
    throwIfSupabaseError(qrError);
    throwIfSupabaseError(facialError);

    const statuses = new Map<string, StudentCredentialStatus>();
    for (const row of qrRows ?? []) {
      const studentId = String((row as Row).student_id ?? "");
      if (!studentId) continue;
      const current = statuses.get(studentId) ?? { studentId };
      if (!current.qrCredential) current.qrCredential = mapQrCredential(row as Row);
      statuses.set(studentId, current);
    }
    for (const row of facialRows ?? []) {
      const studentId = String((row as Row).student_id ?? "");
      if (!studentId) continue;
      const current = statuses.get(studentId) ?? { studentId };
      current.facialProfile = mapFacialProfile(row as Row);
      statuses.set(studentId, current);
    }
    return [...statuses.values()];
  },
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
    const client = getSupabaseBrowserClient();
    if (context?.actorRole === "student") {
      const studentId = await currentStudentIdForProfile(context.actorUserId);
      if (studentId !== input.studentId) {
        throw new RepositoryError("Students can only generate their own QR credential.", "PERMISSION_DENIED");
      }
      const { error } = await client.rpc("generate_student_qr_credential");
      throwIfSupabaseError(error);
      return supabaseStudentCredentialRepository.getStudentCredentialStatus(studentId, context);
    }

    requireOrganizerContext(context);
    const { error } = await client.rpc("issue_qr_credential", {
      p_student_id: input.studentId,
      ...(input.expiresAt ? { p_expires_at: input.expiresAt } : {})
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

  async listStudentFeedbackTasks(studentId, context) {
    const client = getSupabaseBrowserClient();
    const scopedStudentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : studentId;
    if (!scopedStudentId) return [];
    const { data, error } = await client
      .from("event_feedback_tasks" as never)
      .select("*, event_feedback_task_objectives(*)")
      .eq("student_id", scopedStudentId)
      .order("due_at", { ascending: true });
    throwIfSupabaseError(error);
    return ((data ?? []) as Row[]).map(mapEventFeedbackTask);
  },

  async submitEventFeedback(input: SubmitEventFeedbackInput, context) {
    const client = getSupabaseBrowserClient();
    const studentId = context?.actorRole === "student"
      ? await currentStudentIdForProfile(context.actorUserId)
      : input.studentId;
    if (!studentId) {
      throw new RepositoryError("A student profile is required to submit event feedback.", "VALIDATION_ERROR");
    }
    void studentId;
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
    const { data: edgeResult, error: edgeError } = await client.functions.invoke("analyze-feedback", {
      body: {
        taskId: input.taskId,
        eventId: input.eventId,
        attendanceRecordId: input.attendanceRecordId,
        comment,
        ratings: input.ratings
      }
    });

    throwIfSupabaseError(edgeError);
    if (edgeResult?.error) throw new RepositoryError(edgeResult.error, "SERVER_ERROR");
    
    const feedbackId = edgeResult?.feedbackId;

    const { data: saved, error: savedError } = await client
      .from("event_feedback")
      .select("*, event_feedback_ratings(*)")
      .eq("id", feedbackId)
      .single();
    throwIfSupabaseError(savedError);
    return mapEventFeedback(saved as Row);
  },

  async listAllEventObjectives(query, context) {
    void context;
    const listQuery = queryOrDefault(query);
    const from = listQuery.pageIndex * listQuery.pageSize;
    const to = from + listQuery.pageSize - 1;
    const client = getSupabaseBrowserClient();
    const { data, error, count } = await client.from("event_objectives").select("*", { count: "exact" }).range(from, to);
    throwIfSupabaseError(error);
    return pageResult(((data ?? []) as Row[]).map(mapEventObjective), count ?? 0, listQuery);
  },

  async listAllEventSummarySnapshots(query, context) {
    void context;
    const listQuery = queryOrDefault(query);
    const from = listQuery.pageIndex * listQuery.pageSize;
    const to = from + listQuery.pageSize - 1;
    const client = getSupabaseBrowserClient();
    const { data, error, count } = await client.from("event_summary_snapshots").select("*", { count: "exact" }).range(from, to);
    throwIfSupabaseError(error);
    return pageResult(((data ?? []) as Row[]).map(mapEventSummarySnapshot), count ?? 0, listQuery);
  },

  async listAllEventFeedback(query, context) {
    void context;
    const listQuery = queryOrDefault(query);
    const from = listQuery.pageIndex * listQuery.pageSize;
    const to = from + listQuery.pageSize - 1;
    const client = getSupabaseBrowserClient();
    // We fetch without ratings to keep payload light for comments view
    const { data, error, count } = await client.from("event_feedback").select("*", { count: "exact" }).range(from, to).order("submitted_at", { ascending: false });
    throwIfSupabaseError(error);
    return pageResult(((data ?? []) as Row[]).map(mapEventFeedback), count ?? 0, listQuery);
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
    const rows = await selectRowsFiltered(
      "notifications",
      { ...queryOrDefault(query), sortBy: query?.sortBy ?? "created_at", sortDirection: query?.sortDirection ?? "desc" },
      "*",
      {
        recipient_id: recipientId,
        notification_status: query?.notificationStatus,
        notification_type: query?.notificationType,
        notification_code: query?.notificationCode
      }
    );
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
  },
  async getPreferences(context) {
    const recipientId = context?.actorUserId ?? String((await currentProfile()).id ?? "");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("notification_preferences" as never)
      .select("preferences")
      .eq("profile_id" as never, recipientId)
      .maybeSingle();
    throwIfSupabaseError(error);
    const preferenceRow = data as unknown as Row | null;
    const preferences = preferenceRow && preferenceRow.preferences && typeof preferenceRow.preferences === "object"
      ? preferenceRow.preferences as Record<string, unknown>
      : {};
    return {
      reminders: preferences.reminders !== false,
      eventUpdates: preferences.eventUpdates !== false,
      reports: preferences.reports !== false,
      attendanceExceptions: preferences.attendanceExceptions !== false
    };
  },
  async updatePreferences(input, context) {
    const recipientId = context?.actorUserId ?? String((await currentProfile()).id ?? "");
    const current = await this.getPreferences(context);
    const preferences = { ...current, ...input };
    const client = getSupabaseBrowserClient();
    const { error } = await client
      .from("notification_preferences" as never)
      .upsert({ profile_id: recipientId, preferences, updated_at: new Date().toISOString() } as never, { onConflict: "profile_id" });
    throwIfSupabaseError(error);
    return preferences;
  }
};

export const supabaseAuditLogRepository: AuditLogRepository = {
  async listAuditLogs(query, context) {
    const listQuery = queryOrDefault(query);
    const from = listQuery.pageIndex * listQuery.pageSize;
    const to = from + listQuery.pageSize - 1;
    const client = getSupabaseBrowserClient();
    let builder = client.from("audit_logs").select("*", { count: "exact" });
    if (context?.actorRole === "organizer") {
      builder = builder.eq("actor_user_id", context.actorUserId);
    }
    const search = listQuery.search?.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
    if (search) {
      const filters = [`action.ilike.*${search}*`, `target_type.ilike.*${search}*`];
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search)) {
        filters.push(`target_id.eq.${search}`);
      }
      builder = builder.or(filters.join(","));
    }
    builder = builder.order(listQuery.sortBy ?? "created_at", { ascending: listQuery.sortDirection !== "desc" });
    const { data, error, count } = await builder.range(from, to);
    throwIfSupabaseError(error);
    const rawRows = (data ?? []) as Row[];
    const actorIds = [...new Set(rawRows.map((row) => typeof row.actor_user_id === "string" ? row.actor_user_id : "").filter(Boolean))];
    let actorRows: Row[] = [];
    if (actorIds.length) {
      const { data: profiles, error: profilesError } = await client
        .from("profiles")
        .select("id, first_name, middle_name, last_name, email, role, employee_id, student_id")
        .in("id", actorIds);
      throwIfSupabaseError(profilesError);
      actorRows = (profiles ?? []) as unknown as Row[];
    }
    const actorById = new Map(actorRows.map((actor) => [String(actor.id), actor]));
    return pageResult(rawRows.map((row) => ({ ...row, actor: actorById.get(String(row.actor_user_id ?? "")) })).map(mapAuditLog), count ?? rawRows.length, listQuery);
  },
  async logClientAction(input) {
    const client = getSupabaseBrowserClient();
    const { error } = await client.rpc("log_client_action", {
      p_action: input.action,
      p_target_type: input.targetType,
      p_target_id: input.targetId ?? null,
      p_metadata: (input.metadata ?? {}) as Json
    } as never);
    throwIfSupabaseError(error);
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
  async getSettings(context): Promise<SystemSettings> {
    requireOrganizerContext(context);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("system_settings" as never)
      .select("id, institution_name, current_school_year, current_semester_id, attendance_late_cutoff_minutes, default_session_duration_minutes, verification_policy, notification_preferences, updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfSupabaseError(error);
    if (!data) {
      throw new RepositoryError("System settings have not been configured yet. Please contact an administrator.", "NOT_FOUND");
    }
    const row = data as unknown as Row;
    const preferences = (row.notification_preferences && typeof row.notification_preferences === "object" && !Array.isArray(row.notification_preferences))
      ? row.notification_preferences as Row
      : {};
    const listOfMethods = Array.isArray(preferences.allowedVerificationMethods) ? preferences.allowedVerificationMethods : ["qr", "facial"];
    return {
      id: String(row.id),
      institutionName: String(row.institution_name ?? ""),
      currentSchoolYear: String(row.current_school_year ?? ""),
      currentSemesterId: String(row.current_semester_id ?? ""),
      attendanceLateCutoffMinutes: Number(row.attendance_late_cutoff_minutes ?? 15),
      defaultSessionDurationMinutes: Number(row.default_session_duration_minutes ?? 90),
      readerPolicy: String(preferences.readerPolicy ?? row.verification_policy ?? ""),
      credentialStatusPolicy: String(preferences.credentialStatusPolicy ?? ""),
      notificationPreferencePlaceholder: String(preferences.notificationPreferencePlaceholder ?? ""),
      notificationEventsEnabled: preferences.notificationEventsEnabled !== false,
      notificationCredentialsEnabled: preferences.notificationCredentialsEnabled !== false,
      notificationCorrectionsEnabled: preferences.notificationCorrectionsEnabled !== false,
      notificationRemindersEnabled: preferences.notificationRemindersEnabled !== false,
      eventApprovalRequired: preferences.eventApprovalRequired !== false,
      participantInvitationMode: preferences.participantInvitationMode === "email" || preferences.participantInvitationMode === "in_app" ? preferences.participantInvitationMode : "both",
      noStartReminderMinutes: Number(preferences.noStartReminderMinutes ?? 60),
      autoCancelAfterMinutes: Number(preferences.autoCancelAfterMinutes ?? 720),
      requireCancellationReason: preferences.requireCancellationReason !== false,
      minimumTimeOutIntervalMinutes: Number(preferences.minimumTimeOutIntervalMinutes ?? 15),
      allowAttendanceAfterScheduledEnd: preferences.allowAttendanceAfterScheduledEnd !== false,
      automaticAbsentMarking: preferences.automaticAbsentMarking !== false,
      allowedVerificationMethods: listOfMethods.filter((method): method is "qr" | "facial" => method === "qr" || method === "facial"),
      sensitiveActionReasonRequired: preferences.sensitiveActionReasonRequired !== false,
      updatedAt: String(row.updated_at ?? new Date().toISOString())
    };
  },
  async updateSettings(input, context): Promise<SystemSettings> {
    requireAdminContext(context);
    if (input.attendanceLateCutoffMinutes !== undefined && (input.attendanceLateCutoffMinutes < 0 || input.attendanceLateCutoffMinutes > 240)) {
      throw new RepositoryError("Late attendance cutoff must be between 0 and 240 minutes.", "VALIDATION_ERROR");
    }
    if (input.defaultSessionDurationMinutes !== undefined && (input.defaultSessionDurationMinutes < 1 || input.defaultSessionDurationMinutes > 1440)) {
      throw new RepositoryError("Session duration must be between 1 and 1,440 minutes.", "VALIDATION_ERROR");
    }
    const current = await supabaseSystemSettingsRepository.getSettings(context);
    const client = getSupabaseBrowserClient();
    const changes = {
        ...(input.institutionName !== undefined ? { institution_name: input.institutionName.trim() } : {}),
        ...(input.currentSchoolYear !== undefined ? { current_school_year: input.currentSchoolYear.trim() } : {}),
        ...(input.currentSemesterId !== undefined ? { current_semester_id: input.currentSemesterId || null } : {}),
        ...(input.attendanceLateCutoffMinutes !== undefined ? { attendance_late_cutoff_minutes: input.attendanceLateCutoffMinutes } : {}),
        ...(input.defaultSessionDurationMinutes !== undefined ? { default_session_duration_minutes: input.defaultSessionDurationMinutes } : {}),
        notification_preferences: {
          readerPolicy: input.readerPolicy?.trim() || current.readerPolicy,
          credentialStatusPolicy: input.credentialStatusPolicy?.trim() || current.credentialStatusPolicy,
          notificationPreferencePlaceholder: input.notificationPreferencePlaceholder?.trim() || current.notificationPreferencePlaceholder,
          notificationEventsEnabled: input.notificationEventsEnabled ?? current.notificationEventsEnabled,
          notificationCredentialsEnabled: input.notificationCredentialsEnabled ?? current.notificationCredentialsEnabled,
          notificationCorrectionsEnabled: input.notificationCorrectionsEnabled ?? current.notificationCorrectionsEnabled,
          notificationRemindersEnabled: input.notificationRemindersEnabled ?? current.notificationRemindersEnabled,
          eventApprovalRequired: input.eventApprovalRequired ?? current.eventApprovalRequired,
          participantInvitationMode: input.participantInvitationMode ?? current.participantInvitationMode,
          noStartReminderMinutes: input.noStartReminderMinutes ?? current.noStartReminderMinutes,
          autoCancelAfterMinutes: input.autoCancelAfterMinutes ?? current.autoCancelAfterMinutes,
          requireCancellationReason: input.requireCancellationReason ?? current.requireCancellationReason,
          minimumTimeOutIntervalMinutes: input.minimumTimeOutIntervalMinutes ?? current.minimumTimeOutIntervalMinutes,
          allowAttendanceAfterScheduledEnd: input.allowAttendanceAfterScheduledEnd ?? current.allowAttendanceAfterScheduledEnd,
          automaticAbsentMarking: input.automaticAbsentMarking ?? current.automaticAbsentMarking,
          allowedVerificationMethods: input.allowedVerificationMethods ?? current.allowedVerificationMethods,
          sensitiveActionReasonRequired: input.sensitiveActionReasonRequired ?? current.sensitiveActionReasonRequired
        },
        verification_policy: input.readerPolicy?.trim() || current.readerPolicy
      } as Json;
    const { error } = await client.rpc("admin_update_system_settings" as never, { p_settings_id: current.id, p_changes: changes } as never);
    throwIfSupabaseError(error);
    return supabaseSystemSettingsRepository.getSettings(context);
  }
};

function requireAdminHealthContext(context?: { actorRole?: string }) {
  if (context?.actorRole !== "admin") {
    throw new RepositoryError("Only active administrators can use system troubleshooting tools.", "PERMISSION_DENIED");
  }
}

function requireAdminContext(context?: { actorRole?: string }) {
  if (context?.actorRole !== "admin") {
    throw new RepositoryError("Only administrators can manage global configuration.", "PERMISSION_DENIED");
  }
}

export const supabaseSystemHealthRepository: SystemHealthRepository = {
  async getHealthSnapshot(context): Promise<SystemHealthSnapshot> {
    requireAdminHealthContext(context);
    const client = getSupabaseBrowserClient();
    const checkedAt = new Date().toISOString();
    const checks: SystemHealthSnapshot["checks"] = [];

    const { data: settingsData, error: databaseError } = await client.from("system_settings" as never).select("id, institution_name, current_school_year, current_semester_id, updated_at").limit(1).maybeSingle();
    const settingsRow = settingsData as unknown as Row | null;
    checks.push({ key: "database", label: "Supabase connectivity", status: databaseError ? "failed" : "healthy", message: databaseError ? "The application data layer did not respond." : "The application data layer is responding.", checkedAt });
    const configurationReady = Boolean(settingsRow?.institution_name && settingsRow?.current_school_year && settingsRow?.current_semester_id);
    checks.push({ key: "configuration", label: "Configuration status", status: databaseError ? "failed" : configurationReady ? "healthy" : "degraded", message: databaseError ? "Configuration could not be checked." : configurationReady ? "Institution, school year, and semester configuration are present." : "Required institution or academic configuration is incomplete.", checkedAt });

    const { data: authData, error: authError } = await client.auth.getUser();
    checks.push({ key: "auth", label: "Authentication status", status: authError || !authData.user ? "failed" : "healthy", message: authError || !authData.user ? "The administrator session could not be verified." : "The administrator session is active.", checkedAt });

    const { error: storageError } = await client.storage.from("branding-assets").list("", { limit: 1 });
    checks.push({ key: "storage", label: "Storage availability", status: storageError ? "degraded" : "healthy", message: storageError ? "Configured storage could not be reached." : "Configured storage access is available.", checkedAt });

    const functionName = import.meta.env.VITE_HEALTH_CHECK_FUNCTION_NAME || "send-event-emails";
    const { error: functionError } = await client.functions.invoke(functionName, { body: { action: "health" } });
    checks.push({ key: "edge-functions", label: "Edge Function availability", status: functionError ? "failed" : "healthy", message: functionError ? "The configured health-check function did not respond." : `The ${functionName} Edge Function is available.`, checkedAt });

    const reports = await supabaseReportRepository.listReports({ pageIndex: 0, pageSize: 25 });
    const recentErrors: SystemHealthIssue[] = reports.items.filter((report) => report.status === "failed").map((report) => ({ id: report.id, category: "application_error", severity: "critical", message: `${report.title} report generation failed.`, createdAt: report.generatedAt ?? checkedAt, referenceId: report.id }));
    const stuckCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: stuckRows, error: stuckError } = await client
      .from("event_sessions")
      .select("*")
      .eq("session_status", "ongoing")
      .lt("scheduled_end", stuckCutoff)
      .order("scheduled_end", { ascending: true })
      .limit(100);
    throwIfSupabaseError(stuckError);
    const stuckSessions = ((stuckRows ?? []) as Row[]).map((row) => mapAttendanceSession(row, "event"));

    const eventEmailResult = await client
      .from("event_email_outbox" as never)
      .select("id, recipient_email, subject, delivery_status, error_message, created_at" as never)
      .eq("delivery_status" as never, "failed")
      .order("created_at" as never, { ascending: false })
      .limit(50);
    throwIfSupabaseError(eventEmailResult.error);
    const requestEmailResult = await client
      .from("request_email_outbox" as never)
      .select("id, recipient_email, subject, delivery_status, error_message, created_at" as never)
      .eq("delivery_status" as never, "failed")
      .order("created_at" as never, { ascending: false })
      .limit(50);
    throwIfSupabaseError(requestEmailResult.error);
    const [eventSentResult, requestSentResult] = await Promise.all([
      client.from("event_email_outbox" as never).select("sent_at" as never).not("sent_at" as never, "is", null).order("sent_at" as never, { ascending: false }).limit(1),
      client.from("request_email_outbox" as never).select("sent_at" as never).not("sent_at" as never, "is", null).order("sent_at" as never, { ascending: false }).limit(1)
    ]);
    throwIfSupabaseError(eventSentResult.error);
    throwIfSupabaseError(requestSentResult.error);
    const sentTimes = [...((eventSentResult.data ?? []) as unknown as Row[]), ...((requestSentResult.data ?? []) as unknown as Row[])]
      .map((row) => String(row.sent_at ?? ""))
      .filter(Boolean)
      .sort()
      .reverse();
    const failedNotifications: FailedNotificationJob[] = [
      ...((eventEmailResult.data ?? []) as unknown as Row[]).map((row) => ({ id: String(row.id), source: "event_email" as const, recipient: String(row.recipient_email ?? ""), channel: "email" as const, subject: String(row.subject ?? "Email delivery"), status: "failed" as const, lastError: String(row.error_message ?? "Email delivery failed."), updatedAt: String(row.created_at ?? checkedAt) })),
      ...((requestEmailResult.data ?? []) as unknown as Row[]).map((row) => ({ id: String(row.id), source: "request_email" as const, recipient: String(row.recipient_email ?? ""), channel: "email" as const, subject: String(row.subject ?? "Request update"), status: "failed" as const, lastError: String(row.error_message ?? "Email delivery failed."), updatedAt: String(row.created_at ?? checkedAt) }))
    ];
    return { checks, recentErrors, failedNotifications, stuckSessions, consistencyIssues: [], lastSuccessfulEmailAt: sentTimes[0] ?? null };
  },
  async retryFailedNotification(input, context): Promise<FailedNotificationJob> {
    requireAdminHealthContext(context);
    if (!input.reason.trim()) throw new RepositoryError("A reason is required for system recovery actions.", "VALIDATION_ERROR");
    const client = getSupabaseBrowserClient();
    if (!input.jobId) throw new RepositoryError("The failed notification id is invalid.", "VALIDATION_ERROR");
    if (input.source !== "event_email") throw new RepositoryError("Only recent participant invitation emails can be retried. Request-update emails remain failed for review.", "VALIDATION_ERROR");
    const { data, error } = await client.rpc("admin_retry_email_job" as never, { p_job_id: input.jobId, p_source: input.source, p_reason: input.reason } as never);
    throwIfSupabaseError(error);
    if (!data) throw new RepositoryError("Only failed notification jobs can be retried.", "NOT_FOUND");
    const row = data as unknown as Row;
    const result: FailedNotificationJob = { id: String(row.id), source: input.source, recipient: String(row.recipient_email ?? ""), channel: "email", subject: String(row.subject ?? "Email delivery"), status: "retrying", lastError: "Queued for another delivery attempt.", updatedAt: String(row.created_at ?? new Date().toISOString()) };
    return result;
  },
  async recoverAttendanceSession(input, context) {
    requireAdminHealthContext(context);
    if (!input.reason.trim()) throw new RepositoryError("A reason is required for system recovery actions.", "VALIDATION_ERROR");
    const session = await supabaseAttendanceSessionRepository.getAttendanceSessionById(input.sessionId, context);
    if (session.status !== "active") throw new RepositoryError("Only active stuck sessions can be recovered.", "VALIDATION_ERROR");
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_recover_attendance_session" as never, { p_session_id: input.sessionId, p_reason: input.reason } as never);
    throwIfSupabaseError(error);
    return mapAttendanceSession(data as Row, "event");
  },
  async finishEvent(input, context) {
    requireAdminHealthContext(context);
    if (!input.reason.trim()) throw new RepositoryError("A reason is required for system recovery actions.", "VALIDATION_ERROR");
    const { data, error } = await getSupabaseBrowserClient().rpc("admin_finish_event" as never, { p_event_id: input.eventId, p_reason: input.reason } as never);
    throwIfSupabaseError(error);
    return mapEvent(data as Row);
  },
  async runDataConsistencyCheck(context) {
    requireAdminHealthContext(context);
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.rpc("admin_run_data_consistency_check" as never);
    throwIfSupabaseError(error);
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      id: String(row.id ?? ""),
      category: "consistency" as const,
      severity: String(row.severity ?? "critical") as SystemHealthIssue["severity"],
      message: String(row.message ?? "Consistency issue detected."),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      referenceId: row.reference_id ? String(row.reference_id) : undefined
    }));
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
  systemSettings: supabaseSystemSettingsRepository,
  systemHealth: supabaseSystemHealthRepository
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
