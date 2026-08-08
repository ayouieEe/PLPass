import { useMemo, type ReactNode } from "react";
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
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAcademicCatalog, useEvents, useStudents } from "@/hooks/useRepositoryQueries";
import type { Event } from "@/types/domain";

function shortCode(eventCode: string) {
  return eventCode.replace("EVT-2026-", "EVT-");
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const fmt = (iso: string) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return `${fmt(startsAt)} - ${fmt(endsAt)}`;
}

function isSameDay(iso: string, reference: Date) {
  const date = new Date(iso);
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
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
    <article className="min-h-36 rounded-lg border bg-surface p-4 shadow-sm transition-all duration-300 hover:animate-hover-lift hover:shadow-lg">
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

export function OrganizerDashboardPage() {
  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );

  const eventsQuery = useEvents({ pageSize: 100 }, context);
  const { semesters: semestersQuery } = useAcademicCatalog({ pageSize: 100 }, context);
  const studentsQuery = useStudents({ pageSize: 1 }, context);

  const events = eventsQuery.data?.items ?? [];
  const today = useMemo(() => new Date(), []);

  const activeEvents = useMemo(
    () => events.filter((event) => event.status !== "rejected" && event.status !== "cancelled"),
    [events]
  );

  const todaysEvents = useMemo(
    () => activeEvents.filter((event) => isSameDay(event.startsAt, today)),
    [activeEvents, today]
  );

  const activeEvent: Event | undefined = todaysEvents[0];

  const nextEvent = useMemo(() => {
    const upcoming = activeEvents
      .filter((event) => new Date(event.startsAt).getTime() > today.getTime())
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    return upcoming[0];
  }, [activeEvents, today]);

  const predictionOverviewData = useMemo(
    () =>
      activeEvents.map((event) => {
        const predicted = event.predictedTurnout ?? 0;
        return {
          label: shortCode(event.code),
          title: event.title,
          predictedAttend: predicted,
          predictedMiss: 100 - predicted
        };
      }),
    [activeEvents]
  );

  const activeSemester = semestersQuery.data?.items.find((semester) => semester.isActive);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Day-to-day workspace for live sessions, turnout forecasts, and event scheduling."
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="animate-fade-in-up-1">
          <DashboardMetricCard
            title="Total Events"
            value={activeEvents.length.toLocaleString()}
            detail={
              activeSemester
                ? `Published events for ${activeSemester.label}, ${activeSemester.schoolYear}.`
                : "Published events in the current data set."
            }
            icon={CalendarCheck}
          />
        </div>
        <div className="animate-fade-in-up-2">
          <DashboardMetricCard
            title="Active Sessions Today"
            value={todaysEvents.length.toLocaleString()}
            detail={activeEvent ? `${activeEvent.code}: ${activeEvent.title}` : "No event scheduled for today."}
            icon={Clock3}
            tone="success"
          />
        </div>
        <div className="animate-fade-in-up-3">
          <DashboardMetricCard
            title="Registered Students"
            value={(studentsQuery.data?.total ?? 0).toLocaleString()}
            detail="Total students enrolled in the system."
            icon={Users}
          />
        </div>
        <div className="animate-fade-in-up-1">
          <DashboardMetricCard
            title="Next Event Turnout"
            value={nextEvent?.predictedTurnout != null ? `${nextEvent.predictedTurnout}%` : "N/A"}
            detail={nextEvent ? `${nextEvent.code}: ${nextEvent.title}` : "No upcoming event scheduled."}
            icon={TrendingUp}
            tone="success"
          />
        </div>
      </section>

      <section className="rounded-lg border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Today&apos;s Event Details</h2>
            <p className="mt-1 text-sm text-muted-foreground">Overview of the event scheduled for today.</p>
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
              <p className="mt-2 text-lg font-semibold text-foreground">{formatDate(activeEvent.startsAt)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{formatTimeRange(activeEvent.startsAt, activeEvent.endsAt)}</p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">Turnout</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {activeEvent.predictedTurnout != null ? `${activeEvent.predictedTurnout}%` : "N/A"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Predicted attendance</p>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
            There is no event scheduled for today yet.
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <Button asChild size="sm" className="rounded-lg px-4 shadow-sm">
            <NavLink to={`${APP_ROUTES.organizerEvents}?tab=today`}>View Today&apos;s Events</NavLink>
          </Button>
        </div>
      </section>

      <ChartPanel title="Prediction Overview" description="Predicted-to-attend vs. predicted-to-miss by event.">
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

      <section className="rounded-lg border border-dashed bg-surface p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <p className="font-medium">Attendance Trends, Feedback Sentiment, and Late-Arrival charts are on hold.</p>
        </div>
        <p className="mt-1">
          These need real rows in <code>attendance_records</code> and <code>event_feedback</code> (currently empty),
          plus new hooks for those tables. They&apos;ll come back once Live Session check-ins start writing real data.
        </p>
      </section>
    </div>
  );
}