import type {
  AttendanceRecord,
  AttendanceSession,
  AuditLog,
  Class,
  ClassRoster,
  CorrectionRequest,
  Event,
  EventParticipant,
  FacultyProfile,
  NfcCredential,
  NfcCredentialRequest,
  NfcReader,
  Notification,
  OrganizerProfile,
  Report,
  Student,
  User
} from "@/types/domain";
import type { AttendanceMode, AttendanceSessionType, AttendanceStatus, EventStatus, NfcCredentialStatus, UserRole, VerificationMethod } from "@/types/enums";

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

function booleanValue(row: Row, keys: string[], fallback = false) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return fallback;
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
  const eventStatus = stringValue(row, ["event_status", "status"], "pending");
  if (eventStatus === "completed" || eventStatus === "cancelled") {
    return eventStatus;
  }
  return eventStatus === "draft" ? "pending" : "approved";
}

function mapSessionStatus(value: string): AttendanceSession["status"] {
  if (value === "ongoing") {
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

function mapCredentialRequestStatus(value: string): NfcCredentialRequest["status"] {
  if (value === "resolved") {
    return "completed";
  }
  if (value === "approved" || value === "rejected" || value === "pending" || value === "completed") {
    return value;
  }
  return "pending";
}

export function maskCredentialIdentifier(value: string | undefined) {
  if (!value) {
    return "masked";
  }
  return `${value.slice(0, 3)}-${"*".repeat(Math.max(value.length - 6, 4))}-${value.slice(-3)}`;
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
  return {
    id: stringValue(row, ["id", "student_id"]),
    userId: stringValue(row, ["profile_id", "user_id", "id"]),
    studentNumber: stringValue(row, ["student_number", "student_no", "student_id", "id"]),
    status: stringValue(row, ["student_status", "status"], "enrolled") as Student["status"],
    programId: stringValue(row, ["program_id"]),
    departmentId: stringValue(row, ["department_id", "college_id"]),
    yearLevel: numberValue(row, ["year_level"], 1),
    section: stringValue(row, ["section_name", "section_id", "section"]),
    createdAt: stringValue(row, ["created_at"], new Date().toISOString())
  };
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
    scheduleLabel: stringValue(row, ["schedule_label"], "Schedule unavailable"),
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
    venue: stringValue(row, ["venue", "room_id"]),
    startsAt: stringValue(row, ["starts_at", "start_time", "event_date"], new Date().toISOString()),
    endsAt: stringValue(row, ["ends_at", "end_time", "event_date"], new Date().toISOString()),
    status: mapEventStatus(row)
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

export function mapAttendanceSession(row: Row, type: AttendanceSessionType): AttendanceSession {
  return {
    id: stringValue(row, ["id"]),
    type,
    classId: optionalString(row, ["class_id"]),
    eventId: optionalString(row, ["event_id"]),
    title: stringValue(row, ["title", "session_name"], "Attendance session"),
    mode: mapSessionMode(stringValue(row, ["attendance_mode", "mode"], "required")),
    status: mapSessionStatus(stringValue(row, ["session_status", "status"], "scheduled")),
    startsAt: stringValue(row, ["starts_at", "start_time", "actual_start", "session_date"], new Date().toISOString()),
    endsAt: optionalString(row, ["ends_at", "end_time", "actual_end"]),
    lateCutoffAt: optionalString(row, ["late_cutoff_at"]),
    attendanceWindowStartAt: optionalString(row, ["attendance_window_start", "attendance_window_start_at"]),
    attendanceWindowEndAt: optionalString(row, ["attendance_window_end", "attendance_window_end_at"]),
    createdByUserId: stringValue(row, ["created_by", "created_by_user_id"])
  };
}

export function mapAttendanceRecord(row: Row): AttendanceRecord {
  return {
    id: stringValue(row, ["id"]),
    sessionId: stringValue(row, ["class_session_id", "event_session_id", "session_id"]),
    studentId: stringValue(row, ["student_id"]),
    status: stringValue(row, ["attendance_status", "status"], "present") as AttendanceStatus,
    verificationMethod: stringValue(row, ["verification_method"], "nfc") as VerificationMethod,
    recordedAt: stringValue(row, ["recorded_at", "time_in", "created_at"], new Date().toISOString()),
    recordedByUserId: optionalString(row, ["recorded_by", "created_by"]),
    note: optionalString(row, ["remarks", "note"])
  };
}

export function mapNfcCredential(row: Row): NfcCredential {
  return {
    id: stringValue(row, ["id"]),
    studentId: stringValue(row, ["student_id"]),
    nfcUid: maskCredentialIdentifier(stringValue(row, ["credential_identifier", "public_identifier", "id"])),
    status: stringValue(row, ["nfc_status", "status"], "inactive") as NfcCredentialStatus,
    issuedAt: stringValue(row, ["issued_at", "created_at"], new Date().toISOString()),
    replacedByCredentialId: optionalString(row, ["replaced_by_credential_id"])
  };
}

export function mapNfcReader(row: Row): NfcReader {
  return {
    id: stringValue(row, ["id"]),
    label: stringValue(row, ["label", "device_name"], "Device"),
    serialNumber: maskCredentialIdentifier(stringValue(row, ["serial_number", "device_code", "id"])),
    location: stringValue(row, ["location", "room_id"], "Unassigned"),
    departmentId: stringValue(row, ["department_id", "college_id"]),
    status: stringValue(row, ["device_status", "status"], "inactive") as NfcReader["status"],
    assignedToUserId: optionalString(row, ["assigned_to", "assigned_to_user_id"]),
    lastSeenAt: optionalString(row, ["last_seen_at"]),
    isTrusted: booleanValue(row, ["is_trusted"], false)
  };
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
    reviewedAt: optionalString(row, ["reviewed_at"])
  };
}

export function mapNfcCredentialRequest(row: Row): NfcCredentialRequest {
  return {
    id: stringValue(row, ["id"]),
    studentId: stringValue(row, ["student_id"]),
    credentialId: optionalString(row, ["credential_id"]),
    type: stringValue(row, ["request_type", "type"], "replacement") as NfcCredentialRequest["type"],
    status: mapCredentialRequestStatus(stringValue(row, ["request_status", "status"], "pending")),
    reason: stringValue(row, ["reason", "explanation", "review_remarks"]),
    requestedAt: stringValue(row, ["created_at", "requested_at"], new Date().toISOString()),
    reviewedByUserId: optionalString(row, ["reviewed_by"]),
    reviewedAt: optionalString(row, ["reviewed_at"])
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
    metadata: {}
  };
}
