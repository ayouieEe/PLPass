import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronLeft, ChevronRight, Clock3, ShieldCheck, type LucideIcon, TrendingUp, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { APP_ROUTES } from "@/lib/constants/routes";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useEvents, useOrganizerProfiles, useStudents } from "@/hooks/useRepositoryQueries";
import { useOrganizerDashboardAnalytics } from "@/features/organizer/hooks/useOrganizerDashboardAnalytics";
import { useAutomaticForecasts } from "@/features/organizer/hooks/useAutomaticForecasts";
import { buildPredictionOverview } from "@/features/organizer/utils/predictionOverview";
import { repositories } from "@/services/repositories";
import type { Event } from "@/types/domain";

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

function DashboardMetricCard({ title, value, detail, icon: Icon, tone = "default", compact = false, to }: { title: string; value: string; detail: string; icon: LucideIcon; tone?: "default" | "warning" | "success"; compact?: boolean; to?: string }) {
  const toneClass = tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-primary/15 bg-primary/5 text-primary";
  const card = (
    <article className={`flex h-full flex-col rounded-lg border bg-surface shadow-sm transition-shadow hover:shadow-md ${compact ? "p-3" : "p-4"}`}>
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

  return to ? (
    <NavLink to={to} aria-label={`View ${title}`} className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
      {card}
    </NavLink>
  ) : card;
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

export function OrganizerDashboardPage({ workspace = "organizer" }: { workspace?: "organizer" | "admin" | "department" }) {
  const isAdminWorkspace = workspace === "admin";
  const isDepartmentWorkspace = workspace === "department";
  const { session } = useDevelopmentSession();
  const [predictionPage, setPredictionPage] = useState(0);
  const context = useMemo(() => (session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined), [session]);
  const eventsQuery = useEvents({ pageSize: 100 }, context);
  const organizerProfilesQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  const systemHealthQuery = useQuery({
    queryKey: ["admin-dashboard-system-health", context],
    queryFn: () => repositories.systemHealth.getHealthSnapshot(context),
    enabled: isAdminWorkspace && Boolean(context),
    staleTime: 30_000,
    retry: false
  });
  const studentsQuery = useStudents({ pageSize: 1 }, context);
  const events = useMemo(() => eventsQuery.data?.items ?? [], [eventsQuery.data?.items]);
  const totalEventCount = eventsQuery.data?.total ?? events.length;
  const automaticForecasts = useAutomaticForecasts(events, context ?? { actorUserId: "", actorRole: "organizer" }, session?.role === "organizer");
  const analyticsQuery = useOrganizerDashboardAnalytics(events.map(({ id, code, startsAt }) => ({ id, code, startsAt })));
  const today = useMemo(() => new Date(), []);
  const activeEvents = useMemo(() => events.filter((event) => event.status !== "rejected" && event.status !== "cancelled" && event.status !== "completed"), [events]);
  const todaysEvents = useMemo(() => activeEvents.filter((event) => isSameDay(event.startsAt, today)), [activeEvents, today]);
  const activeEvent: Event | undefined = todaysEvents[0];
  const highlightedEvent = activeEvent;
  const nextEvent = useMemo(() => activeEvents.filter((event) => new Date(event.startsAt).getTime() > today.getTime()).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0], [activeEvents, today]);
  const predictionOverviewData = useMemo(() => buildPredictionOverview(activeEvents), [activeEvents]);
  const predictionPageSize = 10;
  const predictionPageCount = Math.ceil(predictionOverviewData.length / predictionPageSize);
  const activePredictionPage = Math.min(predictionPage, Math.max(predictionPageCount - 1, 0));
  const paginatedPredictionData = useMemo(
    () => predictionOverviewData.slice(activePredictionPage * predictionPageSize, (activePredictionPage + 1) * predictionPageSize),
    [activePredictionPage, predictionOverviewData]
  );
  const routes = isAdminWorkspace ? {
    dashboard: APP_ROUTES.adminDashboard,
    events: APP_ROUTES.adminEvents,
    records: APP_ROUTES.adminAttendance,
    analytics: APP_ROUTES.adminAnalytics,
    users: APP_ROUTES.adminUsers,
    settings: APP_ROUTES.adminSettings,
    createEvent: undefined
  } : isDepartmentWorkspace ? {
    dashboard: APP_ROUTES.departmentDashboard,
    events: APP_ROUTES.departmentEvents,
    records: APP_ROUTES.departmentRecords,
    analytics: APP_ROUTES.departmentAnalytics,
    users: APP_ROUTES.departmentUsers,
    settings: APP_ROUTES.departmentSettings,
    createEvent: undefined
  } : {
    dashboard: APP_ROUTES.organizerDashboard,
    events: APP_ROUTES.organizerEvents,
    records: APP_ROUTES.organizerRecords,
    corrections: APP_ROUTES.organizerCorrections,
    analytics: APP_ROUTES.organizerAnalytics,
    users: APP_ROUTES.organizerUsers,
    settings: APP_ROUTES.organizerSettings,
    createEvent: APP_ROUTES.organizerCreateEvent
  };
  const trend = analyticsQuery.data?.attendanceTrend ?? [];
  const totalPresent = trend.reduce((total, row) => total + row.present, 0);
  const totalLate = trend.reduce((total, row) => total + row.late, 0);
  const averageRate = Math.round(trend.reduce((total, row) => total + row.attendanceRate, 0) / Math.max(trend.length, 1));
  const healthChecks = systemHealthQuery.data?.checks ?? [];
  const unhealthyChecks = healthChecks.filter((check) => check.status !== "healthy").length;
  const systemHealthStatus = systemHealthQuery.isError ? "Unavailable" : !systemHealthQuery.data ? "Checking…" : unhealthyChecks ? "Attention needed" : "Healthy";
  const systemHealthDetail = systemHealthQuery.isError
    ? "Health checks could not be loaded."
    : !systemHealthQuery.data
      ? "Checking monitored services…"
      : unhealthyChecks
        ? `${unhealthyChecks} monitored check${unhealthyChecks === 1 ? "" : "s"} need attention.`
        : "All monitored services are operational.";

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader title={isAdminWorkspace ? "Admin Dashboard" : isDepartmentWorkspace ? "Department Dashboard" : "Dashboard"} description={isAdminWorkspace ? "Monitor institution-wide activity and system operations." : isDepartmentWorkspace ? "Monitor events, organizers, students, and attendance for your assigned department." : "See live sessions, event schedules, and attendance trends."} actions={routes.createEvent ? <Button asChild size="sm"><NavLink to={routes.createEvent}>Create Event</NavLink></Button> : <Button asChild size="sm" variant="outline"><NavLink to={isDepartmentWorkspace ? APP_ROUTES.departmentSystemHealth : APP_ROUTES.adminSystemHealth}>System Health</NavLink></Button>} />


      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard title={isDepartmentWorkspace ? "Department Events" : "Total Events"} value={totalEventCount.toLocaleString()} detail={isDepartmentWorkspace ? "All events in your department, including completed records." : "All events in your available scope, including completed records."} icon={CalendarCheck} to={routes.records} />
        {isAdminWorkspace ? <DashboardMetricCard title="System Health" value={systemHealthStatus} detail={systemHealthDetail} icon={ShieldCheck} tone={unhealthyChecks || systemHealthQuery.isError ? "warning" : "success"} to={APP_ROUTES.adminSystemHealth} /> : <DashboardMetricCard title={isDepartmentWorkspace ? "Department Organizers" : "Registered Organizers"} value={(organizerProfilesQuery.data?.total ?? 0).toLocaleString()} detail={isDepartmentWorkspace ? "Organizer accounts assigned to your department." : "Organizer accounts registered in your available scope."} icon={Users} to={isDepartmentWorkspace ? `${routes.users}?tab=organizers` : undefined} />}
        <DashboardMetricCard title={isAdminWorkspace ? "Registered Organizers" : isDepartmentWorkspace ? "Department Students" : "Registered Students"} value={(isAdminWorkspace || isDepartmentWorkspace ? (isAdminWorkspace ? organizerProfilesQuery.data?.total ?? 0 : studentsQuery.data?.total ?? 0) : studentsQuery.data?.total ?? 0).toLocaleString()} detail={isAdminWorkspace ? "Organizer accounts registered in the system." : isDepartmentWorkspace ? "Students assigned to your department." : "Total students enrolled in the system."} icon={Users} to={isDepartmentWorkspace ? routes.users : isAdminWorkspace ? `${routes.users}?tab=organizers` : undefined} />
        <DashboardMetricCard title={isAdminWorkspace ? "Registered Students" : isDepartmentWorkspace ? "Attendance Rate" : "Next Event Turnout"} value={isAdminWorkspace ? (studentsQuery.data?.total ?? 0).toLocaleString() : isDepartmentWorkspace ? `${averageRate}%` : (nextEvent?.predictedTurnout != null ? `${nextEvent.predictedTurnout}%` : "N/A")} detail={isAdminWorkspace ? "Total students enrolled in the system." : isDepartmentWorkspace ? "Average across completed department sessions." : (nextEvent ? `${nextEvent.code}: ${nextEvent.title}` : "No upcoming event scheduled.")} icon={isAdminWorkspace || isDepartmentWorkspace ? Users : TrendingUp} tone="success" to={isAdminWorkspace ? routes.users : routes.analytics} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-lg border bg-surface p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Today’s Event</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Current schedule and readiness overview.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild size="sm" variant="outline">
                <NavLink to={`${routes.events}?tab=today`}>View today’s events</NavLink>
              </Button>
            </div>
          </div>
          {highlightedEvent ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2"><EventDetail label="Event" value={highlightedEvent.code} detail={highlightedEvent.title} /><EventDetail label="Venue" value={highlightedEvent.venue} detail={highlightedEvent.category} /><EventDetail label="Schedule" value={formatDate(highlightedEvent.startsAt)} detail={formatTimeRange(highlightedEvent.startsAt, highlightedEvent.endsAt)} /><EventDetail label="Turnout" value={highlightedEvent.predictedTurnout != null ? `${highlightedEvent.predictedTurnout}%` : "N/A"} detail="Predicted attendance" /></div> : <div className="mt-4 rounded-md border border-dashed bg-background px-3 py-4 text-sm text-muted-foreground">There is no event scheduled for today yet.</div>}
          
        </section>
        <div>
          <div className="sr-only" data-chart-summary>
            <p>{`Prediction chart data: ${paginatedPredictionData.map((item) => `${item.title}, ${item.predictedAttend}% predicted attendance and ${item.predictedMiss}% predicted non-attendance`).join("; ")}.`}</p>
            <p>{`Attendance trend chart data: ${trend.map((item) => `${item.label}, ${item.attendanceRate}% attendance`).join("; ")}.`}</p>
            <p>{`Feedback sentiment chart data: ${(analyticsQuery.data?.sentiment ?? []).map((item) => `${item.name}, ${item.value}%`).join("; ")}.`}</p>
            <p>{`Late-arrival chart data: ${(analyticsQuery.data?.lateArrivals ?? []).map((item) => `${item.label}, ${item.count} late check-ins`).join("; ")}.`}</p>
          </div>
          <ChartPanel title="Prediction Overview" description="Saved attendance forecasts by event." empty={!paginatedPredictionData.length} emptyMessage={automaticForecasts.status === "running" ? "Preparing turnout forecasts automatically…" : automaticForecasts.status === "unavailable" ? "Forecast preparation is temporarily unavailable and will retry automatically when the service or connection is available." : "No saved turnout forecasts are available yet. Unavailable forecasts are not shown as zero attendance."}><div className="flex h-full min-h-0 flex-col"><div className="flex shrink-0 items-center gap-5 pb-2 text-xs"><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-green-600" />Predicted Attendance</span><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-red-600" />Predicted Non-attendance</span></div><div className="min-h-0 flex-1" role="region" aria-label="Prediction overview chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={paginatedPredictionData} margin={{ top: 4, right: 12, left: -16, bottom: 16 }} barCategoryGap="22%"><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" interval={0} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis unit="%" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? "Event"} formatter={(value: number) => `${value}%`} /><Bar dataKey="predictedAttend" name="Predicted Attendance" stackId="prediction" fill="#16a34a" radius={[3, 3, 0, 0]} /><Bar dataKey="predictedMiss" name="Predicted Non-attendance" stackId="prediction" fill="#dc2626" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>{predictionPageCount > 1 ? <div className="mt-3 flex shrink-0 items-center justify-between border-t pt-3"><p className="text-[10px] text-muted-foreground">Showing {activePredictionPage * predictionPageSize + 1} to {Math.min((activePredictionPage + 1) * predictionPageSize, predictionOverviewData.length)} of {predictionOverviewData.length} events</p><div className="flex items-center gap-1"><Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0" aria-label="Previous prediction page" onClick={() => setPredictionPage((page) => Math.max(0, page - 1))} disabled={activePredictionPage === 0}><ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /></Button><Button type="button" variant="outline" size="sm" className="h-6 w-6 p-0" aria-label="Next prediction page" onClick={() => setPredictionPage((page) => Math.min(predictionPageCount - 1, page + 1))} disabled={activePredictionPage >= predictionPageCount - 1}><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></Button></div></div> : null}</div></ChartPanel>
        </div>
      </section>

      {analyticsQuery.isError ? <section className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-muted-foreground">Analytics could not be loaded. Refresh the page to try again.</section> : analyticsQuery.isLoading ? <section className="rounded-lg border bg-surface p-4 text-sm text-muted-foreground">Loading attendance analytics…</section> : <>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15.5rem]">
          <ChartPanel title="Attendance Trends" description="Attendance rate per completed event session." empty={!trend.length} emptyMessage="Attendance trends will appear after event sessions are completed."><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} /><YAxis unit="%" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} /><Tooltip formatter={(value: number) => [`${value}%`, "Attendance rate"]} labelFormatter={(label, payload) => `${label} — ${payload?.[0]?.payload?.date ?? ""}`} /><Line type="monotone" dataKey="attendanceRate" name="Attendance rate" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></ChartPanel>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1"><DashboardMetricCard compact title="Total Present" value={totalPresent.toLocaleString()} detail="Across completed sessions." icon={Users} tone="success" to={routes.analytics} /><DashboardMetricCard compact title="Total Late" value={totalLate.toLocaleString()} detail="After the check-in cutoff." icon={Clock3} tone="warning" to={routes.analytics} /><DashboardMetricCard compact title="Attendance Rate" value={`${averageRate}%`} detail="Average across completed sessions." icon={TrendingUp} to={routes.analytics} /></div>
        </section>
        <section className="grid gap-4 xl:grid-cols-2">
          <ChartPanel title="Feedback Sentiment" description="Submitted event feedback." empty={!analyticsQuery.data?.sentiment.some((item) => item.value > 0)} emptyMessage="Feedback sentiment will appear after students submit feedback."><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={analyticsQuery.data?.sentiment ?? []} dataKey="value" nameKey="name" innerRadius={44} outerRadius={76} paddingAngle={3}>{(analyticsQuery.data?.sentiment ?? []).map((item, index) => <Cell key={item.name} fill={["#16a34a", "#64748b", "#dc2626"][index]} />)}</Pie><Tooltip formatter={(value: number) => `${value}%`} /><Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} /></PieChart></ResponsiveContainer></ChartPanel>
          <ChartPanel title="Late-Arrival Patterns" description="Monthly late check-ins." empty={!analyticsQuery.data?.lateArrivals.some((item) => item.count > 0)} emptyMessage="Late-arrival trends will appear after late check-ins are recorded."><ResponsiveContainer width="100%" height="100%"><BarChart data={analyticsQuery.data?.lateArrivals ?? []} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="count" name="Late check-ins" fill="#d97706" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></ChartPanel>
        </section>
      </>}
    </div>
  );
}
