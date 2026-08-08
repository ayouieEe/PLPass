import { useMemo } from "react";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useStudents } from "@/hooks/useRepositoryQueries";
import { compareDateValues, formatDisplayDate, formatDisplayTime, isFutureOrNowDate, toValidDate } from "@/lib/utils/date";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type { AttendanceRecord, AttendanceSession, CorrectionRequest, Event, Student } from "@/types/domain";
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
  method: "QR" | "Facial";
  recordedAt: string;
  lateReason?: string;
  feedbackSubmitted?: boolean;
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
  | "Excuse Submitted"
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
  requiresExcuse: boolean;
  requiresCorrection: boolean;
  timeline: { label: string; status: "done" | "current" | "locked" }[];
};

export type StudentRequestKind = "attendance_correction" | "authentication_issue" | "face_reenrollment";

export type StudentSupportRequest = {
  id: string;
  studentId: string;
  kind: Exclude<StudentRequestKind, "attendance_correction">;
  title: string;
  description: string;
  status: CorrectionRequestStatus;
  submittedAt: string;
};

export const lateReasonOptions = [
  "Traffic / Commute",
  "Class or Academic Conflict",
  "Personal / Health",
  "Weather / Force Majeure",
  "Other"
] as const;

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

export function studentStorageKey(studentId: string, suffix: string) {
  return `plpass-student-${studentId}-${suffix}`;
}

export function isDemoStudent(student?: Pick<Student, "id">) {
  void student;
  return false;
}

export function loadStudentEventRecords(studentId: string): StudentEventRecord[] {
  try {
    const raw = localStorage.getItem(studentStorageKey(studentId, "event-records"));
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

export function saveStudentEventRecords(studentId: string, records: StudentEventRecord[]) {
  try {
    localStorage.setItem(studentStorageKey(studentId, "event-records"), JSON.stringify(records));
  } catch {
    // ignore
  }
}

export function upsertStudentEventRecord(studentId: string, record: StudentEventRecord) {
  const current = loadStudentEventRecords(studentId);
  const updated = current.filter((item) => item.id !== record.id && item.eventId !== record.eventId);
  updated.push(record);
  saveStudentEventRecords(studentId, updated);
}

export function markStudentFeedbackSubmitted(studentId: string, eventId: string) {
  try {
    const submitted = new Set<string>(JSON.parse(localStorage.getItem(studentStorageKey(studentId, "feedback-submitted")) || "[]"));
    submitted.add(eventId);
    localStorage.setItem(studentStorageKey(studentId, "feedback-submitted"), JSON.stringify(Array.from(submitted)));
  } catch {
    // ignore
  }
}

export function isFeedbackSubmitted(studentId: string, eventId: string) {
  try {
    const submitted: string[] = JSON.parse(localStorage.getItem(studentStorageKey(studentId, "feedback-submitted")) || "[]");
    return submitted.includes(eventId);
  } catch {
    return false;
  }
}

export function qrUidForStudent(student?: Student) {
  const identifier = student?.studentNumber ?? "STUDENT";
  return `PLPASS-QR-${identifier}`;
}

export type StudentIdentityReadiness = {
  qrCode: string;
  qrExpiry: string | null;
  faceEnrolled: boolean;
  faceEnrolledDate: string | null;
};

export function ensureStudentIdentityReadiness(student?: Student): StudentIdentityReadiness {
  const fallback = {
    qrCode: "",
    qrExpiry: null,
    faceEnrolled: false,
    faceEnrolledDate: null
  } satisfies StudentIdentityReadiness;

  if (!student) return fallback;

  const defaultQr = qrUidForStudent(student);

  return {
    qrCode: defaultQr,
    qrExpiry: null,
    faceEnrolled: false,
    faceEnrolledDate: null
  };
}

export const correctionRequestTypeLabels: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused"
};

export type CorrectionRequestType = Extract<AttendanceStatus, "present" | "late" | "excused">;

export function getCorrectionRequestTypes(status: StudentEventRecord["status"]): CorrectionRequestType[] {
  if (status === "late") return ["present", "excused"];
  if (status === "absent") return ["present", "late", "excused"];
  return [];
}

export function isStudentDemoRecord(record: Pick<StudentEventRecord, "id">) {
  void record;
  return false;
}

export function loadStudentCorrectionRequests(studentId: string): CorrectionRequest[] {
  void studentId;
  return [];
}

export function createStudentCorrectionRequest(
  studentId: string,
  input: Pick<CorrectionRequest, "attendanceRecordId" | "eventId" | "requestedStatus" | "reason">
) {
  void studentId;
  void input;
  throw new Error("Correction requests must be submitted through Supabase.");
}

export function loadStudentSupportRequests(studentId: string): StudentSupportRequest[] {
  try {
    const raw = localStorage.getItem(studentStorageKey(studentId, "support-requests"));
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

export function createStudentSupportRequest(
  studentId: string,
  input: Pick<StudentSupportRequest, "kind" | "title" | "description">
) {
  if (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") {
    const list = loadStudentSupportRequests(studentId);
    const newReq: StudentSupportRequest = {
      id: `req-${Date.now()}`,
      studentId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      status: "pending",
      submittedAt: new Date().toISOString()
    };
    const updated = [newReq, ...list];
    try {
      localStorage.setItem(studentStorageKey(studentId, "support-requests"), JSON.stringify(updated));
    } catch {
      // ignore
    }
    return newReq;
  }
  throw new Error("Support requests need a Supabase-backed table before they can be submitted.");
}

export function getEventObjectives(event: Event) {
  const objectiveMap: Record<string, string[]> = {
    "EVT-2026-001": [
      "Connect students with industry partners for potential career and internship opportunities",
      "Improve student awareness of current industry hiring standards",
      "Gather student interest data for PLP's placement program"
    ],
    "EVT-2026-002": [
      "Demonstrate essential professional skills and domain expertise",
      "Improve student confidence in practical work scenarios"
    ],
    "EVT-2026-003": [
      "Orient new students on university programs and campus membership benefits",
      "Present the academic year's event calendar"
    ],
    "EVT-2026-004": [
      "Simulate real campus leadership and administrative scenarios",
      "Assess student resolution of operational challenges",
      "Evaluate practical workshop exercises"
    ],
    "EVT-2026-005": [
      "Introduce sustainable campus practices and community initiatives",
      "Encourage student-led sustainability projects across PLP"
    ],
    "EVT-2026-006": [
      "Showcase student innovation, talent, and technical competency",
      "Foster healthy academic competition among all PLP departments"
    ]
  };
  if (objectiveMap[event.code]) {
    return objectiveMap[event.code];
  }
  const category = event.category.toLowerCase();
  if (category.includes("leadership")) {
    return ["Apply leadership values in student activities", "Collaborate with peers during event tasks", "Reflect on campus leadership responsibilities"];
  }
  if (category.includes("orientation")) {
    return ["Understand campus policies and event expectations", "Identify available student support services", "Prepare for participation in college activities"];
  }
  if (category.includes("forum")) {
    return ["Connect event themes to academic practice", "Evaluate speaker insights and examples", "Participate in informed discussion"];
  }
  return ["Understand the event purpose", "Participate in the scheduled activity", "Reflect on the learning outcome"];
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
  return event.id.charCodeAt(event.id.length - 1) % 2 === 1;
}

export function eventResourceLabel(event: Event) {
  return hasEventResource(event) ? `${event.code} resource pack` : "No attachment";
}

export function sortEventsByDate(events: Event[]) {
  return [...events].sort((first, second) => compareDateValues(first.startsAt, second.startsAt));
}

export function studentVisibleEvents(events: Event[]) {
  const visible = events.filter((event) => event.status !== "cancelled" && (event.status === "approved" || event.status === "completed" || isFutureOrNowDate(event.startsAt)));
  return sortEventsByDate(visible);
}

function pdfStudentDemoRecords(studentId: string): StudentEventRecord[] {
  void studentId;
  return [];
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
        method: record.verificationMethod === "qr" ? "QR" : "Facial",
        recordedAt: record.recordedAt,
        lateReason: record.note?.startsWith("Late reason:") ? record.note.replace("Late reason:", "").trim() : undefined,
        feedbackSubmitted: record.note?.includes("Feedback submitted") ?? false
      }];
    });
  void pdfStudentDemoRecords;
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
  const localRecords = loadStudentEventRecords(input.studentId);
  const repositoryAndDemoRecords = recordsForStudentEvents(input);
  return mergeStudentEventRecords([...localRecords, ...repositoryAndDemoRecords]);
}

export function getStudentEventMetrics(records: StudentEventRecord[], studentId: string) {
  const presentCount = records.filter((record) => record.status === "present").length;
  const lateCount = records.filter((record) => record.status === "late").length;
  const absentCount = records.filter((record) => record.status === "absent").length;
  const excusedCount = records.filter((record) => record.status === "excused").length;
  const attendedCount = presentCount + lateCount;
  const attendanceRate = records.length ? Math.round((attendedCount / records.length) * 100) : 0;
  const attendedRecords = records.filter((record) => record.status === "present" || record.status === "late");
  const feedbackDue = attendedRecords.filter((record) => !record.feedbackSubmitted && !isFeedbackSubmitted(studentId, record.eventId)).length;

  return {
    totalCount: records.length,
    presentCount,
    lateCount,
    absentCount,
    excusedCount,
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
    organizerId: "student-record",
    category: record.category,
    title: record.eventName,
    venue: record.venue,
    startsAt: record.startsAt,
    endsAt: record.endsAt ?? record.startsAt,
    status: "completed"
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
  const hasTimeIn = Boolean(record && record.status !== "absent");
  const isLate = record?.status === "late";
  const requiresLateReason = Boolean(isLate && !record?.lateReason);
  const sessionCompleted = event.status === "completed" || sessionStatus === "completed" || now > endsAt;
  const hasTimeOut = Boolean(hasTimeIn && sessionCompleted && !requiresLateReason);
  const isAbsent = record?.status === "absent" || (!record && sessionCompleted);

  let state: StudentEventState;
  if (correctionStatus === "pending") state = "Correction Pending";
  else if (correctionStatus === "approved") state = record?.status === "absent" ? "Excuse Submitted" : "Correction Approved";
  else if (correctionStatus === "rejected") state = "Correction Rejected";
  else if (isAbsent) state = "Absent";
  else if (feedbackSubmitted && hasTimeOut) state = "Feedback Submitted";
  else if (hasTimeOut) state = "Feedback Available";
  else if (requiresLateReason) state = "Late Reason Required";
  else if (hasTimeIn) state = sessionCompleted ? "Attendance Completed" : "Pending Time Out";
  else if (now < startsAt || sessionStatus === "draft") state = "Session Not Started";
  else state = "Waiting for Time In";

  const canSubmitFeedback = state === "Feedback Available";
  const requiresExcuse = state === "Absent";
  const requiresCorrection = state === "Pending Time Out" || state === "Correction Rejected";
  const nextAction = (() => {
    if (state === "Late Reason Required") return ["Submit Late Reason", "Record the reason before feedback unlocks."] as const;
    if (state === "Feedback Available") return ["Answer Event Feedback", "Required before attendance is marked complete."] as const;
    if (state === "Absent") return ["Submit Excuse", "File an excuse request for organizer review."] as const;
    if (state === "Pending Time Out") return ["File Correction", "Time Out is missing. Ask the organizer to review the record."] as const;
    if (state === "Correction Rejected") return ["File Correction", "Review the decision and submit a clearer request if needed."] as const;
    if (state === "Waiting for Time In") return ["Present QR UID", "Show your QR UID to the organizer. The organizer records Time In."] as const;
    if (state === "Feedback Submitted") return ["Attendance Completed", "Your feedback is submitted and attendance is complete."] as const;
    return ["View Event", "Review details, objectives, and resources."] as const;
  })();

  const timelineLabels = [
    "Published",
    "Session Started",
    "Time In Recorded",
    "Late Reason Required",
    "Time Out Recorded",
    "Feedback Available",
    "Feedback Submitted",
    "Completed"
  ];
  const done = new Set<string>(["Published"]);
  if (now >= startsAt || sessionStatus === "active" || sessionCompleted) done.add("Session Started");
  if (hasTimeIn) done.add("Time In Recorded");
  if (isLate && record?.lateReason) done.add("Late Reason Required");
  if (hasTimeOut) done.add("Time Out Recorded");
  if (hasTimeOut) done.add("Feedback Available");
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
    timeInLabel: hasTimeIn && record ? formatDisplayTime(record.recordedAt) : "Not recorded",
    timeOutLabel: hasTimeOut ? formatDisplayTime(event.endsAt) : "Not recorded",
    feedbackLabel: feedbackSubmitted ? "Submitted" : canSubmitFeedback ? "Required" : "Locked",
    attendanceLabel: isAbsent ? "Absent" : feedbackSubmitted && hasTimeOut ? "Complete" : hasTimeOut ? "Feedback required" : hasTimeIn ? "Time In only" : "Not recorded",
    canSubmitFeedback,
    requiresLateReason,
    requiresExcuse,
    requiresCorrection,
    timeline: timelineLabels.map((label) => ({
      label,
      status: done.has(label) ? "done" : label === current ? "current" : "locked"
    }))
  } satisfies StudentEventWorkflow;
}
