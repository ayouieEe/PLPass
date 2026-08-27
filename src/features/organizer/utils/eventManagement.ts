import type { OrganizerEvent } from "@/features/organizer/data/organizerUiStore";
import type { PriorityLevel } from "@/types/enums";

export type AttendanceStatus = "present" | "late" | "absent";
export type ManualAttendanceStatus = Extract<AttendanceStatus, "present" | "late">;
export type LateReason = "Traffic / Commute" | "Class or Academic Conflict" | "Personal / Health" | "Weather / Force Majeure" | "Other";

export type EventRecord = {
  id?: string;
  code: string;
  name: string;
  category: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  predictedTurnout: string;
  objectives: string[];
  description?: string;
  status?: OrganizerEvent["status"];
  priorityLevel: PriorityLevel;
  impactScore: number | null;
};

const dashboardActiveSessionEventCode = "EVT-2026-004";

function parseDateTime(date: string, time: string) {
  const ampmMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]) % 12;
    if (ampmMatch[3].toUpperCase() === "PM") hours += 12;
    return new Date(`${date}T${hours.toString().padStart(2, "0")}:${ampmMatch[2]}:00`);
  }
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isTodayEvent(event: EventRecord) {
  if (event.code === dashboardActiveSessionEventCode) return true;
  const today = new Date();
  const eventDate = new Date(`${event.date}T00:00:00`);
  return [today.getFullYear(), today.getMonth(), today.getDate()].join("-") === [eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()].join("-");
}

function isPastDate(dateString: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${dateString}T00:00:00`) < today;
}

function hasAttendanceSession(eventId: string | undefined, eventDate: string, sessions: Array<{ eventId?: string; date?: string }>) {
  return Boolean(eventId && sessions.some((session) => session.eventId === eventId && session.date === eventDate));
}

export function hasValidEventSchedule(event: Pick<EventRecord, "date" | "startTime" | "endTime">) {
  if (!event.date || !event.startTime || !event.endTime) return false;
  const start = parseDateTime(event.date, event.startTime);
  const end = parseDateTime(event.date, event.endTime);
  return Boolean(start && end && end.getTime() > start.getTime());
}

export function shouldDisplayInEventTab(
  event: EventRecord,
  tab: "today" | "incoming",
  options: {
    activeEventCode?: string;
    cancelledCodes: string[];
    completedCodes: Set<string>;
    sessionsList: Array<{ eventId?: string; date?: string }>;
  }
) {
  if (options.activeEventCode === event.code || options.cancelledCodes.includes(event.code) || options.completedCodes.has(event.code) || !hasValidEventSchedule(event)) return false;
  if (tab === "today") return event.status === "today" || isTodayEvent(event);
  if (isPastDate(event.date) && !hasAttendanceSession(event.id, event.date, options.sessionsList)) return false;
  return event.status === "incoming" || !isTodayEvent(event);
}

function normalizeStudentLookup(value: string) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveStudentLookupId(input: string, students: Array<{ id: string; studentNumber?: string; fullName?: string }>) {
  const query = normalizeStudentLookup(input);
  if (!query) return null;
  return students.find((student) => [student.id, student.studentNumber ?? "", student.fullName ?? ""].some((value) => normalizeStudentLookup(value) === query))?.id ?? null;
}

export function resolveManualAttendanceLookup(input: string, students: Array<{ id: string; studentNumber?: string; fullName?: string }>) {
  if (!input.trim()) return { isValid: false, matchedStudentId: null };
  const matchedStudentId = resolveStudentLookupId(input, students);
  return { isValid: matchedStudentId !== null, matchedStudentId };
}

export function resolveLateStudentManualState({ manualInput, students, activeRows }: {
  manualInput: string;
  students: Array<{ id: string; studentNumber?: string; fullName?: string }>;
  activeRows: Array<{ studentId: string; attendanceStatus: AttendanceStatus; lateReason?: string }>;
}) {
  const query = manualInput.trim();
  const matchedStudentId = query ? resolveStudentLookupId(query, students) : null;
  const matchedRecord = query ? activeRows.find((row) => row.studentId === (matchedStudentId ?? query)) : undefined;
  if (!matchedRecord || matchedRecord.attendanceStatus !== "late") {
    return { isLateLocked: false as const, lockedStatus: "present" as const, lockedLateReason: "" as const, matchedStudentId };
  }
  return {
    isLateLocked: true as const,
    lockedStatus: "late" as const,
    lockedLateReason: (matchedRecord.lateReason as LateReason | undefined) ?? "",
    matchedStudentId
  };
}
