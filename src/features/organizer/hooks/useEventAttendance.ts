import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AttendanceMethod, OrganizerAttendanceRow } from "@/features/organizer/data/organizerUiStore";

type OrgAttendanceStatus = "present" | "late" | "absent";

export type EventAttendanceSummary = {
  rows: OrganizerAttendanceRow[];
  present: number;
  late: number;
  absent: number;
  totalRegistered: number;
  attendanceRate: number; // 0-100
};

function mapVerificationMethod(value: string | null): AttendanceMethod {
  if (value === "qr") return "QR Code";
  if (value === "facial") return "Facial Recognition";
  return "Manual";
}

function studentDisplayName(row: any): string {
  const profile = row?.students?.profiles;
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
  (sessions ?? []).forEach((s: any) => sessionToEvent.set(s.id, s.event_id));
  const sessionIds = Array.from(sessionToEvent.keys());

  // 2. Registered participants per event (denominator for attendance rate)
  const { data: participants, error: participantsError } = await client
    .from("event_participants")
    .select("id, event_id")
    .in("event_id", eventIds);
  if (participantsError) throw participantsError;

  const registeredCountByEvent = new Map<string, number>();
  (participants ?? []).forEach((p: any) => {
    registeredCountByEvent.set(p.event_id, (registeredCountByEvent.get(p.event_id) ?? 0) + 1);
  });

  // 3. Attendance records for those sessions, joined to student + profile names
  let records: any[] = [];
  if (sessionIds.length > 0) {
    const { data, error } = await client
      .from("attendance_records")
      .select(
        "id, event_session_id, student_id, attendance_status, verification_method, time_in, recorded_at, remarks, late_reason_category, students(profiles(first_name, middle_name, last_name))"
      )
      .in("event_session_id", sessionIds);
    if (error) throw error;
    records = data ?? [];
  }

  const summaries: Record<string, EventAttendanceSummary> = {};
  eventIds.forEach((eventId) => {
    summaries[eventId] = {
      rows: [],
      present: 0,
      late: 0,
      absent: 0,
      totalRegistered: registeredCountByEvent.get(eventId) ?? 0,
      attendanceRate: 0
    };
  });

  records.forEach((row: any) => {
    const eventId = sessionToEvent.get(row.event_session_id);
    if (!eventId || !summaries[eventId]) return;
    const status = (row.attendance_status ?? "present") as OrgAttendanceStatus;

    summaries[eventId].rows.push({
      id: String(row.id),
      studentId: String(row.student_id ?? ""),
      studentName: studentDisplayName(row),
      eventCode: eventId,
      attendanceMethod: mapVerificationMethod(row.verification_method),
      checkInTime: row.time_in ?? row.recorded_at ?? "",
      attendanceStatus: status,
      lateReason: status === "late" ? mapLateReason(row.late_reason_category ?? row.late_reason) : undefined
    });

    if (status === "present") summaries[eventId].present += 1;
    else if (status === "late") summaries[eventId].late += 1;
    else if (status === "absent") summaries[eventId].absent += 1;
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