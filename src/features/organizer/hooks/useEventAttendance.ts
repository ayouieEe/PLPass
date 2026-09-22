import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDisplayTime } from "@/lib/utils/date";
import { postgresUuidValues } from "@/lib/utils/postgresUuid";
import type { AttendanceMethod, OrganizerAttendanceRow } from "@/features/organizer/data/organizerUiStore";

type OrgAttendanceStatus = "present" | "late" | "absent" | "pending";

type ProfileNameRow = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
};

type StudentRelationRow = {
  profiles?: ProfileNameRow | ProfileNameRow[] | null;
};

type EventSessionRow = {
  id: string;
  event_id: string;
  session_status?: string | null;
  actual_end?: string | null;
};

type EventParticipantRow = {
  student_id: string;
  event_id: string;
  participant_status?: string | null;
};

type AttendanceSummaryRow = {
  id: string;
  event_session_id: string | null;
  student_id: string | null;
  attendance_status: string | null;
  verification_method: string | null;
  time_in: string | null;
  time_out: string | null;
  recorded_at: string | null;
  finalized_at?: string | null;
  late_reason_category?: string | null;
  late_reason?: string | null;
  students?: StudentRelationRow | StudentRelationRow[] | null;
};

export type EventAttendanceSummary = {
  rows: Array<Omit<OrganizerAttendanceRow, "attendanceStatus"> & { attendanceStatus: OrgAttendanceStatus }>;
  present: number;
  late: number;
  absent: number;
  pending: number;
  notCheckedOut: number;
  totalRegistered: number;
  attendanceRate: number; // 0-100
};

type FeedbackTaskRow = {
  attendance_record_id: string;
  task_status: "pending" | "completed" | "expired";
  due_at: string;
};

export type ObjectiveFeedbackSummary = {
  averageRating: number | null;
  responseCount: number;
};

export type EventFeedbackSummary = {
  feedbackCount: number;
  sentiment: { positive: number; neutral: number; negative: number };
  feedbackComments: string[];
  objectiveResults: Record<string, ObjectiveFeedbackSummary>;
};

type EventFeedbackRow = {
  id: string;
  event_id: string;
  comment: string | null;
  sentiment_label: string | null;
};

type EventFeedbackRatingRow = {
  feedback_id: string;
  objective_id: string;
  rating: number | null;
};

function mapVerificationMethod(value: string | null): AttendanceMethod {
  if (value === "qr") return "QR Code";
  if (value === "facial") return "Facial Recognition";
  return "Manual";
}

function studentDisplayName(row: AttendanceSummaryRow): string {
  const student = Array.isArray(row.students) ? row.students[0] : row.students;
  const profile = Array.isArray(student?.profiles) ? student?.profiles[0] : student?.profiles;
  if (profile) {
    const parts = [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  return row?.student_id ? `Student ${String(row.student_id).slice(0, 8)}` : "Unknown Student";
}

function mapLateReason(value: string | null): OrganizerAttendanceRow["lateReason"] {
  const KNOWN_LATE_REASONS = [
    "Traffic / Commute",
    "Class or Academic Conflict",
    "Personal / Health",
    "Weather / Force Majeure",
    "Other"
  ] as const;
  if (value && (KNOWN_LATE_REASONS as readonly string[]).includes(value)) {
    return value as OrganizerAttendanceRow["lateReason"];
  }
  return undefined;
}

async function fetchAttendanceForEvents(eventIds: string[]): Promise<Record<string, EventAttendanceSummary>> {
  const client = getSupabaseBrowserClient();
  const remoteEventIds = postgresUuidValues(eventIds);
  if (remoteEventIds.length === 0) return {};

  // 1. Sessions belonging to these events
  const { data: sessions, error: sessionsError } = await client
    .from("event_sessions")
    .select("id, event_id, session_status, actual_end")
    .in("event_id", remoteEventIds);
  if (sessionsError) throw sessionsError;

  const sessionToEvent = new Map<string, string>();
  ((sessions ?? []) as EventSessionRow[]).forEach((session) => sessionToEvent.set(session.id, session.event_id));
  const sessionIds = Array.from(sessionToEvent.keys());

  // 2. Registered participants per event (also the source of Pending rows)
  const { data: participants, error: participantsError } = await client
    .from("event_participants")
    .select("id, event_id, student_id, participant_status")
    .in("event_id", remoteEventIds);
  if (participantsError) throw participantsError;

  const participantRows = ((participants ?? []) as EventParticipantRow[]).filter((participant) => participant.participant_status !== "removed");
  const registeredCountByEvent = new Map<string, number>();
  participantRows.forEach((participant) => {
    registeredCountByEvent.set(participant.event_id, (registeredCountByEvent.get(participant.event_id) ?? 0) + 1);
  });

  const studentIds = [...new Set(participantRows.map((participant) => participant.student_id).filter(Boolean))];
  const { data: studentRows, error: studentsError } = studentIds.length === 0
    ? { data: [], error: null }
    : await client.from("students").select("id, student_id, profiles(first_name, middle_name, last_name, name_extension)").in("id", studentIds);
  if (studentsError) throw studentsError;
  const studentById = new Map<string, { studentNumber: string; name: string }>();
  for (const row of (studentRows ?? []) as Array<{ id: string; student_id?: string | null; profiles?: ProfileNameRow | ProfileNameRow[] | null }>) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const name = [profile?.first_name, profile?.middle_name, profile?.last_name].filter(Boolean).join(" ");
    studentById.set(String(row.id), { studentNumber: String(row.student_id ?? ""), name: name || `Student ${String(row.id).slice(0, 8)}` });
  }

  // 3. Attendance records for those sessions, joined to student + profile names
  let records: AttendanceSummaryRow[] = [];
  if (sessionIds.length > 0) {
    const { data, error } = await client
      .from("attendance_records")
      .select(
        "id, event_session_id, student_id, attendance_status, verification_method, time_in, time_out, recorded_at, finalized_at, remarks, late_reason_category, students(profiles(first_name, middle_name, last_name))"
      )
      .in("event_session_id", sessionIds);
    if (error) throw error;
    records = (data ?? []) as AttendanceSummaryRow[];
  }

  const recordIds = records.map((record) => String(record.id)).filter(Boolean);
  const { data: feedbackTaskRows, error: feedbackTaskError } = recordIds.length === 0
    ? { data: [], error: null }
    : await client.from("event_feedback_tasks").select("attendance_record_id, task_status, due_at").in("attendance_record_id", recordIds);
  if (feedbackTaskError) throw feedbackTaskError;
  const feedbackTaskByRecordId = new Map<string, FeedbackTaskRow>();
  for (const task of (feedbackTaskRows ?? []) as FeedbackTaskRow[]) {
    feedbackTaskByRecordId.set(String(task.attendance_record_id), task);
  }

  const summaries: Record<string, EventAttendanceSummary> = {};
  remoteEventIds.forEach((eventId) => {
      summaries[eventId] = {
        rows: [],
        present: 0,
        late: 0,
        absent: 0,
        pending: 0,
        notCheckedOut: 0,
      totalRegistered: registeredCountByEvent.get(eventId) ?? 0,
      attendanceRate: 0
    };
  });

  const recordByEventAndStudent = new Map<string, AttendanceSummaryRow>();
  records.forEach((row) => {
    if (!row.event_session_id || !row.student_id) return;
    const eventId = sessionToEvent.get(row.event_session_id);
    if (!eventId) return;
    const key = `${eventId}:${row.student_id}`;
    const previous = recordByEventAndStudent.get(key);
    if (!previous || new Date(row.recorded_at ?? 0).getTime() >= new Date(previous.recorded_at ?? 0).getTime()) {
      recordByEventAndStudent.set(key, row);
    }
  });

  participantRows.forEach((participant) => {
    const eventId = participant.event_id;
    const summary = summaries[eventId];
    if (!summary) return;
    const row = recordByEventAndStudent.get(`${eventId}:${participant.student_id}`);
    const student = studentById.get(participant.student_id);
    const sessionRow = row?.event_session_id ? (sessions as EventSessionRow[]).find((session) => session.id === row.event_session_id) : undefined;
    const feedbackTask = row ? feedbackTaskByRecordId.get(String(row.id)) : undefined;
    const deadline = feedbackTask?.due_at
      ? new Date(feedbackTask.due_at).getTime()
      : sessionRow?.actual_end
        ? new Date(sessionRow.actual_end).getTime() + 24 * 60 * 60 * 1000
        : Number.POSITIVE_INFINITY;
    const isFinal = Boolean(row?.finalized_at);
    const status: OrgAttendanceStatus = isFinal
      ? ((row?.attendance_status ?? "absent") as OrgAttendanceStatus)
      : (feedbackTask?.task_status === "expired" || Date.now() >= deadline ? "absent" : "pending");
    const method = row ? mapVerificationMethod(row.verification_method) : "Manual";
    summary.rows.push({
      id: String(row?.id ?? `pending-${eventId}-${participant.student_id}`),
      studentId: participant.student_id,
      studentName: student?.name ?? (row ? studentDisplayName(row) : `Student ${participant.student_id.slice(0, 8)}`),
      eventCode: eventId,
      attendanceMethod: method,
      checkInTime: row?.time_in ? formatDisplayTime(row.time_in) : "-",
      checkOutTime: row?.time_out ? formatDisplayTime(row.time_out) : undefined,
      attendanceStatus: status,
      lateReason: status === "late" ? mapLateReason(row?.late_reason_category ?? row?.late_reason ?? null) : undefined
    });

    if (status === "present") summary.present += 1;
    else if (status === "late") summary.late += 1;
    else if (status === "absent") summary.absent += 1;
    else summary.pending += 1;
    if (status === "pending" && row?.time_in && !row.time_out) summary.notCheckedOut += 1;
  });

  Object.values(summaries).forEach((summary) => {
    const denominator = summary.totalRegistered > 0 ? summary.totalRegistered : summary.rows.length;
    summary.attendanceRate = denominator > 0 ? Math.round(((summary.present + summary.late) / denominator) * 1000) / 10 : 0;
  });

  return summaries;
}

export function useAttendanceSummaries(eventIds: string[]) {
  const remoteEventIds = postgresUuidValues(eventIds);
  const key = [...remoteEventIds].sort().join(",");
  return useQuery({
    queryKey: ["event-attendance-summaries", key],
    queryFn: () => fetchAttendanceForEvents(remoteEventIds),
    enabled: remoteEventIds.length > 0
  });
}

function emptyFeedbackSummary(): EventFeedbackSummary {
  return {
    feedbackCount: 0,
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    feedbackComments: [],
    objectiveResults: {}
  };
}

async function fetchFeedbackForEvents(eventIds: string[]): Promise<Record<string, EventFeedbackSummary>> {
  const remoteEventIds = postgresUuidValues(eventIds);
  if (remoteEventIds.length === 0) return {};

  const client = getSupabaseBrowserClient();
  const summaries: Record<string, EventFeedbackSummary> = {};
  remoteEventIds.forEach((eventId) => {
    summaries[eventId] = emptyFeedbackSummary();
  });

  const { data: feedbackData, error: feedbackError } = await client
    .from("event_feedback")
    .select("id, event_id, comment, sentiment_label")
    .in("event_id", remoteEventIds);
  if (feedbackError) throw feedbackError;

  const feedbackRows = (feedbackData ?? []) as EventFeedbackRow[];
  const eventIdByFeedbackId = new Map<string, string>();
  const sentimentCounts: Record<string, { positive: number; neutral: number; negative: number }> = {};

  feedbackRows.forEach((feedback) => {
    const summary = summaries[feedback.event_id];
    if (!summary) return;

    summary.feedbackCount += 1;
    eventIdByFeedbackId.set(feedback.id, feedback.event_id);
    const comment = feedback.comment?.trim();
    if (comment) summary.feedbackComments.push(comment);

    const label = feedback.sentiment_label?.trim().toLowerCase();
    if (label === "positive" || label === "neutral" || label === "negative") {
      const counts = sentimentCounts[feedback.event_id] ?? { positive: 0, neutral: 0, negative: 0 };
      counts[label] += 1;
      sentimentCounts[feedback.event_id] = counts;
    }
  });

  Object.entries(sentimentCounts).forEach(([eventId, counts]) => {
    const total = counts.positive + counts.neutral + counts.negative;
    if (!total || !summaries[eventId]) return;
    summaries[eventId].sentiment = {
      positive: Math.round((counts.positive / total) * 100),
      neutral: Math.round((counts.neutral / total) * 100),
      negative: Math.round((counts.negative / total) * 100)
    };
  });

  const feedbackIds = [...eventIdByFeedbackId.keys()];
  if (feedbackIds.length === 0) return summaries;

  const { data: ratingsData, error: ratingsError } = await client
    .from("event_feedback_ratings")
    .select("feedback_id, objective_id, rating")
    .in("feedback_id", feedbackIds);
  if (ratingsError) throw ratingsError;

  const ratingsByEventAndObjective = new Map<string, number[]>();
  ((ratingsData ?? []) as EventFeedbackRatingRow[]).forEach((rating) => {
    const eventId = eventIdByFeedbackId.get(rating.feedback_id);
    if (!eventId || !Number.isFinite(rating.rating)) return;
    const key = `${eventId}:${rating.objective_id}`;
    const ratings = ratingsByEventAndObjective.get(key) ?? [];
    ratings.push(Number(rating.rating));
    ratingsByEventAndObjective.set(key, ratings);
  });

  ratingsByEventAndObjective.forEach((ratings, key) => {
    const separator = key.indexOf(":");
    const eventId = key.slice(0, separator);
    const objectiveId = key.slice(separator + 1);
    const summary = summaries[eventId];
    if (!summary) return;
    summary.objectiveResults[objectiveId] = {
      averageRating: Math.round((ratings.reduce((total, rating) => total + rating, 0) / ratings.length) * 10) / 10,
      responseCount: ratings.length
    };
  });

  return summaries;
}

export function useEventFeedbackSummaries(eventIds: string[]) {
  const remoteEventIds = postgresUuidValues(eventIds);
  const key = [...remoteEventIds].sort().join(",");
  return useQuery({
    queryKey: ["event-feedback-summaries", key],
    queryFn: () => fetchFeedbackForEvents(remoteEventIds),
    enabled: remoteEventIds.length > 0
  });
}
