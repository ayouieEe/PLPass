import { useMemo } from "react";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useStudents } from "@/hooks/useRepositoryQueries";
import { compareDateValues, formatDisplayDate, formatDisplayTime, toValidDate } from "@/lib/utils/date";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type { AttendanceRecord, AttendanceSession, Event, Student, StudentCredentialStatus } from "@/types/domain";
import type { AttendanceStatus, CorrectionRequestStatus } from "@/types/enums";

export type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  studentName: string;
  isLoading: boolean;
  isError: boolean;
};

export type StudentEventRecord = {
  id: string;
  eventId: string;
  eventCode: string;
  eventName: string;
  category: string;
  venue: string;
  startsAt: string;
  endsAt?: string;
  status: AttendanceStatus | "correction-pending";
  method: "QR" | "Facial" | "Manual" | "Online";
  recordedAt: string;
  lateReasonCategory?: string;
  lateReason?: string;
  lateReasonSubmittedAt?: string;
  feedbackSubmitted?: boolean;
  finalized?: boolean;
  timeIn?: string;
  timeOut?: string;
};


export type StudentEventState =
  | "Session Not Started"
  | "Waiting for Time In"
  | "Time In Recorded"
  | "Late Reason Required"
  | "Pending Time Out"
  | "Attendance Completed"
  | "Feedback Available"
  | "Feedback Submitted"
  | "Absent"
  | "Correction Pending"
  | "Correction Approved"
  | "Correction Rejected";

export type StudentEventWorkflow = {
  state: StudentEventState;
  stateTone: ReturnType<typeof statusTone>;
  nextActionLabel: string;
  nextActionTone: "primary" | "outline";
  nextActionHref?: string;
  nextActionDisabled?: boolean;
  nextActionDescription: string;
  timeInLabel: string;
  timeOutLabel: string;
  feedbackLabel: string;
  attendanceLabel: string;
  canSubmitFeedback: boolean;
  requiresLateReason: boolean;
  requiresCorrection: boolean;
  timeline: { label: string; status: "done" | "current" | "locked" }[];
};

export type StudentRequestKind = "attendance_correction" | "authentication_issue";

export function useStudentScope(): StudentScope {
  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
  const studentQuery = useStudents({ pageSize: 1 }, context);

  return {
    context: context ?? { actorUserId: "", actorRole: "student" },
    student: studentQuery.data?.items[0],
    studentName: session?.displayName ?? "Student",
    isLoading: studentQuery.isLoading,
    isError: studentQuery.isError
  };
}

export type StudentIdentityReadiness = {
  qrCredentialId: string;
  qrStatus: string;
  qrExpiry: string | null;
  faceEnrolled: boolean;
  faceEnrolledDate: string | null;
  faceStatus: string;
};

export function ensureStudentIdentityReadiness(credentials?: StudentCredentialStatus): StudentIdentityReadiness {
  const facialStatus = credentials?.facialProfile?.status ?? "not_configured";
  return {
    qrCredentialId: credentials?.qrCredential?.id ?? "",
    qrStatus: credentials?.qrCredential?.status ?? "not_configured",
    qrExpiry: credentials?.qrCredential?.expiresAt ?? null,
    faceEnrolled: facialStatus === "active" || facialStatus === "activated",
    faceEnrolledDate: credentials?.facialProfile?.enrolledAt ?? null,
    faceStatus: facialStatus
  };
}

export function hasUsableQrCredential(readiness: StudentIdentityReadiness) {
  const status = readiness.qrStatus.toLowerCase();
  if (!readiness.qrCredentialId) return false;
  if (status !== "activated" && status !== "active") return false;
  if (readiness.qrExpiry && new Date(readiness.qrExpiry).getTime() <= Date.now()) return false;
  return true;
}

export function formatCredentialStatus(value: string | undefined) {
  const normalized = value?.replace(/_/g, " ").trim();
  return normalized?.toLowerCase() === "active" || normalized?.toLowerCase() === "activated" ? "Active" : "Pending";
}

export function emptyStudentIdentityReadiness(): StudentIdentityReadiness {
  return {
    qrCredentialId: "",
    qrStatus: "not_configured",
    qrExpiry: null,
    faceEnrolled: false,
    faceEnrolledDate: null,
    faceStatus: "not_configured"
  };
}

export const correctionRequestTypeLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent"
};

export type CorrectionRequestType = Extract<AttendanceStatus, "present" | "late">;

export function getCorrectionRequestTypes(status: StudentEventRecord["status"]): CorrectionRequestType[] {
  if (status === "late") return ["present"];
  if (status === "absent") return ["present", "late"];
  return [];
}

export function statusTone(status: AttendanceStatus | "correction-pending" | Event["status"]) {
  if (status === "present" || status === "approved" || status === "completed") return "success" as const;
  if (status === "late" || status === "pending" || status === "correction-pending") return "warning" as const;
  if (status === "absent" || status === "rejected" || status === "cancelled") return "danger" as const;
  return "muted" as const;
}

export function studentStateTone(status: StudentEventState) {
  if (status === "Attendance Completed" || status === "Feedback Submitted" || status === "Correction Approved") return "success" as const;
  if (status === "Absent" || status === "Correction Rejected") return "danger" as const;
  if (status === "Session Not Started") return "muted" as const;
  return "warning" as const;
}

export function formatEventSchedule(event: Event) {
  return `${formatDisplayDate(event.startsAt)} ${formatDisplayTime(event.startsAt)} - ${formatDisplayTime(event.endsAt)}`;
}

export function countdownLabel(value: string | undefined) {
  const date = toValidDate(value);
  if (!date) return "Schedule pending";
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "Started";
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} left`;
  const hours = Math.max(1, Math.ceil(diff / 3_600_000));
  return `${hours} hour${hours === 1 ? "" : "s"} left`;
}

export function hasEventResource(event: Event) {
  return Boolean(getEventResource(event).url);
}

export function eventResourceLabel(event: Event) {
  return getEventResource(event).label;
}

function normalizeResourceUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return undefined;
}

function extractFirstUrl(value: string | undefined) {
  const match = value?.match(/https?:\/\/[^\s)]+|www\.[^\s)]+/i);
  return normalizeResourceUrl(match?.[0]);
}

export function getEventResource(event: Event) {
  const resourceUrl = normalizeResourceUrl((event as Event & { resourceUrl?: string }).resourceUrl) ?? extractFirstUrl(event.description);
  if (resourceUrl) {
    return {
      label: `${event.code} resource link`,
      description: "Organizer provided a resource link for this event.",
      url: resourceUrl
    };
  }

  return {
    label: "No attachment",
    description: event.description ? "Event notes are available, but no downloadable resource link was attached." : "Organizer has not attached a resource.",
    url: undefined
  };
}

export function sortEventsByDate(events: Event[]) {
  return [...events].sort((first, second) => compareDateValues(first.startsAt, second.startsAt));
}

export function studentVisibleEvents(events: Event[]) {
  const visible = events.filter((event) => event.status === "approved" || event.status === "completed");
  return sortEventsByDate(visible);
}

export function studentAttendanceMethodLabel(method: AttendanceRecord["verificationMethod"]): StudentEventRecord["method"] {
  if (method === "qr") return "QR";
  if (method === "facial") return "Facial";
  if (method === "online") return "Online";
  return "Manual";
}

export function recordsForStudentEvents(input: {
  studentId: string;
  records: AttendanceRecord[];
  sessions: AttendanceSession[];
  events: Event[];
}) {
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  const sessionById = new Map(input.sessions.map((session) => [session.id, session]));
  const repositoryRecords = input.records
    .filter((record) => record.studentId === input.studentId)
    .flatMap((record): StudentEventRecord[] => {
      const session = sessionById.get(record.sessionId);
      const event = session?.eventId ? eventById.get(session.eventId) : undefined;
      if (!session || !event) return [];
      return [{
        id: record.id,
        eventId: event.id,
        eventCode: event.code,
        eventName: event.title,
        category: event.category,
        venue: event.venue,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        status: record.status,
        method: studentAttendanceMethodLabel(record.verificationMethod),
        recordedAt: record.recordedAt,
        lateReasonCategory: record.lateReasonCategory,
        lateReason: record.lateReason ?? record.lateReasonCategory ?? (record.note?.startsWith("Late reason:") ? record.note.replace("Late reason:", "").trim() : undefined),
        lateReasonSubmittedAt: record.lateReasonSubmittedAt,
        feedbackSubmitted: false,
        finalized: Boolean(record.finalizedAt),
        timeIn: record.timeIn,
        timeOut: record.checkedOutAt
      }];
    });
  return repositoryRecords;
}

export function getStudentRecordDate(record: StudentEventRecord) {
  return toValidDate(record.startsAt) ?? toValidDate(record.recordedAt) ?? toValidDate(record.endsAt);
}

export function sortStudentEventRecords(records: StudentEventRecord[]) {
  return [...records].sort((first, second) => {
    const firstSortTime = getStudentRecordDate(first)?.getTime() ?? 0;
    const secondSortTime = getStudentRecordDate(second)?.getTime() ?? 0;
    return secondSortTime - firstSortTime;
  });
}

export function mergeStudentEventRecords(records: StudentEventRecord[]) {
  const uniqueRecords = records.filter((record, index, list) => (
    list.findIndex((entry) => entry.eventId === record.eventId) === index
  ));
  return sortStudentEventRecords(uniqueRecords);
}

export function getStudentEventRecords(input: {
  studentId: string;
  records: AttendanceRecord[];
  sessions: AttendanceSession[];
  events: Event[];
}) {
  const repositoryRecords = recordsForStudentEvents(input);
  return mergeStudentEventRecords(repositoryRecords);
}

export function getStudentEventMetrics(records: StudentEventRecord[]) {
  const finalized = records.filter((record) => record.finalized === true);
  const presentCount = finalized.filter((record) => record.status === "present").length;
  const lateCount = finalized.filter((record) => record.status === "late").length;
  const absentCount = finalized.filter((record) => record.status === "absent").length;
  const attendedCount = presentCount + lateCount;
  const attendanceRate = finalized.length ? Math.round((attendedCount / finalized.length) * 100) : 0;
  const attendedRecords = finalized.filter((record) => record.status === "present" || record.status === "late");
  const feedbackDue = attendedRecords.filter((record) => !record.feedbackSubmitted).length;

  return {
    totalCount: finalized.length,
    presentCount,
    lateCount,
    absentCount,
    attendedCount,
    attendedRecords,
    attendanceRate,
    feedbackDue
  };
}


export function eventFromStudentRecord(record: StudentEventRecord): Event {
  return {
    id: record.eventId,
    code: record.eventCode,
    organizerId: "attendance-record",
    category: record.category,
    title: record.eventName,
    venue: record.venue,
    startsAt: record.startsAt,
    endsAt: record.endsAt ?? record.startsAt,
    status: "completed",
    priorityLevel: "Flexible",
    impactScore: null,
    predictedTurnout: null
  };
}

export function buildStudentEventWorkflow(input: {
  event: Event;
  session?: AttendanceSession;
  record?: StudentEventRecord;
  feedbackSubmitted?: boolean;
  correctionStatus?: CorrectionRequestStatus;
}) {
  const { event, session, record, feedbackSubmitted, correctionStatus } = input;
  const now = Date.now();
  const startsAt = toValidDate(event.startsAt)?.getTime() ?? now;
  const endsAt = toValidDate(event.endsAt)?.getTime() ?? startsAt;
  const sessionStatus = session?.status;
  const hasTimeIn = Boolean(record?.timeIn);
  const isLate = Boolean(record?.timeIn && session?.lateCutoffAt && new Date(record.timeIn).getTime() > new Date(session.lateCutoffAt).getTime());
  const sessionCompleted = event.status === "completed" || sessionStatus === "completed" || now > endsAt;
  const hasTimeOut = Boolean(record?.timeOut);
  const isAbsent = Boolean(record?.finalized && record.status === "absent") || (!record && sessionCompleted);
  const hasSubmittedLateReason = Boolean(record?.lateReasonSubmittedAt && record.timeOut
    && new Date(record.lateReasonSubmittedAt).getTime() > new Date(record.timeOut).getTime());
  const requiresLateReason = Boolean(isLate && hasTimeIn && hasTimeOut && !hasSubmittedLateReason && !feedbackSubmitted && !isAbsent);

  let state: StudentEventState;
  if (correctionStatus === "pending") state = "Correction Pending";
  else if (correctionStatus === "approved") state = "Correction Approved";
  else if (correctionStatus === "rejected") state = "Correction Rejected";
  else if (isAbsent) state = "Absent";
  else if (feedbackSubmitted && hasTimeOut) state = "Feedback Submitted";
  else if (requiresLateReason) state = "Late Reason Required";
  else if (hasTimeOut) state = "Feedback Available";
  else if (hasTimeIn) state = sessionCompleted ? "Attendance Completed" : "Pending Time Out";
  else if (now < startsAt || sessionStatus === "draft") state = "Session Not Started";
  else state = "Waiting for Time In";

  const canSubmitFeedback = state === "Feedback Available";
  const requiresCorrection = state === "Correction Rejected";
  const nextAction = (() => {
    if (state === "Late Reason Required") return ["Submit Late Reason", "Submit your reason after Time Out and before event feedback."] as const;
    if (state === "Feedback Available") return ["Answer Feedback", "Required before attendance is marked complete."] as const;
    if (state === "Absent") return ["Request Correction", "Ask the organizer to review the attendance result."] as const;
    if (state === "Pending Time Out") return ["Contact Organizer", "Time Out must be recorded before feedback can be completed."] as const;
    if (state === "Correction Rejected") return ["File Correction", "Review the decision and submit a clearer request if needed."] as const;
    if (state === "Waiting for Time In") return ["Show QR", "Show your QR to the organizer. The organizer records Time In."] as const;
    if (state === "Feedback Submitted") return ["Attendance Completed", "Your feedback is submitted and attendance is complete."] as const;
    return ["View Event", "Review details, objectives, and resources."] as const;
  })();

  const timelineLabels = [
    "Published",
    "Session Started",
    "Time In Recorded",
    "Time Out Recorded",
    "Late Reason Required",
    "Feedback Available",
    "Feedback Submitted",
    "Completed"
  ];
  const done = new Set<string>(["Published"]);
  if (now >= startsAt || sessionStatus === "active" || sessionCompleted) done.add("Session Started");
  if (hasTimeIn) done.add("Time In Recorded");
  if (hasTimeOut) done.add("Time Out Recorded");
  if (hasSubmittedLateReason && isLate) done.add("Late Reason Required");
  if (hasTimeOut && !requiresLateReason) done.add("Feedback Available");
  if (feedbackSubmitted) {
    done.add("Feedback Submitted");
    done.add("Completed");
  }
  const current = state === "Session Not Started"
    ? "Published"
    : state === "Waiting for Time In"
      ? "Session Started"
      : state === "Late Reason Required"
        ? "Late Reason Required"
        : state === "Pending Time Out"
          ? "Time In Recorded"
          : state === "Feedback Available"
            ? "Feedback Available"
            : state === "Feedback Submitted"
              ? "Completed"
              : undefined;

  return {
    state,
    stateTone: studentStateTone(state),
    nextActionLabel: nextAction[0],
    nextActionTone: state === "Session Not Started" || state === "Feedback Submitted" ? "outline" : "primary",
    nextActionDescription: nextAction[1],
    timeInLabel: hasTimeIn && record?.timeIn ? formatDisplayTime(record.timeIn) : "Not recorded",
    timeOutLabel: hasTimeOut && record?.timeOut ? formatDisplayTime(record.timeOut) : "Not recorded",
    feedbackLabel: feedbackSubmitted ? "Submitted" : canSubmitFeedback ? "Required" : "Locked",
    attendanceLabel: isAbsent ? "Absent" : feedbackSubmitted && hasTimeOut ? "Complete" : hasTimeOut ? "Feedback required" : hasTimeIn ? "Time In only" : "Not recorded",
    canSubmitFeedback,
    requiresLateReason,
    requiresCorrection,
    timeline: timelineLabels.map((label) => ({
      label,
      status: done.has(label) ? "done" : label === current ? "current" : "locked"
    }))
  } satisfies StudentEventWorkflow;
}
