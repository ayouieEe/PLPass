import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FilePenLine,
  History,
  MapPin,
  MessageSquareText,
  QrCode,
  ShieldCheck
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ModalShell } from "@/components/modals/ModalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { useAttendanceRecords, useAttendanceSessions, useEvents } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { dateKey, formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import {
  ensureStudentIdentityReadiness,
  getStudentEventMetrics,
  getStudentEventRecords,
  isFeedbackSubmitted,
  statusTone,
  studentVisibleEvents,
  useStudentScope
} from "@/features/student/studentExperience";
import type { Event } from "@/types/domain";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

type DashboardEvent = Event & {
  dashboardStatus: "Ongoing" | "Upcoming";
};

function dashboardEventList(events: Event[]): DashboardEvent[] {
  const now = Date.now();
  return events
    .filter((event) => new Date(event.endsAt ?? event.startsAt).getTime() >= now)
    .map((event) => ({
      ...event,
      dashboardStatus: new Date(event.startsAt).getTime() <= now ? "Ongoing" : "Upcoming"
    }));
}

function buildMonthGrid(anchor: Date) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: Array<Date | null> = [];
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function AuthActionRow({
  to,
  icon: Icon,
  label,
  description
}: {
  to: string;
  icon: typeof QrCode;
  label: string;
  description: string;
}) {
  return (
    <NavLink
      to={to}
      className="group flex items-center gap-3 rounded-xl border bg-background p-3 transition-colors hover:border-primary/30"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    </NavLink>
  );
}

function MetricLink({
  to,
  children,
  label
}: {
  to: string;
  children: ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      aria-label={label}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="h-full transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
        {children}
      </div>
    </NavLink>
  );
}

function MetricButton({
  children,
  label,
  onClick
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="group block h-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="h-full transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md">
        {children}
      </div>
    </button>
  );
}

export function StudentDashboardPage() {
  const scope = useStudentScope();
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [qrReady, setQrReady] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  useEffect(() => {
    setQrReady(Boolean(ensureStudentIdentityReadiness(scope.student).qrCode));
  }, [scope.student]);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in account does not have an active student profile." />;
  }

  if (eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading) {
    return <LoadingState label="Loading dashboard" />;
  }

  if (eventsQuery.isError || sessionsQuery.isError || recordsQuery.isError) {
    return <ErrorState title="Unable to load dashboard" message="Please try refreshing the page." />;
  }

  const student = scope.student;
  const events = studentVisibleEvents(eventsQuery.data?.items ?? []);
  const sortedEvents = [...events].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const dashboardEvents = dashboardEventList(sortedEvents);
  const upcomingEvents = dashboardEvents.filter((event) => event.dashboardStatus === "Upcoming");

  const eventRecords = getStudentEventRecords({
    studentId: student.id,
    records: recordsQuery.data?.items ?? [],
    sessions: sessionsQuery.data?.items ?? [],
    events: eventsQuery.data?.items ?? []
  });
  const eventMetrics = getStudentEventMetrics(eventRecords, student.id);
  const attendedCount = eventMetrics.attendedCount;
  const attendanceRate = eventMetrics.attendanceRate;
  const pendingFeedback = eventMetrics.feedbackDue;
  const pendingFeedbackRecords = eventMetrics.attendedRecords.filter(
    (record) => !record.feedbackSubmitted && !isFeedbackSubmitted(student.id, record.eventId)
  );
  const eventDateKeys = new Set(events.map((event) => dateKey(event.startsAt)).filter(Boolean));
  const selectedDateEvents = events.filter((event) => dateKey(event.startsAt) === selectedDate);

  const calendarCells = buildMonthGrid(monthAnchor);
  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = dateKey(new Date());

  function goToMonth(offset: number) {
    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student Portal"
        title="Student dashboard"
        description="Track published events, organizer-recorded attendance, feedback tasks, and your next required action."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricLink to={APP_ROUTES.studentAttendance} label="Open attended event records">
          <StatCard title="Events Attended" value={String(attendedCount)} description="Open attendance records" icon={CalendarCheck} />
        </MetricLink>
        <MetricLink to={APP_ROUTES.studentAttendance} label="Open attendance records">
          <StatCard title="Attendance Rate" value={`${attendanceRate}%`} description="Review attendance records" icon={History} tone={attendanceRate < 80 ? "warning" : "success"} />
        </MetricLink>
        <MetricLink to={APP_ROUTES.studentUpcomingEvents} label="Open event cards">
          <StatCard title="Events" value={String(upcomingEvents.length)} description="Browse event cards" icon={CalendarDays} />
        </MetricLink>
        <MetricButton label="Open feedback tasks" onClick={() => setFeedbackModalOpen(true)}>
          <div
            className={`relative h-full overflow-hidden rounded-xl border p-4 shadow-sm transition-colors ${
              pendingFeedback ? "border-primary/30 bg-primary/10" : "bg-surface"
            }`}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/80 via-primary/30 to-transparent opacity-80" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquareText className="h-3.5 w-3.5 text-primary" />
                  Pending Feedback
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{pendingFeedback}</p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-primary shadow-sm transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-background/80 px-3 py-2">
              <span className="text-xs font-semibold text-foreground">
                {pendingFeedback ? "View feedback tasks" : "Open feedback panel"}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">Click</span>
            </div>
          </div>
        </MetricButton>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Events</h2>
              <p className="text-sm text-muted-foreground">Open an event to view details, resources, progress, and next action.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <NavLink to={APP_ROUTES.studentUpcomingEvents}>
                View all
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </NavLink>
            </Button>
          </div>

          <div className="mt-5 grid gap-3">
            {dashboardEvents.length ? dashboardEvents.map((event) => (
              <NavLink
                key={event.id}
                to={APP_ROUTES.studentEvent(event.id)}
                className={`group flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-background p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  event.dashboardStatus === "Ongoing"
                    ? "border-primary/40 shadow-sm ring-1 ring-primary/10 hover:border-primary/60"
                    : "hover:border-primary/30"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                    event.dashboardStatus === "Ongoing"
                      ? "bg-primary text-primary-foreground"
                      : "bg-gradient-to-br from-primary/20 to-primary/5"
                  }`}>
                    <CalendarDays className={`h-4 w-4 ${event.dashboardStatus === "Ongoing" ? "text-primary-foreground" : "text-primary"}`} />
                  </span>
                  <div>
                    <h3 className="font-semibold leading-tight">{event.title}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      {formatDisplayDate(event.startsAt)} at {formatDisplayTime(event.startsAt)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      {event.venue}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    event.dashboardStatus === "Ongoing"
                      ? "bg-primary/10 text-primary"
                      : "bg-info/10 text-info"
                  }`}>
                    {event.dashboardStatus}
                  </span>
                </div>
              </NavLink>
            )) : <EmptyState title="No upcoming events" description="Published events will appear here." />}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Calendar</h2>
              <p className="text-sm text-muted-foreground">Select a date to highlight scheduled events.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <NavLink to={`${APP_ROUTES.studentUpcomingEvents}?view=calendar&tab=upcoming&date=${selectedDate}`}>
                  View all
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </NavLink>
              </Button>
              <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => goToMonth(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-background"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => goToMonth(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-background"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <p className="mt-3 text-sm font-semibold">{monthLabel}</p>

          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
            {WEEKDAY_LABELS.map((label, index) => (
              <div key={`${label}-${index}`} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {calendarCells.map((day, index) => {
              if (!day) {
                return <div key={`blank-${index}`} className="h-10" />;
              }
              const key = dateKey(day);
              const hasEvent = eventDateKeys.has(key);
              const selected = key === selectedDate;
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`relative h-10 rounded-lg text-sm font-medium transition-colors ${
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isToday
                        ? "bg-primary/10 text-primary"
                        : hasEvent
                          ? "bg-highlight text-highlight-foreground hover:bg-highlight/80"
                          : "text-foreground hover:bg-muted"
                  }`}
                >
                  {day.getDate()}
                  {hasEvent && !selected && (
                    <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-current opacity-70" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-2 border-t pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            {selectedDateEvents.length ? selectedDateEvents.map((event) => (
              <div key={event.id} className="rounded-xl border bg-background p-3 text-sm transition-colors hover:border-primary/30">
                <p className="font-semibold">{event.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                  {formatDisplayTime(event.startsAt)} · {event.venue}
                </p>
              </div>
            )) : <p className="text-sm text-muted-foreground">No event selected for this date.</p>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-primary/5">
              <FilePenLine className="h-4 w-4 text-primary" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Things To Do</h2>
              <p className="text-sm text-muted-foreground">Anything that needs your action shows up here.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {pendingFeedback > 0 ? (
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-warning/15">
                    <MessageSquareText className="h-4 w-4 text-warning" />
                  </span>
                  <div>
                    <p className="font-semibold">
                      Give feedback on {pendingFeedback} event{pendingFeedback === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You attended {pendingFeedback === 1 ? "an event that's" : "events that are"} asking for a
                      quick feedback form.
                    </p>
                  </div>
                </div>
                <Button type="button" size="sm" className="mt-3" onClick={() => setFeedbackModalOpen(true)}>
                  Give Feedback
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">You're all caught up — nothing pending right now.</p>
              </div>
            )}

            <div className="rounded-xl border bg-background p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <QrCode className="h-3.5 w-3.5" />
                How attendance works
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Just show your QR code when it's time to check in. The organizer scans it to record your Time
                In and Time Out — you don't need to do anything else.
              </p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Attendance Methods</h2>
                <p className="text-sm text-muted-foreground">Your QR code for checking in and out, plus your attendance history.</p>
              </div>
            </div>
            <span
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                qrReady ? "bg-emerald-500/10 text-emerald-600" : "bg-warning/10 text-warning"
              }`}
            >
              {qrReady ? <CheckCircle2 className="h-3 w-3" /> : <QrCode className="h-3 w-3" />}
              {qrReady ? "QR code ready" : "QR code not set up"}
            </span>
          </div>
          <div className="mt-5 grid gap-2">
            <AuthActionRow
              to={APP_ROUTES.studentMethods}
              icon={QrCode}
              label="Show QR UID"
              description="The code organizers scan for your Time In and Time Out"
            />
            <AuthActionRow
              to={APP_ROUTES.studentAttendance}
              icon={History}
              label="Review Records"
              description="See your past check-ins and attendance status per event"
            />
          </div>
        </div>
      </section>

      <ModalShell
        open={feedbackModalOpen}
        title="Pending Feedback"
        description="These attended events still need action before attendance is marked complete."
        size="lg"
        onClose={() => setFeedbackModalOpen(false)}
      >
        {pendingFeedbackRecords.length ? (
          <div className="space-y-3">
            {pendingFeedbackRecords.map((record) => {
              const needsLateReason = record.status === "late" && !record.lateReason;
              const target = `${APP_ROUTES.studentAttendance}?status=feedback-due&focus=${encodeURIComponent(record.eventId)}`;

              return (
                <article key={record.id} className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {record.eventCode} - {record.category}
                      </p>
                      <h3 className="mt-1 text-base font-semibold tracking-tight">{record.eventName}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-primary" />
                          {formatDisplayDate(record.startsAt)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          {formatDisplayTime(record.startsAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <StatusBadge label={record.status} tone={statusTone(record.status)} />
                      <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                        {needsLateReason ? "Late reason first" : "Feedback due"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {needsLateReason
                        ? "Submit your late reason first. The event feedback unlocks after that."
                        : "Answer the event feedback to complete this attendance record."}
                    </p>
                    <Button asChild size="sm">
                      <NavLink to={target}>
                        {needsLateReason ? "Submit Late Reason" : "Answer Feedback"}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </NavLink>
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-success/20 bg-success/10 p-5">
            <p className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" />
              No pending feedback right now.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Completed attendance records are already settled.</p>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
