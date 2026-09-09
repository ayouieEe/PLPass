import type { AuditLog, Event, Student, User, AttendanceSession } from "@/types/domain";

const ACRONYM_MAP: Record<string, string> = {
  qr: "QR",
  nfc: "NFC",
  id: "ID",
  ml: "ML",
  plp: "PLP",
  api: "API"
};

const ACTION_EXACT_MAP: Record<string, string> = {
  "credential.qr.issued": "QR credential issued",
  "credential_qr_issued": "QR credential issued",
  "Credential.qr Issued": "QR credential issued",
  "credential.qr.revoked": "QR credential revoked",
  "credential.facial.enrolled": "Facial credential enrolled",
  "credential.status_changed": "Credential status changed",
  "event.created": "Event created",
  "event.updated": "Event updated",
  "event.approved": "Event approved",
  "event.rejected": "Event rejected",
  "event.cancelled": "Event cancelled",
  "event.completed": "Event completed",
  "event.rescheduled": "Event rescheduled",
  "session.started": "Session started",
  "session.created": "Session started",
  "session.completed": "Session completed",
  "session.ended": "Session completed",
  "qr_attendance.recorded": "QR attendance recorded",
  "manual_attendance.recorded": "Manual attendance recorded",
  "facial_attendance.recorded": "Facial attendance recorded",
  "correction_request.submitted": "Correction request submitted",
  "correction_request.approved": "Correction request approved",
  "correction_request.rejected": "Correction request rejected",
  "user.invited": "User invited",
  "user.updated": "User profile updated",
  "user.role_updated": "User role updated"
};

export function formatAuditAction(action: string | undefined | null): string {
  if (!action) return "System action";
  
  const trimmed = action.trim();
  if (ACTION_EXACT_MAP[trimmed]) {
    return ACTION_EXACT_MAP[trimmed];
  }

  // Split by dot, underscore, dash, or space
  const rawWords = trimmed.split(/[._-\s]+/).filter(Boolean);
  if (rawWords.length === 0) return "System action";

  const processedWords = rawWords.map((word) => {
    const lower = word.toLowerCase();
    if (ACRONYM_MAP[lower]) {
      return ACRONYM_MAP[lower];
    }
    return lower;
  });

  // Sentence case: Capitalize the first word (if not already an acronym)
  const firstWord = processedWords[0];
  const capitalizedFirst = ACRONYM_MAP[rawWords[0].toLowerCase()]
    ? firstWord
    : firstWord.charAt(0).toUpperCase() + firstWord.slice(1);

  return [capitalizedFirst, ...processedWords.slice(1)].join(" ");
}

export function formatTargetType(targetType: string | undefined | null): string {
  if (!targetType) return "System";

  const lower = targetType.toLowerCase();
  if (lower === "qr_credential" || lower === "credential") return "QR Credential";
  if (lower === "facial_profile") return "Facial Credential";
  if (lower === "attendance_session" || lower === "session") return "Attendance Session";
  if (lower === "attendance_record") return "Attendance Record";
  if (lower === "event") return "Event";
  if (lower === "correction_request") return "Correction Request";
  if (lower === "user") return "User";

  return targetType
    .split(/[._-\s]+/)
    .filter(Boolean)
    .map((word) => {
      const wLower = word.toLowerCase();
      if (ACRONYM_MAP[wLower]) return ACRONYM_MAP[wLower];
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export interface AuditTargetLookups {
  students?: Student[];
  events?: Event[];
  sessions?: AttendanceSession[];
  users?: User[];
}

export interface ResolvedTargetInfo {
  name: string;
  badge: string;
}

export function getAuditTargetInfo(log: AuditLog, lookups?: AuditTargetLookups): ResolvedTargetInfo {
  const badge = formatTargetType(log.targetType);
  const metadata = log.metadata ?? {};

  // 1. Check metadata for explicit name/title
  if (typeof metadata.studentName === "string" && metadata.studentName) {
    const studentNumber = typeof metadata.studentNumber === "string" ? ` (${metadata.studentNumber})` : "";
    return { name: `${metadata.studentName}${studentNumber}`, badge };
  }
  if (typeof metadata.eventTitle === "string" && metadata.eventTitle) {
    return { name: metadata.eventTitle, badge };
  }
  if (typeof metadata.sessionTitle === "string" && metadata.sessionTitle) {
    return { name: metadata.sessionTitle, badge };
  }
  if (typeof metadata.userName === "string" && metadata.userName) {
    return { name: metadata.userName, badge };
  }
  if (typeof metadata.targetName === "string" && metadata.targetName) {
    return { name: metadata.targetName, badge };
  }

  // 2. Perform entity lookup using targetId
  const targetId = log.targetId;
  const targetTypeLower = (log.targetType || "").toLowerCase();

  if (targetTypeLower.includes("event") && lookups?.events) {
    const match = lookups.events.find((e) => e.id === targetId);
    if (match) {
      return { name: match.title, badge };
    }
  }

  if ((targetTypeLower.includes("credential") || targetTypeLower.includes("student") || targetTypeLower.includes("facial")) && lookups?.students) {
    const match = lookups.students.find((s) => s.id === targetId || s.userId === targetId);
    if (match) {
      const displayName = match.fullName ?? match.formattedName ?? `Student ${match.studentNumber}`;
      return { name: `${displayName} (${match.studentNumber})`, badge };
    }
  }

  if (targetTypeLower.includes("session") && lookups?.sessions) {
    const match = lookups.sessions.find((s) => s.id === targetId);
    if (match) {
      return { name: match.title, badge };
    }
  }

  if (targetTypeLower.includes("user") && lookups?.users) {
    const match = lookups.users.find((u) => u.id === targetId);
    if (match) {
      return { name: match.displayName, badge };
    }
  }

  // 3. Fallback format (user friendly: avoid showing raw technical IDs like event-1)
  return { name: badge, badge };
}

export interface AuditLogFilters {
  search?: string;
  datePreset?: "all" | "today" | "past_7_days" | "past_30_days" | "custom";
  customStartDate?: string;
  customEndDate?: string;
  actorUserId?: string;
  actionCategory?: "all" | "credentials" | "events" | "attendance" | "correction" | "user";
}

export function filterAuditLogs(logs: AuditLog[], filters: AuditLogFilters, lookups?: AuditTargetLookups): AuditLog[] {
  return logs.filter((log) => {
    // 1. Search term
    if (filters.search) {
      const term = filters.search.toLowerCase();
      const formattedAction = formatAuditAction(log.action).toLowerCase();
      const rawAction = log.action.toLowerCase();
      const targetInfo = getAuditTargetInfo(log, lookups);
      const targetName = targetInfo.name.toLowerCase();
      const targetBadge = targetInfo.badge.toLowerCase();
      const targetId = (log.targetId || "").toLowerCase();
      const metadataStr = JSON.stringify(log.metadata ?? {}).toLowerCase();

      const matches =
        formattedAction.includes(term) ||
        rawAction.includes(term) ||
        targetName.includes(term) ||
        targetBadge.includes(term) ||
        targetId.includes(term) ||
        metadataStr.includes(term);

      if (!matches) return false;
    }

    // 2. Date range filter
    if (filters.datePreset && filters.datePreset !== "all") {
      const logDate = new Date(log.timestamp);
      const now = new Date();

      if (filters.datePreset === "today") {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (logDate < startOfToday) return false;
      } else if (filters.datePreset === "past_7_days") {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (logDate < sevenDaysAgo) return false;
      } else if (filters.datePreset === "past_30_days") {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (logDate < thirtyDaysAgo) return false;
      } else if (filters.datePreset === "custom") {
        if (filters.customStartDate) {
          const start = new Date(filters.customStartDate);
          if (logDate < start) return false;
        }
        if (filters.customEndDate) {
          const end = new Date(filters.customEndDate);
          // Set to end of day
          end.setHours(23, 59, 59, 999);
          if (logDate > end) return false;
        }
      }
    }

    // 3. Actor user filter
    if (filters.actorUserId && filters.actorUserId !== "all") {
      if (log.actorUserId !== filters.actorUserId) return false;
    }

    // 4. Action Category filter
    if (filters.actionCategory && filters.actionCategory !== "all") {
      const actionLower = log.action.toLowerCase();
      if (filters.actionCategory === "credentials" && !actionLower.includes("credential")) return false;
      if (filters.actionCategory === "events" && !actionLower.includes("event")) return false;
      if (filters.actionCategory === "attendance" && !actionLower.includes("session") && !actionLower.includes("attendance")) return false;
      if (filters.actionCategory === "correction" && !actionLower.includes("correction")) return false;
      if (filters.actionCategory === "user" && !actionLower.includes("user")) return false;
    }

    return true;
  });
}
