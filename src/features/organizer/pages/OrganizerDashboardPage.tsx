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

export type DummyEvent = {
  code: string;
  title: string;
  category: string;
  venue: string;
  date: string;
  time: string;
  predictedTurnout: number;
};

export const DUMMY_EVENTS: DummyEvent[] = [
  {
    code: "EVT-2026-001",
    title: "Hospitality Career Fair & Industry Talk",
    category: "Career Development",
    venue: "PLP Pasig Gymnasium",
    date: "2026-02-10",
    time: "08:00 AM - 12:00 PM",
    predictedTurnout: 82
  },
  {
    code: "EVT-2026-002",
    title: "Food & Beverage Service Skills Workshop",
    category: "Skills Training",
    venue: "PLP HM Training Laboratory",
    date: "2026-02-24",
    time: "01:00 PM - 05:00 PM",
    predictedTurnout: 76
  },
  {
    code: "EVT-2026-003",
    title: "AHTOMP General Assembly & Orientation",
    category: "General Assembly",
    venue: "PLP Pasig Auditorium",
    date: "2026-03-05",
    time: "09:00 AM - 11:00 AM",
    predictedTurnout: 91
  },
  {
    code: "EVT-2026-004",
    title: "Front Office Operations Simulation Day",
    category: "Skills Training",
    venue: "PLP HM Mock Hotel Lab",
    date: "2026-03-19",
    time: "08:30 AM - 03:30 PM",
    predictedTurnout: 69
  },
  {
    code: "EVT-2026-005",
    title: "Sustainable Tourism Speaker Series",
    category: "Seminar",
    venue: "PLP Multi-Purpose Hall",
    date: "2026-04-02",
    time: "01:30 PM - 04:00 PM",
    predictedTurnout: 58
  },
  {
    code: "EVT-2026-006",
    title: "AHTOMP Culinary & Mixology Showcase",
    category: "Competition",
    venue: "PLP HM Culinary Kitchen",
    date: "2026-04-18",
    time: "09:00 AM - 04:00 PM",
    predictedTurnout: 88
  }
];

export type SessionSummary = {
  eventCode: string;
  date: string;
  present: number;
  late: number;
  absent: number;
  totalRegistered: number;
  attendanceRate: number;
};

export const DUMMY_SESSION_SUMMARY: SessionSummary[] = [
  { eventCode: "EVT-2026-001", date: "2026-02-10", present: 142, late: 18, absent: 12, totalRegistered: 172, attendanceRate: 82.6 },
  { eventCode: "EVT-2026-002", date: "2026-02-24", present: 97, late: 14, absent: 23, totalRegistered: 134, attendanceRate: 72.8 },
  { eventCode: "EVT-2026-003", date: "2026-03-05", present: 203, late: 9, absent: 8, totalRegistered: 220, attendanceRate: 92.7 },
  { eventCode: "EVT-2026-004", date: "2026-03-19", present: 88, late: 21, absent: 35, totalRegistered: 144, attendanceRate: 61.1 },
  { eventCode: "EVT-2026-005", date: "2026-04-02", present: 61, late: 11, absent: 38, totalRegistered: 110, attendanceRate: 55.5 },
  { eventCode: "EVT-2026-006", date: "2026-04-18", present: 168, late: 16, absent: 6, totalRegistered: 190, attendanceRate: 88.4 }
];

export type SentimentSummary = {
  eventCode: string;
  overall: "Positive" | "Neutral" | "Negative";
  positive: number;
  neutral: number;
  negative: number;
};

export const DUMMY_SENTIMENT: SentimentSummary[] = [
  { eventCode: "EVT-2026-001", overall: "Positive", positive: 78, neutral: 18, negative: 4 },
  { eventCode: "EVT-2026-002", overall: "Positive", positive: 64, neutral: 27, negative: 9 },
  { eventCode: "EVT-2026-003", overall: "Positive", positive: 71, neutral: 22, negative: 7 },
  { eventCode: "EVT-2026-004", overall: "Neutral", positive: 48, neutral: 35, negative: 17 },
  { eventCode: "EVT-2026-005", overall: "Neutral", positive: 39, neutral: 41, negative: 20 },
  { eventCode: "EVT-2026-006", overall: "Positive", positive: 85, neutral: 12, negative: 3 }
];

export const DUMMY_LATE_REASON_FREQUENCY = [
  { category: "Traffic / Commute", share: 40 },
  { category: "Class or Academic Conflict", share: 24 },
  { category: "Personal / Health", share: 16 },
  { category: "Weather / Force Majeure", share: 12 },
  { category: "Other", share: 8 }
] as const;

export const DUMMY_SUMMARY = {
  totalEvents: 6,
  activeSessionToday: { count: 1, eventCode: "EVT-2026-004" },
  totalRegisteredStudents: 970,
  predictedTurnoutNextEvent: { eventCode: "EVT-2026-005", value: 58 },
  topLateArrivalReason: { category: "Traffic / Commute", share: 40 }
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

function DashboardMetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "default"
}: {
  title: string;
  value: string;
  detail: string;
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
    <article className="min-h-36 rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-semibold leading-none text-foreground">{value}</p>
        </div>
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-md border ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-5 text-muted-foreground">{detail}</p>
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
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-5 h-72 w-full">{children}</div>
    </section>
  );
}

function LateReasonLabels() {
  return (
    <aside className="h-full rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Late-Arrival Reason Labels</h2>
          <p className="mt-1 text-sm text-muted-foreground">Share of late check-ins by reason this month.</p>
        </div>
        <span className="flex-none rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          Top
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {DUMMY_LATE_REASON_FREQUENCY.map((reason) => (
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

  const eventLookup = useMemo(() => new Map(DUMMY_EVENTS.map((event) => [event.code, event])), []);

  const trendData = useMemo(() => {
    const rows =
      eventFilter === "all"
        ? DUMMY_SESSION_SUMMARY
        : DUMMY_SESSION_SUMMARY.filter((row) => row.eventCode === eventFilter);

    return rows.map((row) => ({
      label: shortCode(row.eventCode),
      date: formatDate(row.date),
      attendanceRate: row.attendanceRate,
      present: row.present,
      late: row.late,
      absent: row.absent
    }));
  }, [eventFilter]);

  const predictionOverviewData = useMemo(
    () =>
      DUMMY_EVENTS.map((event) => ({
        label: shortCode(event.code),
        title: event.title,
        predictedAttend: event.predictedTurnout,
        predictedMiss: 100 - event.predictedTurnout
      })),
    []
  );

  const sentimentOverview = useMemo(() => {
    const totals = DUMMY_SENTIMENT.reduce(
      (acc, row) => ({
        positive: acc.positive + row.positive,
        neutral: acc.neutral + row.neutral,
        negative: acc.negative + row.negative
      }),
      { positive: 0, neutral: 0, negative: 0 }
    );
    const count = DUMMY_SENTIMENT.length;

    return [
      { name: "Positive", value: Math.round(totals.positive / count) },
      { name: "Neutral", value: Math.round(totals.neutral / count) },
      { name: "Negative", value: Math.round(totals.negative / count) }
    ];
  }, []);

  const activeEvent = eventLookup.get(DUMMY_SUMMARY.activeSessionToday.eventCode);
  const nextEvent = eventLookup.get(DUMMY_SUMMARY.predictedTurnoutNextEvent.eventCode);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organizer"
        title="Dashboard"
        description="Day-to-day workspace for live sessions, turnout forecasts, attendance trends, and feedback signals."
        actions={
          <>
            <Button asChild variant="outline">
              <NavLink to={APP_ROUTES.organizerEvents}>View Events</NavLink>
            </Button>
            <Button asChild>
              <NavLink to={APP_ROUTES.organizerCreateEvent}>Create Event</NavLink>
            </Button>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <DashboardMetricCard
          title="Total Events"
          value={DUMMY_SUMMARY.totalEvents.toLocaleString()}
          detail="Published AHTOMP events in the current data set."
          icon={CalendarCheck}
        />
        <DashboardMetricCard
          title="Active Sessions Today"
          value={DUMMY_SUMMARY.activeSessionToday.count.toLocaleString()}
          detail={activeEvent ? `${activeEvent.code}: ${activeEvent.title}` : "No active session. Showing the next upcoming event."}
          icon={Clock3}
          tone="success"
        />
        <DashboardMetricCard
          title="Registered Students"
          value={DUMMY_SUMMARY.totalRegisteredStudents.toLocaleString()}
          detail="Total student registrations across tracked event sessions."
          icon={Users}
        />
        <DashboardMetricCard
          title="Next Event Turnout"
          value={`${DUMMY_SUMMARY.predictedTurnoutNextEvent.value}%`}
          detail={nextEvent ? `${nextEvent.code}: ${nextEvent.title}` : "No upcoming event scheduled."}
          icon={TrendingUp}
          tone="success"
        />
        <DashboardMetricCard
          title="Top Late Reason"
          value={`${DUMMY_SUMMARY.topLateArrivalReason.share}%`}
          detail={DUMMY_SUMMARY.topLateArrivalReason.category}
          icon={AlertTriangle}
          tone="warning"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-lg border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Today&apos;s Event Details</h2>
                <p className="mt-1 text-sm text-muted-foreground">Overview of the event scheduled for today and its current session context.</p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
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
                <NavLink to={`${APP_ROUTES.organizerRecords}?tab=today`}>View Today&apos;s Events</NavLink>
              </Button>
            </div>
          </section>

          <ChartPanel
            title="Attendance Trends"
            description="Attendance rate per session, filterable by event."
          action={
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={eventFilter}
              onChange={(event) => setEventFilter(event.target.value)}
              aria-label="Filter attendance trend by event"
            >
              <option value="all">All events</option>
              {DUMMY_EVENTS.map((event) => (
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

        <LateReasonLabels />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartPanel
          title="Prediction Overview"
          description="Predicted-to-attend vs. predicted-to-miss by event."
        >
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

        <ChartPanel
          title="Feedback Sentiment"
          description="Average positive, neutral, and negative feedback share across events."
        >
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
