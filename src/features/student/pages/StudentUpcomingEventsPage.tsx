import { useState } from "react";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  LayoutList,
  Layers,
  MapPin,
  Radio,
  Search,
  SlidersHorizontal
} from "lucide-react";
import { NavLink, useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useAttendanceRecords, useAttendanceSessions, useCorrectionRequests, useEvents } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import {
  buildStudentEventWorkflow,
  countdownLabel,
  eventResourceLabel,
  getEventObjectives,
  getStudentEventRecords,
  hasEventResource,
  isFeedbackSubmitted,
  studentVisibleEvents,
  useStudentScope
} from "@/features/student/studentExperience";
import type { AttendanceSession, Event } from "@/types/domain";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type EventListTab = "ongoing" | "upcoming";

function buildCalendarGrid(monthCursor: Date) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: Array<{ date: Date; key: string } | null> = [];
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({ date, key: date.toDateString() });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function tomorrowIsoAt(hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function relativeNowIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function buildTodayDemoEvent() {
  const event: Event = {
    id: "demo-today-career-clinic",
    code: "EVT-2026-005",
    organizerId: "organizer-1",
    departmentId: "dept-ccs",
    category: "Career Development",
    title: "Sustainable Tourism Speaker Series",
    venue: "PLP Multi-Purpose Hall",
    startsAt: relativeNowIso(90),
    endsAt: relativeNowIso(210),
    status: "approved"
  };
  const session: AttendanceSession = {
    id: "demo-today-career-clinic-session",
    type: "event",
    eventId: event.id,
    title: "Sustainable Tourism Speaker Series Attendance",
    mode: "required",
    status: "draft",
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    lateCutoffAt: relativeNowIso(105),
    attendanceWindowStartAt: relativeNowIso(85),
    attendanceWindowEndAt: event.endsAt,
    createdByUserId: "user-organizer-1"
  };
  return { event, session };
}

function buildOngoingTodayDemoEvent() {
  const event: Event = {
    id: "demo-today-wellness-check-in",
    code: "EVT-2026-LIVE",
    organizerId: "organizer-1",
    departmentId: "dept-ccs",
    category: "Student Wellness",
    title: "Live QR & Facial Check-in Drill",
    venue: "PLP HM Training Laboratory",
    startsAt: relativeNowIso(-30),
    endsAt: relativeNowIso(90),
    status: "approved"
  };
  const session: AttendanceSession = {
    id: "demo-today-wellness-check-in-session",
    type: "event",
    eventId: event.id,
    title: "Live QR & Facial Check-in Drill Attendance",
    mode: "required",
    status: "active",
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    lateCutoffAt: relativeNowIso(-15),
    attendanceWindowStartAt: relativeNowIso(-35),
    attendanceWindowEndAt: event.endsAt,
    createdByUserId: "user-organizer-1"
  };
  return { event, session };
}

function buildUpcomingDemoEvent() {
  const event: Event = {
    id: "demo-upcoming-ai-ethics-forum",
    code: "EVT-2026-006",
    organizerId: "organizer-1",
    departmentId: "dept-ccs",
    category: "Competition",
    title: "AHTOMP Culinary & Mixology Showcase",
    venue: "PLP HM Culinary Kitchen",
    startsAt: tomorrowIsoAt(9),
    endsAt: tomorrowIsoAt(11),
    status: "approved"
  };
  const session: AttendanceSession = {
    id: "demo-upcoming-ai-ethics-forum-session",
    type: "event",
    eventId: event.id,
    title: "AHTOMP Culinary & Mixology Showcase Attendance",
    mode: "required",
    status: "draft",
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    lateCutoffAt: tomorrowIsoAt(9, 15),
    attendanceWindowStartAt: tomorrowIsoAt(8, 55),
    attendanceWindowEndAt: event.endsAt,
    createdByUserId: "user-organizer-1"
  };
  return { event, session };
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isEventStillInStudentEventsFlow(state: string) {
  return ["Session Not Started", "Waiting for Time In", "Pending Time Out", "Late Reason Required"].includes(state);
}

function isOngoingEvent(event: Event) {
  const now = Date.now();
  return new Date(event.startsAt).getTime() <= now && now < new Date(event.endsAt).getTime();
}

function isScheduledToday(event: Event) {
  const startsAt = new Date(event.startsAt);
  const today = new Date();
  return startsAt.toDateString() === today.toDateString();
}

function eventTimingBadge(event: Event) {
  if (isOngoingEvent(event)) return { label: "Ongoing", tone: "warning" as const };
  if (isScheduledToday(event)) return { label: "Scheduled Today", tone: "info" as const };
  return { label: countdownLabel(event.startsAt), tone: "info" as const };
}

export function StudentUpcomingEventsPage() {
  const scope = useStudentScope();
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [activeTab, setActiveTab] = useState<EventListTab>(() =>
    searchParams.get("tab") === "upcoming" || searchParams.get("view") === "calendar" ? "upcoming" : "ongoing"
  );
  const [view, setView] = useState<"list" | "calendar">(() => (searchParams.get("view") === "calendar" ? "calendar" : "list"));
  const [monthCursor, setMonthCursor] = useState(() => {
    const requestedDate = searchParams.get("date");
    const anchor = requestedDate ? new Date(`${requestedDate}T00:00:00`) : new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => {
    const requestedDate = searchParams.get("date");
    return requestedDate ? new Date(`${requestedDate}T00:00:00`).toDateString() : null;
  });

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in account does not have an active student profile." />;
  }

  if (eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || correctionsQuery.isLoading) {
    return <LoadingState label="Loading upcoming events" />;
  }

  if (eventsQuery.isError || sessionsQuery.isError || recordsQuery.isError || correctionsQuery.isError) {
    return <ErrorState title="Unable to load events" message="Please try refreshing the page." />;
  }

  const student = scope.student;
  const events = studentVisibleEvents(eventsQuery.data?.items ?? []);
  const eventRecords = getStudentEventRecords({
    studentId: student.id,
    records: recordsQuery.data?.items ?? [],
    sessions: sessionsQuery.data?.items ?? [],
    events: eventsQuery.data?.items ?? []
  });

  const allWorkflows = events.map((event) => {
    const record = eventRecords.find((entry) => entry.eventId === event.id);
    const session = (sessionsQuery.data?.items ?? []).find((entry) => entry.eventId === event.id);
    const correction = (correctionsQuery.data?.items ?? []).find((entry) => entry.eventId === event.id);
    return {
      event,
      workflow: buildStudentEventWorkflow({
        event,
        session,
        record,
        feedbackSubmitted: Boolean(record?.feedbackSubmitted || isFeedbackSubmitted(student.id, event.id)),
        correctionStatus: correction?.status
      })
    };
  });

  const today = new Date();
  const todayStart = startOfLocalDay(today);
  const tomorrowStart = todayStart + 86_400_000;
  const actionableWorkflows = allWorkflows.filter(({ workflow }) => isEventStillInStudentEventsFlow(workflow.state));
  const todayDemo = buildTodayDemoEvent();
  const ongoingDemo = buildOngoingTodayDemoEvent();
  const upcomingDemo = buildUpcomingDemoEvent();
  const ongoingFallbackWorkflow = {
    event: ongoingDemo.event,
    workflow: buildStudentEventWorkflow({
      event: ongoingDemo.event,
      session: ongoingDemo.session,
      feedbackSubmitted: false
    })
  };
  const scheduledFallbackWorkflow = {
    event: todayDemo.event,
    workflow: buildStudentEventWorkflow({
      event: todayDemo.event,
      session: todayDemo.session,
      feedbackSubmitted: false
    })
  };
  const upcomingFallbackWorkflow = {
    event: upcomingDemo.event,
    workflow: buildStudentEventWorkflow({
      event: upcomingDemo.event,
      session: upcomingDemo.session,
      feedbackSubmitted: false
    })
  };

  // "Ongoing" tab — the event(s) whose attendance window is active right now, only.
  const ongoingWorkflowsFromRepository = actionableWorkflows.filter(({ event }) => isOngoingEvent(event));
  const ongoingWorkflows = ongoingWorkflowsFromRepository.length ? ongoingWorkflowsFromRepository : [ongoingFallbackWorkflow];

  // "Upcoming" tab — only events that have not started yet. Anything already
  // underway belongs in the Ongoing tab, and anything already finished has no
  // place in either list.
  const now = Date.now();
  const upcomingWorkflowsFromRepository = actionableWorkflows.filter(({ event }) => new Date(event.startsAt).getTime() > now);
  const hasScheduledToday = upcomingWorkflowsFromRepository.some(({ event }) => {
    const startsAt = new Date(event.startsAt).getTime();
    return startsAt >= todayStart && startsAt < tomorrowStart;
  });
  const hasFutureUpcoming = upcomingWorkflowsFromRepository.some(({ event }) => new Date(event.startsAt).getTime() >= tomorrowStart);
  const upcomingWorkflows = [
    ...upcomingWorkflowsFromRepository,
    ...(hasScheduledToday ? [] : [scheduledFallbackWorkflow]),
    ...(hasFutureUpcoming ? [] : [upcomingFallbackWorkflow])
  ]
    .filter(({ event }) => new Date(event.startsAt).getTime() > now)
    .sort((left, right) => new Date(left.event.startsAt).getTime() - new Date(right.event.startsAt).getTime());

  const tabWorkflows = activeTab === "ongoing" ? ongoingWorkflows : upcomingWorkflows;

  const workflows = tabWorkflows.filter(({ event, workflow }) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [event.title, event.code, event.category, event.venue].some((value) => value.toLowerCase().includes(term));
    const matchesAction = !actionFilter || workflow.state === actionFilter;
    return matchesSearch && matchesAction;
  });

  // Calendar always reflects the full upcoming list (not just the current month's
  // search/filter results are still respected, but the tab restriction to
  // "upcoming" events specifically is what guarantees these are incoming events).
  const calendarCells = buildCalendarGrid(monthCursor);
  const eventsByDay = new Map<string, typeof workflows>();
  workflows.forEach((entry) => {
    const dayKey = new Date(entry.event.startsAt).toDateString();
    const bucket = eventsByDay.get(dayKey) ?? [];
    bucket.push(entry);
    eventsByDay.set(dayKey, bucket);
  });

  const selectedDayEvents = selectedDayKey ? eventsByDay.get(selectedDayKey) ?? [] : [];
  const monthLabel = monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function goToMonth(offset: number) {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    setSelectedDayKey(null);
  }

  function goToToday() {
    const now = new Date();
    setMonthCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDayKey(now.toDateString());
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Events"
        title="Events"
        description="Review events you still need to attend today or in the future. Completed attendance is kept in Attendance Records."
      />

      <section className="relative space-y-4 overflow-hidden rounded-2xl border bg-surface p-4 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
            {([
              { id: "ongoing", label: "Ongoing", count: ongoingWorkflows.length },
              { id: "upcoming", label: "Upcoming", count: upcomingWorkflows.length }
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedDayKey(null);
                }}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                }`}
              >
                {tab.id === "ongoing" && (
                  <span className="relative flex h-2 w-2">
                    {activeTab === "ongoing" && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                    )}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${activeTab === "ongoing" ? "bg-white" : "bg-primary"}`} />
                  </span>
                )}
                {tab.label}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activeTab === tab.id ? "bg-white/20" : "bg-background text-muted-foreground"}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {activeTab === "upcoming" && (
            <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="List view"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  view === "list"
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                }`}
              >
                <LayoutList className="h-4 w-4" />
                List
              </button>
              <button
                type="button"
                onClick={() => {
                  setView("calendar");
                  setSelectedDayKey(null);
                }}
                aria-label="Calendar view"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                  view === "calendar"
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                }`}
              >
                <CalendarRange className="h-4 w-4" />
                Calendar
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-3 border-t pt-4 md:grid-cols-[minmax(0,1fr)_240px]">
          <label className="group flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 text-sm transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
            <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              placeholder="Search event, code, venue..."
            />
          </label>
          <label className="relative flex h-11 items-center">
            <SlidersHorizontal className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <select
              className="plpass-select pl-9"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            >
              <option value="">All actions</option>
              <option value="Session Not Started">Session Not Started</option>
              <option value="Waiting for Time In">Waiting for Time In</option>
              <option value="Pending Time Out">Pending Time Out</option>
              <option value="Late Reason Required">Late Reason Required</option>
            </select>
          </label>
        </div>
      </section>

      {activeTab === "ongoing" ? (
        workflows.length ? (
          <div className="grid gap-4">
            {workflows.map(({ event, workflow }) => (
              <article
                key={event.id}
                className="relative overflow-hidden rounded-2xl border border-primary/30 bg-surface shadow-sm ring-1 ring-primary/10"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/70 to-primary/30" />
                <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative grid gap-5 p-5 pt-6 lg:grid-cols-[minmax(0,1fr)_240px] lg:p-6 lg:pt-7">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{event.category}</p>
                        <h3 className="mt-1 text-xl font-semibold leading-tight tracking-tight">{event.title}</h3>
                      </div>
                      <StatusBadge label="Ongoing" tone="warning" />
                    </div>
                    <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary/5">
                          <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        </span>
                        {formatDisplayDate(event.startsAt)}
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary/5">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                        </span>
                        {formatDisplayTime(event.startsAt)} – {formatDisplayTime(event.endsAt)}
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary/5">
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                        </span>
                        {event.venue}
                      </p>
                    </div>
                    <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                      <Radio className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-semibold text-primary">Active attendance window</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Present your QR UID to the organizer. The organizer records Time In and Time Out.
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border bg-background p-4 transition hover:border-primary/30">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <Layers className="h-3.5 w-3.5" />
                          Objectives
                        </p>
                        <ul className="mt-2.5 space-y-1.5 text-sm text-muted-foreground">
                          {getEventObjectives(event).slice(0, 3).map((objective) => (
                            <li key={objective} className="flex gap-2">
                              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground/50" />
                              {objective}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-xl border bg-background p-4 transition hover:border-primary/30">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          Resources
                        </p>
                        <p className="mt-2.5 text-sm font-semibold">{eventResourceLabel(event)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {hasEventResource(event) ? "Attachment or external link from organizer" : "Organizer has not attached a resource."}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 w-full justify-center"
                          disabled={!hasEventResource(event)}
                        >
                          <Download className="mr-2 h-3.5 w-3.5" />
                          Open / Download
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 rounded-xl border bg-background p-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">My status</p>
                      <div className="mt-2">
                        <StatusBadge label={workflow.attendanceLabel} tone={workflow.stateTone} />
                      </div>
                    </div>
                    <div className="space-y-2 border-t pt-4">
                      <p className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Time In</span>
                        <span className="font-semibold text-foreground">{workflow.timeInLabel}</span>
                      </p>
                      <p className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Time Out</span>
                        <span className="font-semibold text-foreground">{workflow.timeOutLabel}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No ongoing event"
            description="When an event's attendance window opens, it will appear here for you to check in."
          />
        )
      ) : view === "calendar" ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                  <CalendarRange className="h-4.5 w-4.5 text-primary" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Calendar</p>
                  <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{monthLabel}</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goToToday}
                  className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  Today
                </button>
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

            <div className="grid grid-cols-7 gap-1.5 border-b pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="py-1">
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, index) => {
                if (!cell) {
                  return <div key={`blank-${index}`} className="min-h-24" />;
                }
                const dayEvents = eventsByDay.get(cell.key) ?? [];
                const isToday = cell.key === new Date().toDateString();
                const isSelected = cell.key === selectedDayKey;
                const visibleEvents = dayEvents.slice(0, 2);
                const overflowCount = dayEvents.length - visibleEvents.length;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelectedDayKey(cell.key === selectedDayKey ? null : cell.key)}
                    className={`flex min-h-24 flex-col items-stretch gap-1 rounded-xl border p-1.5 text-left transition-all duration-150 ${
                      isSelected
                        ? "border-primary/60 bg-primary/[0.07] shadow-sm ring-1 ring-primary/20"
                        : isToday
                          ? "border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08]"
                          : "border-transparent bg-background/50 hover:border-border hover:bg-muted/70"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                          isToday ? "bg-primary text-primary-foreground" : isSelected ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {cell.date.getDate()}
                      </span>
                    </span>
                    <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                      {visibleEvents.map(({ event }) => {
                        const isActive = isOngoingEvent(event);
                        return (
                          <span
                            key={event.id}
                            className={`flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${
                              isActive ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${isActive ? "bg-warning" : "bg-primary"}`}
                            />
                            <span className="truncate">{event.title}</span>
                          </span>
                        );
                      })}
                      {overflowCount > 0 && (
                        <span className="truncate px-1.5 text-[10px] font-semibold text-muted-foreground">
                          +{overflowCount} more
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Upcoming
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Ongoing today
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
                <CalendarDays className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {selectedDayKey ? "Selected day" : "No day selected"}
                </p>
                <p className="truncate text-sm font-semibold">
                  {selectedDayKey
                    ? new Date(selectedDayKey).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
                    : "Tap a date to view its events"}
                </p>
              </div>
            </div>

            {!selectedDayKey && (
              <p className="mt-4 rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                Days with a dot underneath have events scheduled. Select one to see the details here.
              </p>
            )}

            {selectedDayKey && selectedDayEvents.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                No events scheduled on this day.
              </p>
            )}

            <div className="mt-4 space-y-3">
              {selectedDayEvents
                .slice()
                .sort((left, right) => new Date(left.event.startsAt).getTime() - new Date(right.event.startsAt).getTime())
                .map(({ event, workflow }) => {
                  const isActive = isOngoingEvent(event);
                  return (
                    <NavLink
                      key={event.id}
                      to={APP_ROUTES.studentEvent(event.id)}
                      className={`block rounded-xl border-l-[3px] bg-background p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
                        isActive ? "border-l-warning" : "border-l-primary/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {event.category}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-semibold">{event.title}</p>
                        </div>
                        {isActive && <StatusBadge label="Ongoing" tone="warning" />}
                      </div>
                      <div className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                        <p className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                          {formatDisplayTime(event.startsAt)} – {formatDisplayTime(event.endsAt)}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                          {event.venue}
                        </p>
                      </div>
                      <div className="mt-3 border-t pt-2.5">
                        <StatusBadge label={`My attendance: ${workflow.attendanceLabel}`} tone={workflow.stateTone} />
                      </div>
                    </NavLink>
                  );
                })}
            </div>
          </div>
        </section>
      ) : workflows.length ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {workflows.map(({ event, workflow }) => {
            const objectives = getEventObjectives(event);
            const timingBadge = eventTimingBadge(event);
            return (
              <article
                key={event.id}
                className="group relative flex flex-col overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-primary to-primary/30 transition-transform duration-200 group-hover:scale-x-100" />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {event.category}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold leading-tight tracking-tight">{event.title}</h3>
                  </div>
                  <StatusBadge label={timingBadge.label} tone={timingBadge.tone} />
                </div>

                <div className="mt-5 grid gap-2.5 text-sm">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary/5">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                    </span>
                    {formatDisplayDate(event.startsAt)}
                    <span className="text-muted-foreground/40">·</span>
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary/5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                    </span>
                    {formatDisplayTime(event.startsAt)} – {formatDisplayTime(event.endsAt)}
                  </p>
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/20 to-primary/5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                    </span>
                    {event.venue}
                  </p>
                </div>

                <div className="mt-5 flex-1 rounded-xl border bg-background p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Objectives</p>
                  <ul className="mt-2.5 space-y-1.5 text-sm text-muted-foreground">
                    {objectives.slice(0, 3).map((objective) => (
                      <li key={objective} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground/50" />
                        {objective}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
                  <StatusBadge label={`My attendance: ${workflow.attendanceLabel}`} tone={workflow.stateTone} />
                  <Button asChild size="sm">
                    <NavLink to={APP_ROUTES.studentEvent(event.id)}>View Details</NavLink>
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          title="No upcoming events"
          description="Future published events will appear here once organizers select you as an attendee."
        />
      )}
    </div>
  );
}
