import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDisplayTime } from "@/lib/utils/date";
import type { AttendanceMethod, OrganizerAttendanceRow } from "@/features/organizer/data/organizerUiStore";

type OrgAttendanceStatus = "present" | "late" | "absent" | "excused";

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
  participant_status: string | null;
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
  remarks?: string | null;
  students?: StudentRelationRow | StudentRelationRow[] | null;
};

type EventFeedbackRow = {
  event_id: string;
  comment: string | null;
  sentiment_label: string | null;
  event_feedback_ratings?: Array<{
    objective_id: string;
    rating: number;
  }> | null;
};

export type EventFeedbackSummary = {
  objectiveRatings: Record<string, { average: number; responses: number }>;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  comments: string[];
};

export type EventAttendanceSummary = {
  rows: OrganizerAttendanceRow[];
  present: number;
  late: number;
  absent: number;
  totalRegistered: number;
  attendanceRate: number; // 0-100
  feedback: EventFeedbackSummary;
};

function mapVerificationMethod(value: string | null): AttendanceMethod {
  if (value === "qr") return "QR Code";
  if (value === "facial") return "Facial Recognition";
  return "Manual";
}

export function resolveEventAttendanceCode(eventCodeById: Record<string, string>, eventId: string): string {
  return eventCodeById[eventId] ?? eventId;
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

async function fetchAttendanceForEvents(eventIds: string[], eventCodeById: Record<string, string>): Promise<Record<string, EventAttendanceSummary>> {
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
    .select("id, event_id, participant_status")
    .in("event_id", eventIds);
  if (participantsError) throw participantsError;

  const registeredCountByEvent = new Map<string, number>();
  ((participants ?? []) as EventParticipantRow[]).forEach((participant) => {
    if (participant.participant_status === "removed") return;
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

  const { data: feedbackRows, error: feedbackError } = await client
    .from("event_feedback")
    .select("event_id, comment, sentiment_label, event_feedback_ratings(objective_id, rating)")
    .in("event_id", eventIds);
  if (feedbackError) throw feedbackError;

  const summaries: Record<string, EventAttendanceSummary> = {};
  eventIds.forEach((eventId) => {
    summaries[eventId] = {
      rows: [],
      present: 0,
      late: 0,
      absent: 0,
      totalRegistered: registeredCountByEvent.get(eventId) ?? 0,
      attendanceRate: 0,
      feedback: {
        objectiveRatings: {},
        sentiment: { positive: 0, neutral: 0, negative: 0 },
        comments: []
      }
    };
  });

  const latestRecordByStudent = new Map<string, AttendanceSummaryRow>();
  records.forEach((row) => {
    const eventId = row.event_session_id ? sessionToEvent.get(row.event_session_id) : undefined;
    if (!eventId || !row.student_id) return;
    const key = `${eventId}:${row.student_id}`;
    const existing = latestRecordByStudent.get(key);
    if (!existing || (row.recorded_at ?? "") > (existing.recorded_at ?? "")) {
      latestRecordByStudent.set(key, row);
    }
  });

  latestRecordByStudent.forEach((row) => {
    if (!row.event_session_id) return;
    const eventId = sessionToEvent.get(row.event_session_id);
    if (!eventId || !summaries[eventId]) return;
    const status = (row.attendance_status ?? "present") as OrgAttendanceStatus;

    summaries[eventId].rows.push({
      id: String(row.id),
      studentId: String(row.student_id ?? ""),
      studentName: studentDisplayName(row),
      eventCode: resolveEventAttendanceCode(eventCodeById, eventId),
      attendanceMethod: mapVerificationMethod(row.verification_method),
      checkInTime: row.time_in ? formatDisplayTime(row.time_in) : formatDisplayTime(row.recorded_at ?? ""),
      checkOutTime: row.time_out ? formatDisplayTime(row.time_out) : undefined,
      attendanceStatus: status === "excused" ? "present" : status,
      lateReason: status === "late" ? mapLateReason(row.late_reason_category ?? row.late_reason ?? null) : undefined
    });

    if (status === "present" || status === "excused") summaries[eventId].present += 1;
    else if (status === "late") summaries[eventId].late += 1;
    else if (status === "absent") summaries[eventId].absent += 1;
  });

  ((feedbackRows ?? []) as EventFeedbackRow[]).forEach((feedback) => {
    const summary = summaries[feedback.event_id];
    if (!summary) return;

    if (feedback.comment?.trim()) summary.feedback.comments.push(feedback.comment.trim());
    if (feedback.sentiment_label === "positive" || feedback.sentiment_label === "neutral" || feedback.sentiment_label === "negative") {
      summary.feedback.sentiment[feedback.sentiment_label] += 1;
    }

    for (const rating of feedback.event_feedback_ratings ?? []) {
      const current = summary.feedback.objectiveRatings[rating.objective_id] ?? { average: 0, responses: 0 };
      const total = current.average * current.responses + rating.rating;
      summary.feedback.objectiveRatings[rating.objective_id] = {
        average: Math.round((total / (current.responses + 1)) * 10) / 10,
        responses: current.responses + 1
      };
    }
  });

  Object.values(summaries).forEach((summary) => {
    const sentimentTotal = Object.values(summary.feedback.sentiment).reduce((sum, value) => sum + value, 0);
    if (sentimentTotal > 0) {
      summary.feedback.sentiment = {
        positive: Math.round((summary.feedback.sentiment.positive / sentimentTotal) * 100),
        neutral: Math.round((summary.feedback.sentiment.neutral / sentimentTotal) * 100),
        negative: Math.round((summary.feedback.sentiment.negative / sentimentTotal) * 100)
      };
    }
  });

  Object.values(summaries).forEach((summary) => {
    const denominator = summary.totalRegistered > 0 ? summary.totalRegistered : summary.rows.length;
    summary.absent = Math.max(summary.absent, denominator - summary.present - summary.late, 0);
    summary.attendanceRate = denominator > 0 ? Math.round(((summary.present + summary.late) / denominator) * 1000) / 10 : 0;
  });

  return summaries;
}

export type EventObjectiveSummary = { id: string; text: string };

async function fetchEventObjectivesForEvents(eventIds: string[]): Promise<Record<string, EventObjectiveSummary[]>> {
  if (eventIds.length === 0) return {};
  const client = getSupabaseBrowserClient();
  const { data, error } = await client
    .from("event_objectives")
    .select("id, event_id, objective_text, objective_order")
    .in("event_id", eventIds)
    .order("objective_order", { ascending: true });
  if (error) throw error;

  return (data ?? []).reduce<Record<string, EventObjectiveSummary[]>>((result, row) => {
    const eventId = String(row.event_id ?? "");
    const id = String(row.id ?? "");
    const text = String(row.objective_text ?? "").trim();
    if (eventId && id && text) result[eventId] = [...(result[eventId] ?? []), { id, text }];
    return result;
  }, {});
}

export function useAttendanceSummaries(eventIds: string[], eventCodeById: Record<string, string> = {}) {
  const key = [...eventIds].sort().map((eventId) => `${eventId}:${eventCodeById[eventId] ?? ""}`).join(",");
  return useQuery({
    queryKey: ["event-attendance-summaries", key],
    queryFn: () => fetchAttendanceForEvents(eventIds, eventCodeById),
    enabled: eventIds.length > 0
  });
}

export function useEventObjectivesForEvents(eventIds: string[]) {
  const key = [...eventIds].sort().join(",");
  return useQuery({
    queryKey: ["event-objectives-for-events", key],
    queryFn: () => fetchEventObjectivesForEvents(eventIds),
    enabled: eventIds.length > 0
  });
}
