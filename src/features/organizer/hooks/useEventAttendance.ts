import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDisplayTime } from "@/lib/utils/date";
import type { AttendanceMethod, OrganizerAttendanceRow } from "@/features/organizer/data/organizerUiStore";

type OrgAttendanceStatus = "present" | "late" | "absent";

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
};

type EventParticipantRow = {
  event_id: string;
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
  late_reason_category?: string | null;
  late_reason?: string | null;
  students?: StudentRelationRow | StudentRelationRow[] | null;
};

export type EventAttendanceSummary = {
  rows: OrganizerAttendanceRow[];
  present: number;
  late: number;
  absent: number;
  notCheckedOut: number;
  totalRegistered: number;
  attendanceRate: number; // 0-100
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
  if (eventIds.length === 0) return {};

  // 1. Sessions belonging to these events
  const { data: sessions, error: sessionsError } = await client
    .from("event_sessions")
    .select("id, event_id")
    .in("event_id", eventIds);
  if (sessionsError) throw sessionsError;

  const sessionToEvent = new Map<string, string>();
  ((sessions ?? []) as EventSessionRow[]).forEach((session) => sessionToEvent.set(session.id, session.event_id));
  const sessionIds = Array.from(sessionToEvent.keys());

  // 2. Registered participants per event (denominator for attendance rate)
  const { data: participants, error: participantsError } = await client
    .from("event_participants")
    .select("id, event_id")
    .in("event_id", eventIds);
  if (participantsError) throw participantsError;

  const registeredCountByEvent = new Map<string, number>();
  ((participants ?? []) as EventParticipantRow[]).forEach((participant) => {
    registeredCountByEvent.set(participant.event_id, (registeredCountByEvent.get(participant.event_id) ?? 0) + 1);
  });

  // 3. Attendance records for those sessions, joined to student + profile names
  let records: AttendanceSummaryRow[] = [];
  if (sessionIds.length > 0) {
    const { data, error } = await client
      .from("attendance_records")
      .select(
        "id, event_session_id, student_id, attendance_status, verification_method, time_in, time_out, recorded_at, remarks, late_reason_category, students(profiles(first_name, middle_name, last_name))"
      )
      .in("event_session_id", sessionIds);
    if (error) throw error;
    records = (data ?? []) as AttendanceSummaryRow[];
  }

  const summaries: Record<string, EventAttendanceSummary> = {};
  eventIds.forEach((eventId) => {
    summaries[eventId] = {
      rows: [],
      present: 0,
      late: 0,
      absent: 0,
      notCheckedOut: 0,
      totalRegistered: registeredCountByEvent.get(eventId) ?? 0,
      attendanceRate: 0
    };
  });

  records.forEach((row) => {
    if (!row.event_session_id) return;
    const eventId = sessionToEvent.get(row.event_session_id);
    if (!eventId || !summaries[eventId]) return;
    const status = (row.attendance_status ?? "present") as OrgAttendanceStatus;

    summaries[eventId].rows.push({
      id: String(row.id),
      studentId: String(row.student_id ?? ""),
      studentName: studentDisplayName(row),
      eventCode: eventId,
      attendanceMethod: mapVerificationMethod(row.verification_method),
      checkInTime: row.time_in ? formatDisplayTime(row.time_in) : "-",
      checkOutTime: row.time_out ? formatDisplayTime(row.time_out) : undefined,
      attendanceStatus: status,
      lateReason: status === "late" ? mapLateReason(row.late_reason_category ?? row.late_reason ?? null) : undefined
    });

    if (status === "present") summaries[eventId].present += 1;
    else if (status === "late") summaries[eventId].late += 1;
    else if (status === "absent") summaries[eventId].absent += 1;
    if (status !== "absent" && row.time_in && !row.time_out) summaries[eventId].notCheckedOut += 1;
  });

  Object.values(summaries).forEach((summary) => {
    const denominator = summary.totalRegistered > 0 ? summary.totalRegistered : summary.rows.length;
    summary.attendanceRate = denominator > 0 ? Math.round(((summary.present + summary.late) / denominator) * 1000) / 10 : 0;
  });

  return summaries;
}

export function useAttendanceSummaries(eventIds: string[]) {
  const key = [...eventIds].sort().join(",");
  return useQuery({
    queryKey: ["event-attendance-summaries", key],
    queryFn: () => fetchAttendanceForEvents(eventIds),
    enabled: eventIds.length > 0
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
  if (eventIds.length === 0) return {};

  const client = getSupabaseBrowserClient();
  const summaries: Record<string, EventFeedbackSummary> = {};
  eventIds.forEach((eventId) => {
    summaries[eventId] = emptyFeedbackSummary();
  });

  const { data: feedbackData, error: feedbackError } = await client
    .from("event_feedback")
    .select("id, event_id, comment, sentiment_label")
    .in("event_id", eventIds);
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
  const key = [...eventIds].sort().join(",");
  return useQuery({
    queryKey: ["event-feedback-summaries", key],
    queryFn: () => fetchFeedbackForEvents(eventIds),
    enabled: eventIds.length > 0
  });
}
