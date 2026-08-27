import type {
  AttendanceRecord,
  AttendanceSession,
  AuditLog,
  Class,
  ClassRoster,
  CorrectionRequest,
  CredentialRequest,
  Event,
  EventFeedback,
  EventFeedbackRating,
  EventObjective,
  EventParticipant,
  FacialProfile,
  FacultyProfile,
  Notification,
  OrganizerProfile,
  QrCredential,
  Report,
  Student,
  User
} from "@/types/domain";
import type { AttendanceMode, AttendanceSessionType, AttendanceStatus, EventStatus, PriorityLevel, UserRole, VerificationMethod } from "@/types/enums";

type Row = Record<string, unknown>;

function nestedRow(row: Row, key: string): Row | undefined {
  const value = row[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Row;
  }
  return undefined;
}

function stringValue(row: Row, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return fallback;
}

function numberValue(row: Row, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number") {
      return value;
    }
  }
  return fallback;
}

function nullableNumberValue(row: Row, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
}

function optionalString(row: Row, keys: string[]) {
  const value = stringValue(row, keys);
  return value || undefined;
}

function profileDisplayName(row: Row) {
  const explicitName = stringValue(row, ["display_name", "full_name", "name"]);
  if (explicitName) {
    return explicitName;
  }
  const nameParts = [stringValue(row, ["first_name"]), stringValue(row, ["middle_name"]), stringValue(row, ["last_name"])].filter(Boolean);
  return nameParts.length ? nameParts.join(" ") : stringValue(row, ["email"], "PLPass User");
}

function mapClassStatus(value: string) {
  return value === "active" ? "active" : "archived";
}

const dayLabels: Record<number, string> = { 1: "M", 2: "T", 3: "W", 4: "Th", 5: "F", 6: "Sa", 7: "Su" };

function formatScheduleTime(value: string) {
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutesStr} ${period}`;
}

function buildScheduleLabel(row: Row): string {
  const schedules = row["class_schedules"];
  if (!Array.isArray(schedules) || schedules.length === 0) {
    return "Schedule unavailable";
  }
  const days = schedules
    .map((entry) => dayLabels[Number((entry as Row).day_of_week)] ?? "")
    .join("");
  const first = schedules[0] as Row;
  const start = stringValue(first, ["start_time"]);
  const end = stringValue(first, ["end_time"]);
  if (!start || !end) {
    return "Schedule unavailable";
  }
  return `${days} ${formatScheduleTime(start)} - ${formatScheduleTime(end)}`;
}

function mapEmploymentStatus(value: string): FacultyProfile["employmentStatus"] {
  if (value === "part_time" || value === "on_leave") {
    return value;
  }
  if (value === "resigned" || value === "inactive") {
    return "separated";
  }
  return "active";
}

function mapEventStatus(row: Row): EventStatus {
  const eventStatus = stringValue(row, ["event_status", "status"], "pending");
  if (eventStatus === "completed" || eventStatus === "cancelled") {
    return eventStatus;
  }

  const approvalStatus = stringValue(row, ["approval_status"]);
  if (approvalStatus === "approved") {
    return "approved";
  }
  if (approvalStatus === "declined") {
    return "rejected";
  }
  if (approvalStatus === "pending") {
    return "pending";
  }

  return eventStatus === "draft" ? "pending" : "approved";
}
function mapPriorityLevel(value: string): PriorityLevel {
  if (value === "Time-Sensitive" || value === "Business-Critical" || value === "Flexible") {
    return value;
  }
  return "Flexible";
}

function mapSessionStatus(value: string): AttendanceSession["status"] {
  if (value === "ongoing" || value === "active") {
    return "active";
  }
  if (value === "scheduled") {
    return "draft";
  }
  if (value === "completed" || value === "cancelled") {
    return value;
  }
  return "draft";
}

function mapSessionMode(value: string): AttendanceMode {
  if (value === "online") {
    return "optional";
  }
  if (value === "required" || value === "optional" || value === "makeup") {
    return value;
  }
  return "required";
}

export function mapProfileToUser(row: Row): User {
  return {
    id: stringValue(row, ["id", "profile_id"]),
    role: stringValue(row, ["role"], "student") as UserRole,
    email: stringValue(row, ["email"]),
    displayName: profileDisplayName(row),
    avatarUrl: optionalString(row, ["avatar_url", "profile_picture"]),
    isActive: !["inactive", "suspended"].includes(stringValue(row, ["account_status"], "active")),
    createdAt: stringValue(row, ["created_at"], new Date().toISOString())
  };
}

export function mapStudent(row: Row): Student {
  const profile = nestedRow(row, "profiles");
  const section = nestedRow(row, "sections");
  const program = nestedRow(row, "programs");

  const firstName = profile ? stringValue(profile, ["first_name"]) : "";
  const middleName = profile ? stringValue(profile, ["middle_name"]) : "";
  const lastName = profile ? stringValue(profile, ["last_name"]) : "";

  const middleInitial = middleName.trim() ? `${middleName.trim().charAt(0).toUpperCase()}.` : "";
  const formattedName = lastName && firstName
    ? `${lastName}, ${firstName}${middleInitial ? " " + middleInitial : ""}`
    : [firstName, middleName, lastName].filter(Boolean).join(" ");

  const fullName = profile
    ? [firstName, middleName, lastName].filter(Boolean).join(" ")
    : "";

  const base = {
    id: stringValue(row, ["id", "student_id"]),
    userId: stringValue(row, ["profile_id", "user_id", "id"]),
    studentNumber: stringValue(row, ["student_number", "student_no", "student_id", "id"]),
    status: stringValue(row, ["student_status", "status"], "enrolled") as Student["status"],
    programId: stringValue(row, ["program_id"]),
    departmentId: stringValue(row, ["department_id", "college_id"]),
    programCode: stringValue(program ?? {}, ["program_code", "code"], stringValue(row, ["program_id"])),
    yearLevel: numberValue(row, ["year_level"], numberValue(section ?? {}, ["year_level"], 1)),
    section: stringValue(row, ["section_name"], stringValue(section ?? {}, ["section_name"], stringValue(row, ["section_id"]))),
    createdAt: stringValue(row, ["created_at"], new Date().toISOString()),
    firstName: firstName || undefined,
    middleName: middleName || undefined,
    lastName: lastName || undefined,
    formattedName: formattedName || undefined,
    fullName: fullName || undefined,
    email: profile ? optionalString(profile, ["email"]) : undefined
  };
  return base as Student;
}

export function mapFaculty(row: Row): FacultyProfile {
  return {
    id: stringValue(row, ["id", "faculty_id"]),
    userId: stringValue(row, ["profile_id", "user_id"]),
    employeeNumber: stringValue(row, ["employee_number", "faculty_number", "employee_id", "id"]),
    departmentId: stringValue(row, ["department_id", "college_id"]),
    employmentStatus: mapEmploymentStatus(stringValue(row, ["employment_status", "faculty_status", "status"], "active")),
    title: stringValue(row, ["title", "position", "employment_type"], "Faculty")
  };
}

export function mapOrganizer(row: Row): OrganizerProfile {
  return {
    id: stringValue(row, ["id", "organizer_id"]),
    userId: stringValue(row, ["profile_id", "user_id"]),
    employeeNumber: stringValue(row, ["employee_number", "organizer_number", "employee_id", "id"]),
    organizationName: stringValue(row, ["organization_name", "office_name"], "Organizer"),
    departmentId: optionalString(row, ["department_id", "college_id"]),
    position: stringValue(row, ["position"], "Organizer"),
    employmentStatus: mapEmploymentStatus(stringValue(row, ["employment_status", "organizer_status", "status"], "active"))
  };
}

export function mapClass(row: Row): Class {
  const subject = nestedRow(row, "subjects");
  const room = nestedRow(row, "rooms");
  const section = nestedRow(row, "sections");
  const sectionProgram = nestedRow(section ?? {}, "programs");
  return {
    id: stringValue(row, ["id", "class_id"]),
    facultyId: stringValue(row, ["faculty_id"]),
    programId: stringValue(row, ["program_id"], stringValue(section ?? {}, ["program_id"])),
    departmentId: stringValue(row, ["department_id", "college_id"], stringValue(sectionProgram ?? {}, ["department_id"])),
    semesterId: stringValue(row, ["semester_id"]),
    subjectCode: stringValue(row, ["subject_code", "code"], stringValue(subject ?? {}, ["subject_code"])),
    subjectTitle: stringValue(row, ["subject_title", "title", "name"], stringValue(subject ?? {}, ["subject_name"], "Subject unavailable")),
    room: stringValue(row, ["room_code", "room_name"], stringValue(room ?? {}, ["room_code"], stringValue(row, ["room_id"]))),
    section: stringValue(row, ["section_name"], stringValue(section ?? {}, ["section_name"], stringValue(row, ["section_id"]))),
    yearLevel: numberValue(row, ["year_level"], numberValue(section ?? {}, ["year_level"], 1)),
    scheduleLabel: buildScheduleLabel(row),
    status: mapClassStatus(stringValue(row, ["class_status", "status"], "active")),
    rosterId: stringValue(row, ["roster_id", "id"])
  };
}

export function mapClassRoster(row: Row): ClassRoster {
  return {
    id: stringValue(row, ["id"]),
    classId: stringValue(row, ["class_id"]),
    studentId: stringValue(row, ["student_id"]),
    enrolledAt: stringValue(row, ["enrolled_at", "created_at"], new Date().toISOString())
  };
}

export function mapEvent(row: Row): Event {
  const category = nestedRow(row, "event_categories");
  return {
    id: stringValue(row, ["id", "event_id"]),
    code: stringValue(row, ["event_code", "code"]),
    organizerId: stringValue(row, ["organizer_id"]),
    departmentId: optionalString(row, ["department_id", "college_id"]),
    category: stringValue(row, ["category_name", "category"], stringValue(category ?? {}, ["category_name"], stringValue(row, ["category_id"]))),
    title: stringValue(row, ["title", "event_name"]),
    description: optionalString(row, ["description"]),
    venue: stringValue(row, ["venue", "room_id"]),
    startsAt: stringValue(row, ["starts_at", "start_time", "event_date"], new Date().toISOString()),
    endsAt: stringValue(row, ["ends_at", "end_time", "event_date"], new Date().toISOString()),
    status: mapEventStatus(row),
    priorityLevel: mapPriorityLevel(stringValue(row, ["priority_level"], "Flexible")),
    impactScore: nullableNumberValue(row, ["impact_score"]),
    predictedTurnout: nullableNumberValue(row, ["predicted_turnout_percent"]),
    visibility: stringValue(row, ["visibility"], "assigned") === "public" ? "public" : "assigned",
    approvalReason: optionalString(row, ["approval_reason"]),
    cancellationReason: optionalString(row, ["cancellation_reason"])
  };
}

export function mapEventParticipant(row: Row): EventParticipant {
  return {
    id: stringValue(row, ["id"]),
    eventId: stringValue(row, ["event_id"]),
    studentId: stringValue(row, ["student_id"]),
    registeredAt: stringValue(row, ["registered_at", "created_at"], new Date().toISOString())
  };
}

export function mapEventObjective(row: Row): EventObjective {
  return {
    id: stringValue(row, ["id"]),
    eventId: stringValue(row, ["event_id"]),
    order: numberValue(row, ["objective_order"]),
    text: stringValue(row, ["objective_text"])
  };
}

export function mapEventFeedbackRating(row: Row): EventFeedbackRating {
  return {
    id: stringValue(row, ["id"]),
    feedbackId: stringValue(row, ["feedback_id"]),
    objectiveId: stringValue(row, ["objective_id"]),
    rating: numberValue(row, ["rating"])
  };
}

export function mapEventFeedback(row: Row): EventFeedback {
  const ratings = row["event_feedback_ratings"];
  return {
    id: stringValue(row, ["id"]),
    eventId: stringValue(row, ["event_id"]),
    studentId: stringValue(row, ["student_id"]),
    attendanceRecordId: stringValue(row, ["attendance_record_id"]),
    comment: optionalString(row, ["comment"]),
    submittedAt: stringValue(row, ["submitted_at"], new Date().toISOString()),
    ratings: Array.isArray(ratings) ? ratings.map((rating) => mapEventFeedbackRating(rating as Row)) : undefined
  };
}

export function mapAttendanceSession(row: Row, type: AttendanceSessionType): AttendanceSession {
  return {
    id: stringValue(row, ["id"]),
    type,
    classId: optionalString(row, ["class_id"]),
    eventId: optionalString(row, ["event_id"]),
    title: stringValue(row, ["title", "session_name"], "Attendance session"),
    mode: mapSessionMode(stringValue(row, ["attendance_mode", "mode"], "required")),
    status: mapSessionStatus(stringValue(row, ["session_status", "status"], "scheduled")),
    startsAt: stringValue(row, ["scheduled_start", "starts_at", "start_time", "actual_start", "session_date"], new Date().toISOString()),
    endsAt: optionalString(row, ["scheduled_end", "ends_at", "end_time", "actual_end"]),
    lateCutoffAt: optionalString(row, ["late_cutoff_at"]),
    attendanceWindowStartAt: optionalString(row, ["attendance_window_start_at", "attendance_window_start", "scheduled_start"]),
    attendanceWindowEndAt: optionalString(row, ["attendance_window_end_at", "attendance_window_end", "scheduled_end"]),
    createdByUserId: stringValue(row, ["created_by", "created_by_user_id"])
  };
}

export function mapAttendanceRecord(row: Row): AttendanceRecord {
  const base = {
    id: stringValue(row, ["id"]),
    sessionId: stringValue(row, ["class_session_id", "event_session_id", "session_id"]),
    studentId: stringValue(row, ["student_id"]),
    status: stringValue(row, ["attendance_status", "status"], "present") as AttendanceStatus,
    verificationMethod: stringValue(row, ["verification_method"], "manual") as VerificationMethod,
    checkoutVerificationMethod: optionalString(row, ["checkout_verification_method"]) as VerificationMethod | undefined,
    recordedAt: stringValue(row, ["recorded_at", "time_in", "created_at"], new Date().toISOString()),
    recordedByUserId: optionalString(row, ["recorded_by", "created_by"]),
    note: optionalString(row, ["remarks", "note"]),
    lateReasonCategory: optionalString(row, ["late_reason_category"]),
    timeIn: optionalString(row, ["time_in"]),
    checkedOutAt: optionalString(row, ["time_out"]),
    lateReason: optionalString(row, ["late_reason_category", "late_reason"]) as AttendanceRecord["lateReason"]
  };
  return base as AttendanceRecord;
}

export function mapCorrectionRequest(row: Row): CorrectionRequest {
  return {
    id: stringValue(row, ["id"]),
    studentId: stringValue(row, ["student_id"]),
    attendanceRecordId: stringValue(row, ["attendance_record_id"]),
    classId: optionalString(row, ["class_id"]),
    eventId: optionalString(row, ["event_id"]),
    requestedStatus: stringValue(row, ["requested_status"], "present") as AttendanceStatus,
    reason: stringValue(row, ["explanation", "reason"]),
    status: stringValue(row, ["request_status", "status"], "pending") as CorrectionRequest["status"],
    requestedAt: stringValue(row, ["created_at", "requested_at"], new Date().toISOString()),
    reviewedByUserId: optionalString(row, ["reviewed_by"]),
    reviewedAt: optionalString(row, ["reviewed_at"]),
    reviewRemarks: optionalString(row, ["review_reason", "review_remarks"])
  };
}

export function mapCredentialRequest(row: Row): CredentialRequest {
  return {
    id: stringValue(row, ["id"]),
    studentId: stringValue(row, ["student_id"]),
    credentialType: stringValue(row, ["credential_type"], "qr") === "facial" ? "facial" : "qr",
    requestType: stringValue(row, ["request_type"], "technical_issue") as CredentialRequest["requestType"],
    reason: stringValue(row, ["reason"]),
    status: stringValue(row, ["request_status"], "pending") as CredentialRequest["status"],
    requestedAt: stringValue(row, ["created_at"], new Date().toISOString()),
    reviewedByUserId: optionalString(row, ["reviewed_by"]),
    reviewedAt: optionalString(row, ["reviewed_at"]),
    reviewRemarks: optionalString(row, ["review_remarks"])
  };
}

export function mapQrCredential(row: Row): QrCredential {
  return {
    id: stringValue(row, ["id"]),
    studentId: stringValue(row, ["student_id", "studentId"]),
    tokenHash: stringValue(row, ["token_hash", "tokenHash"]),
    status: stringValue(row, ["credential_status", "status"], "unknown"),
    issuedAt: stringValue(row, ["issued_at", "issuedAt"], new Date().toISOString()),
    expiresAt: optionalString(row, ["expires_at", "expiresAt"]),
    revokedAt: optionalString(row, ["revoked_at", "revokedAt"]),
    lastSuccessfulCheckInAt: optionalString(row, ["last_successful_check_in_at", "lastSuccessfulCheckInAt"])
  };
}

export function mapFacialProfile(row: Row): FacialProfile {
  return {
    id: stringValue(row, ["id"]),
    studentId: stringValue(row, ["student_id", "studentId"]),
    status: stringValue(row, ["facial_status", "status"], "unknown"),
    enrollmentReference: stringValue(row, ["enrollment_reference", "enrollmentReference"]),
    enrolledAt: stringValue(row, ["enrolled_at", "enrolledAt"], new Date().toISOString()),
    consentRecordedAt: stringValue(row, ["consent_recorded_at", "consentRecordedAt"], new Date().toISOString()),
    lastVerifiedAt: optionalString(row, ["last_verified_at", "lastVerifiedAt"])
  };
}

export function mapReport(row: Row): Report {
  return {
    id: stringValue(row, ["id"]),
    title: stringValue(row, ["title", "report_name", "report_type"], "Generated report"),
    scope: stringValue(row, ["scope", "scope_id", "format"]),
    status: stringValue(row, ["report_status", "status"], "ready") as Report["status"],
    requestedByUserId: stringValue(row, ["requested_by", "created_by", "generated_by"]),
    generatedAt: optionalString(row, ["generated_at", "created_at"])
  };
}

export function mapNotification(row: Row): Notification {
  return {
    id: stringValue(row, ["id"]),
    userId: stringValue(row, ["recipient_id", "user_id"]),
    type: stringValue(row, ["notification_type", "type"], "system") as Notification["type"],
    title: stringValue(row, ["title"], "Notification"),
    body: stringValue(row, ["body", "message"]),
    status: stringValue(row, ["notification_status", "status"], stringValue(row, ["read_at"]) ? "read" : "unread") as Notification["status"],
    createdAt: stringValue(row, ["created_at"], new Date().toISOString())
  };
}

export function mapAuditLog(row: Row): AuditLog {
  return {
    id: stringValue(row, ["id"]),
    actorUserId: stringValue(row, ["actor_user_id", "created_by", "performed_by"]),
    action: stringValue(row, ["action"]),
    targetType: stringValue(row, ["target_type", "session_type"]),
    targetId: stringValue(row, ["target_id", "session_id"]),
    timestamp: stringValue(row, ["created_at", "timestamp"], new Date().toISOString()),
    metadata: (row["metadata"] as Record<string, string | number | boolean>) || {}
  };
}
