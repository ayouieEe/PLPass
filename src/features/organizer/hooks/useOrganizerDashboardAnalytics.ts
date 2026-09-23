import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { dateKey } from "@/lib/utils/date";
import { isPostgresUuid } from "@/lib/utils/postgresUuid";
import { summarizeUniqueAttendance } from "@/features/organizer/utils/attendanceSummary";

export type DashboardAnalytics = {
  attendanceTrend: Array<{ label: string; date: string; present: number; late: number; absent: number; attendanceRate: number }>;
  sentiment: Array<{ name: string; value: number }>;
  lateArrivals: Array<{ label: string; count: number }>;
  lateReasons: Array<{ label: string; count: number; share: number }>;
};

const lateReasonLabels = ["Traffic / Commute", "Class or Academic Conflict", "Personal / Health", "Weather / Force Majeure", "Other"] as const;

function emptyAnalytics(): DashboardAnalytics {
  return {
    attendanceTrend: [],
    sentiment: [{ name: "Positive", value: 0 }, { name: "Neutral", value: 0 }, { name: "Negative", value: 0 }],
    lateArrivals: [],
    lateReasons: lateReasonLabels.map((label) => ({ label, count: 0, share: 0 }))
  };
}

type DashboardEvent = { id: string; code: string; startsAt: string };
export type LiveEventSession = { eventId: string; actualStart: string };

async function fetchDashboardAnalytics(events: DashboardEvent[]): Promise<DashboardAnalytics> {
  // Mock/demo rows use labels such as `event-1`. Those are useful locally but
  // invalid for the UUID event_id column, so never send them to PostgREST.
  const remoteEvents = events.filter((event) => isPostgresUuid(event.id));
  if (!remoteEvents.length) return emptyAnalytics();
  const client = getSupabaseBrowserClient();
  const eventIds = remoteEvents.map((event) => event.id);
  const eventById = new Map(remoteEvents.map((event) => [event.id, event]));
  const { data: sessions, error: sessionsError } = await client
    .from("event_sessions")
    .select("id, event_id, session_status, late_cutoff_at, actual_end")
    .in("event_id", eventIds)
    .eq("session_status", "completed");
  if (sessionsError) throw sessionsError;
  const sessionIds = (sessions ?? []).map((session) => session.id);
  const eventIdBySessionId = new Map((sessions ?? []).map((session) => [session.id, session.event_id]));

  const { data: feedback, error: feedbackError } = await client.from("event_feedback").select("sentiment_label").in("event_id", eventIds);
  if (feedbackError) throw feedbackError;

  const analytics = emptyAnalytics();
  const sentimentByLabel = new Map(analytics.sentiment.map((item) => [item.name.toLowerCase(), item]));
  (feedback ?? []).forEach((item) => {
    const target = item.sentiment_label ? sentimentByLabel.get(item.sentiment_label.toLowerCase()) : undefined;
    if (target) target.value += 1;
  });
  const sentimentTotal = analytics.sentiment.reduce((total, item) => total + item.value, 0);
  if (sentimentTotal) analytics.sentiment.forEach((item) => { item.value = Math.round((item.value / sentimentTotal) * 100); });
  if (!sessionIds.length) return analytics;

  const { data: records, error: recordsError } = await client
    .from("attendance_records")
    .select("event_session_id, student_id, attendance_status, recorded_at, late_reason_category, finalized_at")
    .in("event_session_id", sessionIds)
    .order("recorded_at", { ascending: true });
  if (recordsError) throw recordsError;

  const { data: walkIns, error: walkInsError } = await client
    .from("unverified_walkin_attendance" as never)
    .select("id, event_id, event_session_id, time_in, time_out")
    .in("event_id", eventIds);
  if (walkInsError) throw walkInsError;

  const trendByEvent = new Map<string, { eventId: string; label: string; date: string; present: number; late: number; absent: number; attendanceRate: number }>();
  const identityRowsByEvent = new Map<string, Array<{ identity: string; attendanceStatus: "present" | "late" | "absent" }>>();
  const lateByReason = new Map(analytics.lateReasons.map((item) => [item.label, item]));
  const lateByMonth = new Map<string, { label: string; count: number }>();
  (records ?? []).forEach((record) => {
    const date = new Date(record.recorded_at);
    const eventId = eventIdBySessionId.get(record.event_session_id);
    const event = eventId ? eventById.get(eventId) : undefined;
    if (!event) return;
    const row = trendByEvent.get(event.id) ?? { eventId: event.id, label: event.code, date: dateKey(event.startsAt), present: 0, late: 0, absent: 0, attendanceRate: 0 };
    const identityRows = identityRowsByEvent.get(event.id) ?? [];
    identityRows.push({ identity: String(record.event_session_id) + ":" + String(record.student_id ?? record.recorded_at), attendanceStatus: record.attendance_status === "late" ? "late" : record.attendance_status === "absent" ? "absent" : "present" });
    identityRowsByEvent.set(event.id, identityRows);
    if (record.attendance_status === "late") {
      row.late += 1;
      const lateReason = record.late_reason_category ? lateByReason.get(record.late_reason_category) : undefined;
      if (lateReason) lateReason.count += 1;
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      const month = lateByMonth.get(monthKey) ?? { label: new Intl.DateTimeFormat("en", { month: "short" }).format(date), count: 0 };
      month.count += 1;
      lateByMonth.set(monthKey, month);
    } else if (record.attendance_status === "absent") row.absent += 1;
    else row.present += 1;
    trendByEvent.set(event.id, row);
  });
  for (const walkIn of (walkIns ?? []) as unknown as Array<{ id: string; event_id: string; event_session_id: string; time_in: string; time_out: string | null }>) {
    const event = eventById.get(walkIn.event_id);
    if (!event) continue;
    const session = (sessions ?? []).find((item) => item.id === walkIn.event_session_id) as { session_status?: string; late_cutoff_at?: string | null } | undefined;
    const status = session?.session_status === "completed" && !walkIn.time_out
      ? "absent" as const
      : session?.late_cutoff_at && new Date(walkIn.time_in).getTime() > new Date(session.late_cutoff_at).getTime()
        ? "late" as const
        : "present" as const;
    const row = trendByEvent.get(event.id) ?? { eventId: event.id, label: event.code, date: dateKey(event.startsAt), present: 0, late: 0, absent: 0, attendanceRate: 0 };
    const identityRows = identityRowsByEvent.get(event.id) ?? [];
    identityRows.push({ identity: `walkin:${walkIn.id}`, attendanceStatus: status });
    identityRowsByEvent.set(event.id, identityRows);
    trendByEvent.set(event.id, row);
  }
  analytics.attendanceTrend = Array.from(trendByEvent.values())
    .map(({ eventId, ...row }) => {
      const summary = summarizeUniqueAttendance(identityRowsByEvent.get(eventId) ?? [], 0);
      return { ...row, present: summary.present, late: summary.late, absent: summary.absent, attendanceRate: summary.attendanceRate };
    })
    .sort((first, second) => first.date.localeCompare(second.date))
    .slice(-8);
  analytics.lateArrivals = Array.from(lateByMonth.values()).slice(-6);
  const totalLate = analytics.lateReasons.reduce((total, item) => total + item.count, 0);
  if (totalLate) analytics.lateReasons.forEach((item) => { item.share = Math.round((item.count / totalLate) * 100); });
  return analytics;
}

export function useOrganizerDashboardAnalytics(events: DashboardEvent[]) {
  const remoteEvents = events.filter((event) => isPostgresUuid(event.id));
  const idsKey = remoteEvents.map((event) => event.id).sort().join(",");
  return useQuery({ queryKey: ["organizer-dashboard-analytics", idsKey], queryFn: () => fetchDashboardAnalytics(remoteEvents), enabled: remoteEvents.length > 0 });
}

export function useOrganizerLiveEventSessions() {
  return useQuery({
    queryKey: ["organizer-dashboard-live-sessions"],
    queryFn: async (): Promise<LiveEventSession[]> => {
      const client = getSupabaseBrowserClient();
      const { data, error } = await client
        .from("event_sessions")
        .select("event_id, actual_start")
        .eq("session_status", "ongoing");
      if (error) throw error;
      return (data ?? []).flatMap((session) =>
        typeof session.event_id === "string" && typeof session.actual_start === "string"
          ? [{ eventId: session.event_id, actualStart: session.actual_start }]
          : []
      );
    }
  });
}
