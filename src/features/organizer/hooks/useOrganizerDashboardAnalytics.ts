import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

async function fetchDashboardAnalytics(events: DashboardEvent[]): Promise<DashboardAnalytics> {
  if (!events.length) return emptyAnalytics();
  const client = getSupabaseBrowserClient();
  const eventIds = events.map((event) => event.id);
  const eventById = new Map(events.map((event) => [event.id, event]));
  const { data: sessions, error: sessionsError } = await client.from("event_sessions").select("id, event_id").in("event_id", eventIds);
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
    .select("event_session_id, attendance_status, recorded_at, late_reason_category")
    .in("event_session_id", sessionIds)
    .order("recorded_at", { ascending: true });
  if (recordsError) throw recordsError;

  const trendByEvent = new Map<string, { label: string; date: string; present: number; late: number; absent: number; attendanceRate: number }>();
  const lateByReason = new Map(analytics.lateReasons.map((item) => [item.label, item]));
  const lateByMonth = new Map<string, { label: string; count: number }>();
  (records ?? []).forEach((record) => {
    const date = new Date(record.recorded_at);
    const eventId = eventIdBySessionId.get(record.event_session_id);
    const event = eventId ? eventById.get(eventId) : undefined;
    if (!event) return;
    const row = trendByEvent.get(event.id) ?? { label: event.code, date: event.startsAt.slice(0, 10), present: 0, late: 0, absent: 0, attendanceRate: 0 };
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
  analytics.attendanceTrend = Array.from(trendByEvent.values())
    .map((row) => ({ ...row, attendanceRate: row.present + row.late + row.absent ? Math.round(((row.present + row.late) / (row.present + row.late + row.absent)) * 100) : 0 }))
    .sort((first, second) => first.date.localeCompare(second.date))
    .slice(-8);
  analytics.lateArrivals = Array.from(lateByMonth.values()).slice(-6);
  const totalLate = analytics.lateReasons.reduce((total, item) => total + item.count, 0);
  if (totalLate) analytics.lateReasons.forEach((item) => { item.share = Math.round((item.count / totalLate) * 100); });
  return analytics;
}

export function useOrganizerDashboardAnalytics(events: DashboardEvent[]) {
  const idsKey = events.map((event) => event.id).sort().join(",");
  return useQuery({ queryKey: ["organizer-dashboard-analytics", idsKey], queryFn: () => fetchDashboardAnalytics(events), enabled: events.length > 0 });
}
