import { useMemo, type ReactNode } from "react";
import { CalendarCheck, Clock3, type LucideIcon, TrendingUp, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAcademicCatalog, useEvents, useStudents } from "@/hooks/useRepositoryQueries";
import { useOrganizerDashboardAnalytics, useOrganizerLiveEventSessions } from "@/features/organizer/hooks/useOrganizerDashboardAnalytics";
import type { Event } from "@/types/domain";

function shortCode(eventCode: string) {
  return eventCode.replace("EVT-2026-", "EVT-");
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const fmt = (iso: string) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return `${fmt(startsAt)} – ${fmt(endsAt)}`;
}

function isSameDay(iso: string, reference: Date) {
  const date = new Date(iso);
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate();
}

function DashboardMetricCard({ title, value, detail, icon: Icon, tone = "default", compact = false }: { title: string; value: string; detail: string; icon: LucideIcon; tone?: "default" | "warning" | "success"; compact?: boolean }) {
  const toneClass = tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-primary/15 bg-primary/5 text-primary";
  return (
    <article className={`rounded-lg border bg-surface shadow-sm transition-shadow hover:shadow-md ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className={`${compact ? "mt-2 text-2xl" : "mt-2.5 text-3xl"} font-semibold leading-none text-foreground`}>{value}</p>
        </div>
        <span className={`grid ${compact ? "h-8 w-8" : "h-9 w-9"} shrink-0 place-items-center rounded-md border ${toneClass}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      </div>
      <p className={`${compact ? "mt-2 text-xs leading-4" : "mt-3 text-sm leading-5"} line-clamp-2 text-muted-foreground`}>{detail}</p>
    </article>
  );
}

function ChartPanel({ title, description, summary, children, empty, emptyMessage, className = "" }: { title: string; description: string; summary?: string; children: ReactNode; empty?: boolean; emptyMessage?: string; className?: string }) {
  return (
    <section className={`rounded-lg border bg-surface p-4 shadow-sm ${className}`}>
      <div className="min-w-0"><h2 className="text-sm font-semibold text-foreground">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
      {summary && !empty ? <p className="sr-only" data-chart-summary>{summary}</p> : null}
      <div className="mt-3 h-52 sm:h-56" aria-hidden={summary && !empty ? "true" : undefined}>{empty ? <div className="grid h-full place-items-center rounded-md border border-dashed bg-background px-6 text-center text-sm text-muted-foreground">{emptyMessage}</div> : children}</div>
    </section>
  );
}

function EventDetail({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 border-l border-border pl-3 first:border-l-0 first:pl-0"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold text-foreground" title={value}>{value}</p><p className="mt-0.5 truncate text-xs text-muted-foreground" title={detail}>{detail}</p></div>;
}

export function OrganizerDashboardPage() {
  const { session } = useDevelopmentSession();
  const context = useMemo(() => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined), [session]);
  const eventsQuery = useEvents({ pageSize: 100 }, context);
  const liveSessionsQuery = useOrganizerLiveEventSessions();
  const { semesters: semestersQuery } = useAcademicCatalog({ pageSize: 100 }, context);
  const studentsQuery = useStudents({ pageSize: 1 }, context);
  const events = useMemo(() => eventsQuery.data?.items ?? [], [eventsQuery.data?.items]);
  const analyticsQuery = useOrganizerDashboardAnalytics(events.map(({ id, code, startsAt }) => ({ id, code, startsAt })));
  const today = useMemo(() => new Date(), []);
  const activeEvents = useMemo(() => events.filter((event) => event.status !== "rejected" && event.status !== "cancelled"), [events]);
  const todaysEvents = useMemo(() => activeEvents.filter((event) => isSameDay(event.startsAt, today)), [activeEvents, today]);
  const activeEvent: Event | undefined = todaysEvents[0];
  const liveEventIds = useMemo(
    () => new Set((liveSessionsQuery.data ?? []).filter((session) => isSameDay(session.actualStart, today)).map((session) => session.eventId)),
    [liveSessionsQuery.data, today]
  );
  const liveEvents = useMemo(
    () => events.filter((event) => liveEventIds.has(event.id) && event.status !== "completed" && event.status !== "cancelled"),
    [events, liveEventIds]
  );
  const liveEvent = liveEvents[0];
  const highlightedEvent = liveEvent ?? activeEvent;
  const nextEvent = useMemo(() => activeEvents.filter((event) => new Date(event.startsAt).getTime() > today.getTime()).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0], [activeEvents, today]);
  const predictionOverviewData = useMemo(() => activeEvents.map((event) => ({ label: shortCode(event.code), title: event.title, predictedAttend: event.predictedTurnout ?? 0, predictedMiss: 100 - (event.predictedTurnout ?? 0) })), [activeEvents]);
  const activeSemester = semestersQuery.data?.items.find((semester) => semester.isActive);
  const trend = analyticsQuery.data?.attendanceTrend ?? [];
  const totalPresent = trend.reduce((total, row) => total + row.present, 0);
  const totalLate = trend.reduce((total, row) => total + row.late, 0);
  const averageRate = Math.round(trend.reduce((total, row) => total + row.attendanceRate, 0) / Math.max(trend.length, 1));

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader title="Dashboard" description="Live sessions, turnout forecasts, and event scheduling at a glance." actions={<><Button asChild size="sm" variant="outline"><NavLink to={APP_ROUTES.organizerEvents}>View Events</NavLink></Button><Button asChild size="sm"><NavLink to={APP_ROUTES.organizerCreateEvent}>Create Event</NavLink></Button></>} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard title="Total Events" value={activeEvents.length.toLocaleString()} detail={activeSemester ? `Published events for ${activeSemester.label}, ${activeSemester.schoolYear}.` : "Published events in the current data set."} icon={CalendarCheck} />
        <DashboardMetricCard title="Active Today" value={liveEvents.length.toLocaleString()} detail={liveEvent ? `${liveEvent.code}: ${liveEvent.title}` : "No live session right now."} icon={Clock3} tone="success" />
        <DashboardMetricCard title="Registered Students" value={(studentsQuery.data?.total ?? 0).toLocaleString()} detail="Total students enrolled in the system." icon={Users} />
        <DashboardMetricCard title="Next Event Turnout" value={nextEvent?.predictedTurnout != null ? `${nextEvent.predictedTurnout}%` : "N/A"} detail={nextEvent ? `${nextEvent.code}: ${nextEvent.title}` : "No upcoming event scheduled."} icon={TrendingUp} tone="success" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-lg border bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{liveEvent ? "Live Event" : "Today’s Event"}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{liveEvent ? "Active attendance session." : "Current schedule and readiness overview."}</p>
            </div>
            <div className="flex items-center gap-3">
              {liveEvent ? <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Live now</span> : null}
              <Button asChild size="sm" variant="outline">
                <NavLink to={`${APP_ROUTES.organizerEvents}?tab=today`}>{liveEvent ? "View live event" : "View today’s events"}</NavLink>
              </Button>
            </div>
          </div>
          {highlightedEvent ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2"><EventDetail label="Event" value={highlightedEvent.code} detail={highlightedEvent.title} /><EventDetail label="Venue" value={highlightedEvent.venue} detail={highlightedEvent.category} /><EventDetail label="Schedule" value={formatDate(highlightedEvent.startsAt)} detail={formatTimeRange(highlightedEvent.startsAt, highlightedEvent.endsAt)} /><EventDetail label="Turnout" value={highlightedEvent.predictedTurnout != null ? `${highlightedEvent.predictedTurnout}%` : "N/A"} detail="Predicted attendance" /></div> : <div className="mt-4 rounded-md border border-dashed bg-background px-3 py-4 text-sm text-muted-foreground">There is no event scheduled for today yet.</div>}
          
        </section>
        <div>
          <div className="sr-only" data-chart-summary>
            <p>{`Prediction chart data: ${predictionOverviewData.map((item) => `${item.title}, ${item.predictedAttend}% predicted attendance and ${item.predictedMiss}% predicted non-attendance`).join("; ")}.`}</p>
            <p>{`Attendance trend chart data: ${trend.map((item) => `${item.label}, ${item.attendanceRate}% attendance`).join("; ")}.`}</p>
            <p>{`Feedback sentiment chart data: ${(analyticsQuery.data?.sentiment ?? []).map((item) => `${item.name}, ${item.value}%`).join("; ")}.`}</p>
            <p>{`Late-arrival chart data: ${(analyticsQuery.data?.lateArrivals ?? []).map((item) => `${item.label}, ${item.count} late check-ins`).join("; ")}.`}</p>
          </div>
          <ChartPanel title="Prediction Overview" description="Attendance forecast by event."><div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 items-center gap-5 pb-2 text-xs"><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-green-600" />Predicted Attendance</span><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-600" />Predicted Non-attendance</span></div><div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden" tabIndex={0} role="region" aria-label="Prediction overview chart"><div className="h-full" style={{ minWidth: `${Math.max(640, predictionOverviewData.length * 64)}px` }}><ResponsiveContainer width="100%" height="100%"><BarChart data={predictionOverviewData} margin={{ top: 4, right: 12, left: -16, bottom: 16 }} barCategoryGap="22%"><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" interval={0} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis unit="%" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? "Event"} formatter={(value: number) => `${value}%`} /><Bar dataKey="predictedAttend" name="Predicted Attendance" stackId="prediction" fill="#16a34a" radius={[3, 3, 0, 0]} /><Bar dataKey="predictedMiss" name="Predicted Non-attendance" stackId="prediction" fill="#dc2626" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div></div></ChartPanel>
        </div>
      </section>

      {analyticsQuery.isError ? <section className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-muted-foreground">Analytics could not be loaded. Refresh the page to try again.</section> : analyticsQuery.isLoading ? <section className="rounded-lg border bg-surface p-4 text-sm text-muted-foreground">Loading attendance analytics…</section> : <>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15.5rem]">
          <ChartPanel title="Attendance Trends" description="Attendance rate per completed event session." empty={!trend.length} emptyMessage="Attendance trends will appear after event sessions are completed."><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} /><YAxis unit="%" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number) => [`${value}%`, "Attendance rate"]} labelFormatter={(label, payload) => `${label} — ${payload?.[0]?.payload?.date ?? ""}`} /><Line type="monotone" dataKey="attendanceRate" name="Attendance rate" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></ChartPanel>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1"><DashboardMetricCard compact title="Total Present" value={totalPresent.toLocaleString()} detail="Across completed sessions." icon={Users} tone="success" /><DashboardMetricCard compact title="Total Late" value={totalLate.toLocaleString()} detail="After the check-in cutoff." icon={Clock3} tone="warning" /><DashboardMetricCard compact title="Attendance Rate" value={`${averageRate}%`} detail="Average across completed sessions." icon={TrendingUp} /></div>
        </section>
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartPanel title="Feedback Sentiment" description="Submitted event feedback." empty={!analyticsQuery.data?.sentiment.some((item) => item.value > 0)} emptyMessage="Feedback sentiment will appear after students submit feedback."><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analyticsQuery.data?.sentiment ?? []} dataKey="value" nameKey="name" innerRadius={44} outerRadius={76} paddingAngle={3}>{(analyticsQuery.data?.sentiment ?? []).map((item, index) => <Cell key={item.name} fill={["#16a34a", "#64748b", "#dc2626"][index]} />)}</Pie><Tooltip formatter={(value: number) => `${value}%`} /><Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} /></PieChart></ResponsiveContainer></ChartPanel>
          <ChartPanel title="Late-Arrival Patterns" description="Monthly late check-ins." empty={!analyticsQuery.data?.lateArrivals.some((item) => item.count > 0)} emptyMessage="Late-arrival trends will appear after late check-ins are recorded."><ResponsiveContainer width="100%" height="100%"><BarChart data={analyticsQuery.data?.lateArrivals ?? []} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="count" name="Late check-ins" fill="#d97706" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></ChartPanel>
        </section>
      </>}
    </div>
  );
}
