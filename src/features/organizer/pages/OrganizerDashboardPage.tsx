import { type ReactNode, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  Clock3,
  type LucideIcon,
  TrendingUp,
  Users
} from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";
import {
  lateReasons,
  loadOrganizerUiState,
  type OrganizerCompletedEvent,
  type OrganizerEvent
} from "@/features/organizer/data/organizerUiStore";

export type DashboardEventSummary = {
  code: string;
  title: string;
  category: string;
  venue: string;
  date: string;
  time: string;
  predictedTurnout: number;
};

export const EMPTY_EVENTS: DashboardEventSummary[] = [];

export type SessionSummary = {
  eventCode: string;
  date: string;
  present: number;
  late: number;
  absent: number;
  totalRegistered: number;
  attendanceRate: number;
};

export const EMPTY_SESSION_SUMMARY: SessionSummary[] = [];

export type SentimentSummary = {
  eventCode: string;
  overall: "Positive" | "Neutral" | "Negative";
  positive: number;
  neutral: number;
  negative: number;
};

export const EMPTY_SENTIMENT: SentimentSummary[] = [];

export const EMPTY_LATE_REASON_FREQUENCY: Array<{ category: string; share: number }> = [];

export const EMPTY_SUMMARY = {
  totalEvents: 0,
  activeSessionToday: { count: 0, eventCode: "" },
  totalRegisteredStudents: 0,
  predictedTurnoutNextEvent: { eventCode: "", value: 0 },
  topLateArrivalReason: { category: "No Supabase late records yet", share: 0 }
};

const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "#16a34a",
  Neutral: "#f59e0b",
  Negative: "#dc2626"
};

function shortCode(eventCode: string) {
  return eventCode.replace("EVT-2026-", "EVT-");
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function dashboardEventFromStore(event: OrganizerEvent): DashboardEventSummary {
  return {
    code: event.code,
    title: event.name,
    category: event.category,
    venue: event.venue,
    date: event.date,
    time: `${event.startTime} - ${event.endTime}`,
    predictedTurnout: event.predictedTurnout
  };
}

function sessionSummaryFromStore(event: OrganizerCompletedEvent): SessionSummary {
  return {
    eventCode: event.code,
    date: event.date,
    present: event.present,
    late: event.late,
    absent: event.absent,
    totalRegistered: event.totalRegistered,
    attendanceRate: event.attendanceRate
  };
}

function DashboardMetricCard({
  title,
  value,
  icon: Icon,
  tone = "default"
}: {
  title: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-primary/15 bg-primary/5 text-primary";

  return (
    <article className="rounded-lg border bg-surface p-4 shadow-sm transition-all duration-300 hover:animate-hover-lift hover:shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-foreground">{value}</p>
        </div>
        <span className={`grid h-9 w-9 flex-none place-items-center rounded-md border ${toneClass}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

function ChartPanel({
  title,
  description,
  action,
  children
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-3 h-64 w-full">{children}</div>
    </section>
  );
}

function LateReasonLabels({ data }: { data: Array<{ category: string; share: number }> }) {
  return (
    <aside className="h-full rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Late-Arrival Reasons</h2>
        <span className="flex-none rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          Top
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {data.map((reason) => (
          <div key={reason.category} className="rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium leading-5 text-foreground">{reason.category}</p>
              <span className="text-sm font-semibold text-foreground">{reason.share}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${reason.share}%` }} />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function OrganizerDashboardPage() {
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [uiState] = useState(() => loadOrganizerUiState());

  const dashboardEvents = useMemo(() => uiState.events.map(dashboardEventFromStore), [uiState.events]);
  const completedSummaries = useMemo(() => uiState.completedEvents.map(sessionSummaryFromStore), [uiState.completedEvents]);

  const trendData = useMemo(() => {
    const rows =
      eventFilter === "all"
        ? completedSummaries
        : completedSummaries.filter((row) => row.eventCode === eventFilter);

    return rows.map((row) => ({
      label: shortCode(row.eventCode),
      date: formatDate(row.date),
      attendanceRate: row.attendanceRate,
      present: row.present,
      late: row.late,
      absent: row.absent
    }));
  }, [completedSummaries, eventFilter]);

  const predictionOverviewData = useMemo(
    () =>
      dashboardEvents.map((event) => ({
        label: shortCode(event.code),
        title: event.title,
        predictedAttend: event.predictedTurnout,
        predictedMiss: 100 - event.predictedTurnout
      })),
    [dashboardEvents]
  );

  const sentimentOverview = useMemo(() => {
    const rows = uiState.completedEvents.length ? uiState.completedEvents.map((event) => event.sentiment) : EMPTY_SENTIMENT;
    const totals = rows.reduce(
      (acc, row) => ({
        positive: acc.positive + row.positive,
        neutral: acc.neutral + row.neutral,
        negative: acc.negative + row.negative
      }),
      { positive: 0, neutral: 0, negative: 0 }
    );
    const count = rows.length || 1;

    return [
      { name: "Positive", value: Math.round(totals.positive / count) },
      { name: "Neutral", value: Math.round(totals.neutral / count) },
      { name: "Negative", value: Math.round(totals.negative / count) }
    ];
  }, [uiState.completedEvents]);

  const activeStoreEvent =
    uiState.events.find((event) => event.status === "active") ??
    uiState.events.find((event) => event.status === "today") ??
    uiState.events.find((event) => event.status === "incoming");
  const activeEvent = activeStoreEvent ? dashboardEventFromStore(activeStoreEvent) : undefined;
  const nextStoreEvent = uiState.events
    .filter((event) => event.status === "incoming" || event.status === "today")
    .sort((first, second) => first.date.localeCompare(second.date))[0];
  const nextEvent = nextStoreEvent ? dashboardEventFromStore(nextStoreEvent) : undefined;
  const activeSessionCount = uiState.events.filter((event) => event.status === "active" || event.status === "today").length;
  const totalEvents = uiState.events.filter((event) => event.status !== "cancelled").length;
  const lateReasonData = useMemo(() => {
    const lateRows = uiState.attendanceRows.filter((row) => row.attendanceStatus === "late");
    return lateReasons.map((reason) => {
      const count = lateRows.filter((row) => row.lateReason === reason).length;
      return {
        category: reason,
        share: lateRows.length ? Math.round((count / lateRows.length) * 100) : 0
      };
    });
  }, [uiState.attendanceRows]);
  const topLateReason = lateReasonData.reduce((top, item) => (item.share > top.share ? item : top), lateReasonData[0] ?? EMPTY_SUMMARY.topLateArrivalReason);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <NavLink to={APP_ROUTES.organizerEvents}>View Events</NavLink>
            </Button>
            <Button asChild size="sm">
              <NavLink to={APP_ROUTES.organizerCreateEvent}>Create Event</NavLink>
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="animate-fade-in-up-1">
          <DashboardMetricCard
            title="Total Events"
            value={totalEvents.toLocaleString()}
            detail="Published events"
            icon={CalendarCheck}
          />
        </div>
        <div className="animate-fade-in-up-2">
          <DashboardMetricCard
            title="Active Today"
            value={activeSessionCount.toLocaleString()}
            detail={activeEvent ? activeEvent.code : "No active session"}
            icon={Clock3}
            tone="success"
          />
        </div>
        <div className="animate-fade-in-up-3">
          <DashboardMetricCard
            title="Registered Students"
            value={uiState.students.length.toLocaleString()}
            detail="Total enrolled"
            icon={Users}
          />
        </div>
        <div className="animate-fade-in-up-1">
          <DashboardMetricCard
            title="Next Event Turnout"
            value={nextEvent ? `${nextEvent.predictedTurnout}%` : "0%"}
            detail={nextEvent ? nextEvent.code : "No upcoming event"}
            icon={TrendingUp}
            tone="success"
          />
        </div>
        <div className="animate-fade-in-up-2">
          <DashboardMetricCard
            title="Top Late Reason"
            value={`${topLateReason.share}%`}
            detail={topLateReason.category}
            icon={AlertTriangle}
            tone="warning"
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-lg border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Today&apos;s Event</h2>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                Live today
              </span>
            </div>

            {activeEvent ? (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Event</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{activeEvent.code}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{activeEvent.title}</p>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Venue</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{activeEvent.venue}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{activeEvent.category}</p>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Schedule</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{activeEvent.date}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{activeEvent.time}</p>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Turnout</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{activeEvent.predictedTurnout}%</p>
                  <p className="mt-1 text-sm text-muted-foreground">Predicted attendance</p>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
                There is no active session configured for today yet. The dashboard will show the next event once it is available.
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button asChild size="sm" className="rounded-lg px-4 shadow-sm">
                <NavLink to={`${APP_ROUTES.organizerEvents}?tab=today`}>View Today&apos;s Events</NavLink>
              </Button>
            </div>
          </section>

          <ChartPanel
            title="Attendance Trends"
          action={
            <select
              className="h-8 rounded-md border bg-background px-2.5 text-xs text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              aria-label="Filter attendance trend by event"
            >
              <option value="all">All events</option>
              {dashboardEvents.map((event) => (
                <option key={event.code} value={event.code}>
                  {event.code} - {event.title}
                </option>
              ))}
            </select>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 8, right: 14, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis unit="%" domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value: number, name: string) => [name === "attendanceRate" ? `${value}%` : value, "Attendance rate"]}
                labelFormatter={(label, payload) => `${label} - ${payload?.[0]?.payload?.date ?? ""}`}
              />
              <Line
                type="monotone"
                dataKey="attendanceRate"
                name="Attendance rate"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
          </ChartPanel>
        </div>

        <LateReasonLabels data={lateReasonData} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartPanel title="Turnout Predictions">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={predictionOverviewData} margin={{ top: 8, right: 12, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis unit="%" domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value: number) => `${value}%`} />
              <Legend iconType="circle" />
              <Bar dataKey="predictedAttend" name="Predicted to attend" stackId="prediction" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="predictedMiss" name="Predicted to miss" stackId="prediction" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Feedback Sentiment">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={sentimentOverview}
                dataKey="value"
                nameKey="name"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={3}
                label={({ name, value }) => `${name} ${value}%`}
              >
                {sentimentOverview.map((entry) => (
                  <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name]} />
                ))}
              </Pie>
              <Legend iconType="circle" />
              <Tooltip formatter={(value: number) => `${value}%`} />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>
      </section>
    </div>
  );
}
