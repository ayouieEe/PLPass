import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, CalendarCheck, ClipboardList, Plus, Search, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { ParticipationBarChart } from "@/components/charts/ParticipationBarChart";
import { RiskSummaryChart } from "@/components/charts/RiskSummaryChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { SelectField } from "@/components/forms/SelectField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { TextField } from "@/components/forms/TextField";
import { TimePickerField } from "@/components/forms/TimePickerField";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatCard } from "@/components/shared/StatCard";
import { DataTable } from "@/components/tables/DataTable";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { NFCReaderInput } from "@/features/attendance/NFCReaderInput";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { GenerateReportModal } from "@/features/reports/GenerateReportModal";
import { ReportFilterPanel } from "@/features/reports/ReportFilterPanel";
import { ReportHistoryTable } from "@/features/reports/ReportHistoryTable";
import { ReportPreviewCard } from "@/features/reports/ReportPreviewCard";
import type { ReportHistoryRecord } from "@/features/reports/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSimulationMutations,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useCorrectionRequests,
  useEvent,
  useEventMutations,
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { AttendanceSimulationResult } from "@/services/contracts";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
  CorrectionRequest,
  Event,
  EventParticipant,
  MlPrediction,
  Student
} from "@/types/domain";
import type {
  AttendanceStatus,
  CorrectionRequestStatus,
  EventStatus,
  RiskLevel,
  SessionStatus,
  StudentStatus,
  VerificationMethod
} from "@/types/enums";

type OrganizerScope = {
  context: RepositoryContext;
  organizerId?: string;
  organizerName: string;
  isLoading: boolean;
  isError: boolean;
};

type EventWithCount = Event & { participantCount: number };

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const eventFormSchema = z
  .object({
    code: z.string().min(2, "Event code is required."),
    title: z.string().min(3, "Event name is required."),
    category: z.string().min(2, "Category is required."),
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    endTime: z.string().min(1, "End time is required."),
    attendanceMode: z.enum(["face-to-face", "online"]),
    description: z.string().optional(),
    remarks: z.string().optional()
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must be after start time."
  });

const sessionFormSchema = z
  .object({
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required."),
    attendanceMode: z.enum(["face-to-face", "online"])
  })
  .refine((value) => value.expectedEndTime > value.startTime, {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time."
  });

type EventFormValues = z.infer<typeof eventFormSchema>;
type SessionFormValues = z.infer<typeof sessionFormSchema>;

function useOrganizerScope(): OrganizerScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" },
    organizerId: organizerQuery.data?.items[0]?.id,
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: organizerQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
}

function statusTone(status: AttendanceStatus | SessionStatus | CorrectionRequestStatus | StudentStatus | RiskLevel | EventStatus) {
  if (status === "present" || status === "completed" || status === "approved" || status === "enrolled" || status === "low") {
    return "success" as const;
  }
  if (status === "late" || status === "draft" || status === "pending" || status === "medium") {
    return "warning" as const;
  }
  if (status === "absent" || status === "cancelled" || status === "rejected" || status === "high" || status === "critical") {
    return "danger" as const;
  }
  return "muted" as const;
}

function attendanceCounts(records: AttendanceRecord[]) {
  return {
    present: records.filter((record) => record.status === "present").length,
    late: records.filter((record) => record.status === "late").length,
    absent: records.filter((record) => record.status === "absent").length,
    excused: records.filter((record) => record.status === "excused").length
  };
}

function attendanceRate(records: AttendanceRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  const attended = records.filter((record) => record.status === "present" || record.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

function eventLabel(event: Event | undefined) {
  return event ? `${event.code} - ${event.title}` : "Unknown event";
}

function studentName(student: Student | undefined) {
  return student ? student.studentNumber : "Unknown student";
}

function ShellState({ scope }: { scope: OrganizerScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading organizer workspace" />;
  }
  if (scope.isError || !scope.organizerId) {
    return <ErrorState title="Organizer profile unavailable" message="The signed-in mock account does not have an organizer profile fixture." />;
  }
  return null;
}

function OrganizerFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function recordsForSession(records: AttendanceRecord[], sessionId: string) {
  return records.filter((record) => record.sessionId === sessionId);
}

function participantStudents(participants: EventParticipant[], students: Student[]) {
  const participantIds = new Set(participants.map((participant) => participant.studentId));
  return students.filter((student) => participantIds.has(student.id));
}

function eventSemesterId(event: Event, semesters: { id: string; startsAt: string; endsAt: string }[]) {
  const eventDate = event.startsAt.slice(0, 10);
  return semesters.find((semester) => eventDate >= semester.startsAt && eventDate <= semester.endsAt)?.id;
}

function eventMatchesDateRange(event: Event, dateFrom: string, dateTo: string) {
  const date = event.startsAt.slice(0, 10);
  return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
}

function buildLiveRecords(records: AttendanceRecord[], students: Student[]): LiveAttendanceRecord[] {
  return records.map((record) => ({
    id: record.id,
    studentName: studentName(students.find((student) => student.id === record.studentId)),
    identifier: students.find((student) => student.id === record.studentId)?.studentNumber ?? record.studentId,
    status: record.status === "excused" ? "manual" : record.status,
    timestamp: formatTime(record.recordedAt)
  }));
}

export function OrganizerRootPage() {
  return <Navigate to={APP_ROUTES.organizerDashboard} replace />;
}

export function OrganizerDashboardPage() {
  const scope = useOrganizerScope();
  const [semesterId, setSemesterId] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const predictionsQuery = useMlPredictions({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || catalog.semesters.isLoading) {
    return <LoadingState label="Loading organizer dashboard" />;
  }
  if (eventsQuery.isError || sessionsQuery.isError || recordsQuery.isError) {
    return <ErrorState title="Unable to load organizer dashboard" message="The mock repositories could not load organizer dashboard data." />;
  }

  const semesters = catalog.semesters.data?.items ?? [];
  const events = (eventsQuery.data?.items ?? []).filter((event) => {
    const matchesSemester = !semesterId || eventSemesterId(event, semesters) === semesterId;
    const matchesSchoolYear = !schoolYear || semesters.find((semester) => semester.id === eventSemesterId(event, semesters))?.schoolYear === schoolYear;
    return matchesSemester && matchesSchoolYear;
  });
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const predictions = predictionsQuery.data?.items ?? [];
  const activeSession = sessions.find((session) => session.status === "active");
  const nextEvent = events.filter((event) => new Date(event.startsAt) >= new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const flagged = predictions.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical");
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const trendData = events.map((event) => {
    const eventSessions = sessions.filter((session) => session.eventId === event.id);
    const eventRecords = records.filter((record) => eventSessions.some((session) => session.id === record.sessionId));
    const counts = attendanceCounts(eventRecords);
    return { label: event.code, present: counts.present, late: counts.late, absent: counts.absent };
  });
  const riskData = events.map((event) => ({
    label: event.code,
    watchlist: predictions.filter((prediction) => prediction.eventId === event.id && prediction.riskLevel === "medium").length,
    atRisk: predictions.filter((prediction) => prediction.eventId === event.id && ["high", "critical"].includes(prediction.riskLevel)).length
  }));

  return (
    <OrganizerFrame>
      <PageHeader
        eyebrow="Organizer"
        title="Organizer dashboard"
        description="Scoped event overview, participation activity, and review-only insight signals."
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
      <section className="grid gap-3 rounded-lg border bg-surface p-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Semester</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">All semesters</option>
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>{semester.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">School year</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)}>
            <option value="">All school years</option>
            {[...new Set(semesters.map((semester) => semester.schoolYear))].map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total events" value={String(events.length)} icon={ClipboardList} />
        <StatCard title="Average participation" value={`${attendanceRate(records)}%`} icon={Users} />
        <StatCard title="Completed sessions" value={String(completedSessions.length)} icon={CalendarCheck} />
        <StatCard title="Flagged participants" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
      </section>
      {activeSession ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Active event session</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeSession.title} is currently active.</p>
          <Button className="mt-4" asChild>
            <NavLink to={APP_ROUTES.organizerSession(activeSession.id)}>Open active session</NavLink>
          </Button>
        </section>
      ) : nextEvent ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Next upcoming event</h2>
          <p className="mt-1 text-sm text-muted-foreground">{eventLabel(nextEvent)} on {formatDate(nextEvent.startsAt)}.</p>
          <Button className="mt-4" asChild variant="outline">
            <NavLink to={APP_ROUTES.organizerEvent(nextEvent.id)}>View event</NavLink>
          </Button>
        </section>
      ) : (
        <EmptyState title="No active or upcoming event" description="Create an event to populate your organizer schedule." />
      )}
      <section className="grid gap-4 xl:grid-cols-2">
        <AttendanceTrendChart data={trendData} />
        <RiskSummaryChart data={riskData} />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Upcoming event schedule</h2>
          <div className="mt-4 space-y-3">
            {events.length ? events.map((event) => <EventScheduleCard key={event.id} event={event} />) : <EmptyState title="No events" />}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Attention-needed participants</h2>
          <div className="mt-4 space-y-3">
            {flagged.length ? flagged.map((prediction) => <PredictionCard key={prediction.id} prediction={prediction} />) : <EmptyState title="No flagged participants" description="No high-risk mock predictions are tied to your events." />}
          </div>
        </div>
      </section>
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Recent completed event sessions</h2>
        <div className="mt-4 grid gap-3">
          {completedSessions.length ? completedSessions.slice(0, 4).map((session) => <SessionCard key={session.id} session={session} />) : <EmptyState title="No completed event sessions" />}
        </div>
      </section>
    </OrganizerFrame>
  );
}

function EventScheduleCard({ event }: { event: Event }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{eventLabel(event)}</p>
          <p className="text-sm text-muted-foreground">{formatDate(event.startsAt)} {formatTime(event.startsAt)} - {formatTime(event.endsAt)} - {event.venue}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.organizerEvent(event.id)}>View</NavLink>
        </Button>
      </div>
    </article>
  );
}

function PredictionCard({ prediction }: { prediction: MlPrediction }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{prediction.patternLabel}</p>
          <p className="text-sm text-muted-foreground">{prediction.explanation}</p>
        </div>
        <StatusBadge label={prediction.riskLevel} tone={statusTone(prediction.riskLevel)} />
      </div>
    </article>
  );
}

function SessionCard({ session }: { session: AttendanceSession }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{session.title}</p>
          <p className="text-sm text-muted-foreground">{formatDate(session.startsAt)} {formatTime(session.startsAt)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.organizerSession(session.id)}>View session</NavLink>
        </Button>
      </div>
    </article>
  );
}

export function OrganizerEventsPage() {
  const scope = useOrganizerScope();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [venue, setVenue] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"table" | "calendar">("table");
  const eventsQuery = useEvents({ pageSize: 100, search }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (eventsQuery.isLoading || sessionsQuery.isLoading) {
    return <LoadingState label="Loading events" />;
  }
  if (eventsQuery.isError) {
    return <ErrorState title="Unable to load events" message="The mock event repository returned an error." />;
  }
  const events = (eventsQuery.data?.items ?? []).filter(
    (event) =>
      (status === "all" || event.status === status) &&
      (!category || event.category === category) &&
      (!venue || event.venue === venue) &&
      eventMatchesDateRange(event, dateFrom, dateTo)
  );
  const categories = [...new Set((eventsQuery.data?.items ?? []).map((event) => event.category))];
  const venues = [...new Set((eventsQuery.data?.items ?? []).map((event) => event.venue))];
  const columns: ColumnDef<EventWithCount>[] = [
    { accessorKey: "code", header: "Event code" },
    { accessorKey: "title", header: "Event name" },
    { accessorKey: "category", header: "Category" },
    { accessorKey: "venue", header: "Venue" },
    { id: "date", header: "Date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { id: "start", header: "Start time", cell: ({ row }) => formatTime(row.original.startsAt) },
    { id: "end", header: "End time", cell: ({ row }) => formatTime(row.original.endsAt) },
    { accessorKey: "participantCount", header: "Participant count" },
    { id: "approval", header: "Approval status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "status", header: "Event status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "action", header: "View", cell: ({ row }) => <Button asChild variant="outline" size="sm"><NavLink to={APP_ROUTES.organizerEvent(row.original.id)}>View event</NavLink></Button> }
  ];
  const rows = events.map((event) => ({ ...event, participantCount: 0 }));
  return (
    <OrganizerFrame>
      <PageHeader
        eyebrow="Organizer"
        title="Events"
        description="Manage owned events with table and schedule views."
        actions={<Button asChild><NavLink to={APP_ROUTES.organizerCreateEvent}><Plus className="h-4 w-4" aria-hidden="true" />Create Event</NavLink></Button>}
      />
      <FilterBar
        search={search}
        selectedFilter={status}
        filters={[{ label: "All", value: "all" }, { label: "Pending", value: "pending" }, { label: "Approved", value: "approved" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }]}
        onSearchChange={setSearch}
        onFilterChange={setStatus}
      />
      <section className="grid gap-3 rounded-lg border bg-surface p-4 md:grid-cols-4">
        <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category filter">
          <option value="">All categories</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={venue} onChange={(event) => setVenue(event.target.value)} aria-label="Venue filter">
          <option value="">All venues</option>
          {venues.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input className="plpass-field h-10 rounded-md border px-3 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Date from" />
        <input className="plpass-field h-10 rounded-md border px-3 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Date to" />
      </section>
      <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-3">
        <Button type="button" variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>Table view</Button>
        <Button type="button" variant={view === "calendar" ? "default" : "outline"} onClick={() => setView("calendar")}>Schedule view</Button>
      </div>
      {view === "table" ? (
        <DataTable data={rows} columns={columns} emptyTitle="No events found" emptyDescription="No organizer-owned events match the selected filters." />
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.length ? events.map((event) => <EventScheduleCard key={event.id} event={event} />) : <EmptyState title="No scheduled events" />}
        </section>
      )}
    </OrganizerFrame>
  );
}

export function OrganizerCreateEventPage() {
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [programId, setProgramId] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [section, setSection] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [participantError, setParticipantError] = useState("");
  const studentsQuery = useStudents({ pageSize: 500, search, programId: programId || undefined, yearLevel: yearLevel ? Number(yearLevel) : undefined, section: section || undefined }, scope.context);
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const mutations = useEventMutations(scope.context);
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: { code: "", title: "", category: "", venue: "", date: "", startTime: "", endTime: "", attendanceMode: "face-to-face", description: "", remarks: "" }
  });
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (studentsQuery.isLoading || catalog.programs.isLoading) {
    return <LoadingState label="Loading participant selector" />;
  }
  const students = studentsQuery.data?.items ?? [];
  const selectedStudents = selectedIds.map((id) => studentsQuery.data?.items.find((student) => student.id === id)).filter((student): student is Student => Boolean(student));
  function toggleStudent(studentId: string) {
    setSelectedIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]);
    setParticipantError("");
  }
  function selectAllFiltered() {
    setSelectedIds((current) => [...new Set([...current, ...students.map((student) => student.id)])]);
    setParticipantError("");
  }
  async function onSubmit(values: EventFormValues) {
    if (selectedIds.length === 0) {
      setParticipantError("Select at least one participant.");
      return;
    }
    const event = await mutations.createEventMutation.mutateAsync({ ...values, participantStudentIds: selectedIds });
    navigate(APP_ROUTES.organizerEvent(event.id));
  }
  return (
    <OrganizerFrame>
      <PageHeader eyebrow="Organizer" title="Create Event" description="Create a pending mock event and participant records through the repository layer." />
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <section className="grid gap-4 rounded-lg border bg-surface p-5 md:grid-cols-2">
          <TextField control={form.control} name="code" label="Event code" />
          <TextField control={form.control} name="title" label="Event name" />
          <TextField control={form.control} name="category" label="Category" />
          <TextField control={form.control} name="venue" label="Venue" />
          <DatePickerField control={form.control} name="date" label="Date" />
          <TimePickerField control={form.control} name="startTime" label="Start time" />
          <TimePickerField control={form.control} name="endTime" label="End time" />
          <SelectField control={form.control} name="attendanceMode" label="Attendance mode" options={[{ label: "Face-to-face", value: "face-to-face" }, { label: "Online", value: "online" }]} />
          <div className="md:col-span-2">
            <TextAreaField control={form.control} name="description" label="Description" />
          </div>
          <div className="md:col-span-2">
            <TextAreaField control={form.control} name="remarks" label="Remarks" />
          </div>
        </section>
        <section className="space-y-4 rounded-lg border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Participant selection</h2>
              <p className="text-sm text-muted-foreground">{selectedIds.length} selected participants</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={selectAllFiltered}>Select all filtered students</Button>
              <Button type="button" variant="outline" onClick={() => setSelectedIds([])}>Clear selected students</Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <SearchInput value={search} placeholder="Search students" onChange={setSearch} />
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={programId} onChange={(event) => setProgramId(event.target.value)} aria-label="Program filter">
              <option value="">All programs</option>
              {catalog.programs.data?.items.map((program) => <option key={program.id} value={program.id}>{program.code}</option>)}
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={yearLevel} onChange={(event) => setYearLevel(event.target.value)} aria-label="Year level filter">
              <option value="">All year levels</option>
              {[1, 2, 3, 4].map((level) => <option key={level} value={String(level)}>Year {level}</option>)}
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={section} onChange={(event) => setSection(event.target.value)} aria-label="Section filter">
              <option value="">All sections</option>
              {["A", "B"].map((item) => <option key={item} value={item}>Section {item}</option>)}
            </select>
          </div>
          {participantError ? <p className="text-sm text-danger">{participantError}</p> : null}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {students.length ? students.map((student) => (
              <label key={student.id} className="flex items-center gap-3 rounded-lg border bg-background p-3 text-sm">
                <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                <span>
                  <span className="block font-medium">{student.studentNumber}</span>
                  <span className="text-muted-foreground">{student.programId} - Year {student.yearLevel} - {student.section}</span>
                </span>
              </label>
            )) : <EmptyState title="No students found" />}
          </div>
          <div className="rounded-lg border bg-background p-3">
            <h3 className="font-medium">Review selected participants</h3>
            <p className="mt-1 text-sm text-muted-foreground">{selectedStudents.length ? selectedStudents.map((student) => student.studentNumber).join(", ") : "No selected participants yet."}</p>
          </div>
        </section>
        {mutations.createEventMutation.isError ? <ErrorState title="Unable to create event" message="Check the required fields and selected participants." /> : null}
        <SubmitButton
          isSubmitting={mutations.createEventMutation.isPending}
          onClick={() => {
            if (selectedIds.length === 0) {
              setParticipantError("Select at least one participant.");
            }
          }}
        >
          Create pending event
        </SubmitButton>
      </form>
    </OrganizerFrame>
  );
}

export function OrganizerEventDetailsPage() {
  const { eventId } = useParams();
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const [tab, setTab] = useState("participants");
  const eventQuery = useEvent(eventId, scope.context);
  const participantsQuery = useEventParticipants(eventId ?? "", { pageSize: 500 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, eventId }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500, eventId }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const predictionsQuery = useMlPredictions({ pageSize: 100, eventId }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    values: {
      venue: eventQuery.data?.venue ?? "",
      date: eventQuery.data?.startsAt.slice(0, 10) ?? "",
      startTime: eventQuery.data?.startsAt.slice(11, 16) ?? "",
      expectedEndTime: eventQuery.data?.endsAt.slice(11, 16) ?? "",
      attendanceMode: "face-to-face"
    }
  });
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (eventQuery.isLoading) {
    return <LoadingState label="Loading event details" />;
  }
  if (eventQuery.isError || !eventQuery.data) {
    return <ErrorState title="Event unavailable" message="This event was not found or is outside the signed-in organizer scope." />;
  }
  if (participantsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading) {
    return <LoadingState label="Loading event workspace" />;
  }
  const event = eventQuery.data;
  const participants = participantsQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const students = studentsQuery.data?.items ?? [];
  const participantList = participantStudents(participants, students);
  const counts = attendanceCounts(records);
  const flagged = predictionsQuery.data?.items.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical") ?? [];
  const participantColumns: ColumnDef<Student>[] = [
    { id: "name", header: "Student name", cell: ({ row }) => studentName(row.original) },
    { accessorKey: "studentNumber", header: "Student number" },
    { accessorKey: "programId", header: "Program" },
    { accessorKey: "yearLevel", header: "Year level" },
    { accessorKey: "section", header: "Section" },
    { accessorKey: "status", header: "Student status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "rate", header: "Participation rate", cell: () => `${attendanceRate(records)}%` },
    { id: "risk", header: "Risk status", cell: ({ row }) => <StatusBadge label={flagged.some((prediction) => prediction.studentId === row.original.id) ? "flagged" : "normal"} tone={flagged.some((prediction) => prediction.studentId === row.original.id) ? "warning" : "success"} /> },
    { id: "action", header: "View", cell: () => <Button variant="outline" size="sm" disabled>View details</Button> }
  ];
  const sessionColumns: ColumnDef<AttendanceSession>[] = [
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { id: "start", header: "Start time", cell: ({ row }) => formatTime(row.original.startsAt) },
    { id: "end", header: "End time", cell: ({ row }) => formatTime(row.original.endsAt) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "present", header: "Present count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).present },
    { id: "late", header: "Late count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).late },
    { id: "absent", header: "Absent count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).absent },
    { id: "action", header: "View session", cell: ({ row }) => <Button asChild variant="outline" size="sm"><NavLink to={APP_ROUTES.organizerSession(row.original.id)}>View session</NavLink></Button> }
  ];
  async function startSession(values: SessionFormValues) {
    const created = await mutations.createEventSessionMutation.mutateAsync({ eventId: event.id, ...values });
    navigate(APP_ROUTES.organizerSession(created.id));
  }
  const canStart = event.status === "approved" || event.status === "pending";
  return (
    <OrganizerFrame>
      <PageHeader eyebrow="Event Details" title={eventLabel(event)} description={`${event.category} at ${event.venue}`} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total participants" value={String(participants.length)} icon={Users} />
        <StatCard title="Completed sessions" value={String(sessions.filter((session) => session.status === "completed").length)} icon={CalendarCheck} />
        <StatCard title="Average participation" value={`${attendanceRate(records)}%`} icon={BarChart3} />
        <StatCard title="Flagged participants" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
      </section>
      <section className="rounded-lg border bg-surface p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <StatusBadge label={`Approval: ${event.status}`} tone={statusTone(event.status)} />
          <StatusBadge label={`Event: ${event.status}`} tone={statusTone(event.status)} />
          <span className="text-sm text-muted-foreground">{formatDate(event.startsAt)} {formatTime(event.startsAt)} - {formatTime(event.endsAt)}</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Attendance mode is selected when a mock session is started. Face-to-face uses NFC as planned primary method with QR and manual fallback placeholders. Online mode shows an online verification placeholder.</p>
      </section>
      {canStart ? (
        <form className="space-y-4 rounded-lg border bg-surface p-5" onSubmit={form.handleSubmit(startSession)}>
          <h2 className="font-semibold">Start event session</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <TextField control={form.control} name="venue" label="Venue" />
            <DatePickerField control={form.control} name="date" label="Date" />
            <TimePickerField control={form.control} name="startTime" label="Start time" />
            <TimePickerField control={form.control} name="expectedEndTime" label="Expected end time" />
            <SelectField control={form.control} name="attendanceMode" label="Attendance mode" options={[{ label: "Face-to-face", value: "face-to-face" }, { label: "Online", value: "online" }]} />
          </div>
          <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">Face-to-face: NFC planned primary method; QR and manual are planned fallback methods. Online: online verification placeholder only.</div>
          <SubmitButton isSubmitting={mutations.createEventSessionMutation.isPending}>Start mock event session</SubmitButton>
        </form>
      ) : (
        <EmptyState title="Start Session unavailable" description="This event status does not allow starting a mock attendance session." />
      )}
      <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-3">
        {["participants", "sessions", "summary", "information"].map((item) => <Button key={item} type="button" variant={tab === item ? "default" : "outline"} onClick={() => setTab(item)}>{item}</Button>)}
      </div>
      {tab === "participants" ? <DataTable data={participantList} columns={participantColumns} emptyTitle="No participants" /> : null}
      {tab === "sessions" ? <DataTable data={sessions} columns={sessionColumns} emptyTitle="No event sessions" /> : null}
      {tab === "summary" ? <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={records.length} /> : null}
      {tab === "information" ? (
        <section className="rounded-lg border bg-surface p-5">
          <dl className="grid gap-3 md:grid-cols-2">
            {[
              ["Event code", event.code],
              ["Event name", event.title],
              ["Category", event.category],
              ["Description", "Development mock event details"],
              ["Venue", event.venue],
              ["Date", formatDate(event.startsAt)],
              ["Start time", formatTime(event.startsAt)],
              ["End time", formatTime(event.endsAt)],
              ["Approval status", event.status],
              ["Event status", event.status],
              ["Participant count", participants.length]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border bg-background p-3">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </OrganizerFrame>
  );
}

export function OrganizerActiveSessionPage() {
  const { sessionId } = useParams();
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const sessionQuery = useAttendanceSession(sessionId, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const participantQuery = useEventParticipants(sessionQuery.data?.eventId ?? "", { pageSize: 500 }, scope.context);
  const tapsQuery = useNfcTapAttempts({ pageSize: 500 }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const attendanceMutations = useAttendanceSimulationMutations(scope.context);
  const [nfcValue, setNfcValue] = useState("");
  const [readerState, setReaderState] = useState<"ready" | "processing" | "success" | "error" | "disconnected">("ready");
  const [qrEnabled, setQrEnabled] = useState(false);
  const [latestResult, setLatestResult] = useState<AttendanceSimulationResult | null>(null);
  const [manualStudentId, setManualStudentId] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualRemarks, setManualRemarks] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [endOpen, setEndOpen] = useState(false);
  const [endReason, setEndReason] = useState("");
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (sessionQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || eventsQuery.isLoading || participantQuery.isLoading || tapsQuery.isLoading) {
    return <LoadingState label="Loading active event session" />;
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    return <ErrorState title="Session unavailable" message="This event session was not found or is outside the signed-in organizer scope." />;
  }
  const session = sessionQuery.data;
  const event = eventsQuery.data?.items.find((item) => item.id === session.eventId);
  const records = (recordsQuery.data?.items ?? []).filter((record) => record.sessionId === session.id);
  const students = studentsQuery.data?.items ?? [];
  const participants = participantQuery.data?.items ?? [];
  const participantStudents = participants
    .map((participant) => students.find((student) => student.id === participant.studentId))
    .filter((student): student is Student => Boolean(student));
  const attempts = (tapsQuery.data?.items ?? []).filter((attempt) => attempt.sessionId === session.id);
  const counts = attendanceCounts(records);
  const duplicateAttempts = attempts.filter((attempt) => attempt.message === "Already recorded").length;
  const failedAttempts = attempts.filter((attempt) => !attempt.accepted).length;
  const liveRecords = buildLiveRecords(
    records.filter(
      (record) =>
        (statusFilter === "all" || record.status === statusFilter) &&
        (methodFilter === "all" || record.verificationMethod === (methodFilter as VerificationMethod))
    ),
    students
  ).filter(
    (record) =>
      !search || `${record.studentName} ${record.identifier}`.toLowerCase().includes(search.toLowerCase())
  );
  const latestTapResult = latestResult
    ? {
        studentName: latestResult.studentDisplayName,
        studentNumber: latestResult.studentNumber,
        status: latestResult.attendanceStatus === "absent" ? "absent" as const : latestResult.attendanceStatus === "late" ? "late" as const : latestResult.attendanceStatus === "present" ? "present" as const : "manual" as const,
        message: latestResult.safeMessage,
        timestamp: formatTime(latestResult.recordedAt),
        resultLabel: latestResult.resultStatus,
        method: latestResult.verificationMethod
      }
    : records[0]
      ? {
          studentName: studentName(students.find((student) => student.id === records[0].studentId)),
          studentNumber: students.find((student) => student.id === records[0].studentId)?.studentNumber,
          status: records[0].status === "excused" ? "manual" as const : records[0].status,
          message: "Most recent mock attendance record.",
          timestamp: formatTime(records[0].recordedAt),
          resultLabel: records[0].status,
          method: records[0].verificationMethod
        }
      : undefined;
  function simulatedTime(outcome?: string) {
    if (outcome === "late") {
      return session.lateCutoffAt ? new Date(new Date(session.lateCutoffAt).getTime() + 60_000).toISOString() : undefined;
    }
    if (outcome === "outside-window") {
      return session.attendanceWindowEndAt ? new Date(new Date(session.attendanceWindowEndAt).getTime() + 60_000).toISOString() : undefined;
    }
    return session.startsAt ? new Date(new Date(session.startsAt).getTime() + 120_000).toISOString() : undefined;
  }
  async function submitCredentialScan(code: string, method: "nfc" | "qr", outcome?: string) {
    setReaderState("processing");
    setNfcValue("");
    try {
      const result = await attendanceMutations.credentialScanMutation.mutateAsync({
        sessionId: session.id,
        credentialCode: code,
        method,
        occurredAt: simulatedTime(outcome)
      });
      setLatestResult(result);
      setReaderState(result.attendanceRecord ? "success" : "error");
      toast(result.resultStatus, { description: result.safeMessage });
    } catch {
      setReaderState("error");
      toast.error("Attendance simulation failed", { description: "The mock repository rejected the scan." });
    }
  }
  async function submitManualAttendance() {
    try {
      const result = await attendanceMutations.manualAttendanceMutation.mutateAsync({
        sessionId: session.id,
        studentId: manualStudentId,
        reason: manualReason,
        remarks: manualRemarks,
        occurredAt: simulatedTime()
      });
      setLatestResult(result);
      setManualStudentId("");
      setManualReason("");
      setManualRemarks("");
      toast(result.resultStatus, { description: result.safeMessage });
    } catch {
      toast.error("Manual attendance was not saved", { description: "Select a participant, reason, and remarks." });
    }
  }
  async function confirmEnd() {
    await mutations.endSessionMutation.mutateAsync({ sessionId: session.id, reason: endReason });
    setEndOpen(false);
    navigate(APP_ROUTES.organizerRecords);
  }
  return (
    <OrganizerFrame>
      <PageHeader
        eyebrow="Active Event Session"
        title={event?.title ?? session.title}
        description="Development Simulation for keyboard-style NFC attendance, QR fallback, and manual override."
        actions={<Button type="button" variant="destructive" onClick={() => setEndOpen(true)}>End Session</Button>}
      />
      <ActiveSessionHeader title={eventLabel(event)} venue={event?.venue ?? "Event venue"} startedAt={`${formatDate(session.startsAt)} ${formatTime(session.startsAt)}`} statusLabel={session.status} />
      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <NFCReaderInput value={nfcValue} readerState={readerState} showTestMenu onChange={setNfcValue} onSubmit={(code) => submitCredentialScan(code, "nfc")} onTestScan={(code, outcome) => submitCredentialScan(code, "nfc", outcome)} />
          <div className="rounded-lg border bg-highlight-soft p-4 text-sm text-foreground">
            <p className="font-semibold">Development Simulation</p>
            <p className="mt-1">Late cutoff: {formatTime(session.lateCutoffAt ?? session.startsAt)}. Window ends: {formatTime(session.attendanceWindowEndAt ?? session.endsAt ?? session.startsAt)}.</p>
          </div>
          <QRFallbackPanel enabled={qrEnabled} disabled={attendanceMutations.credentialScanMutation.isPending} onToggle={() => setQrEnabled((value) => !value)} onSimulate={(code) => submitCredentialScan(code, "qr")} />
          <ManualLookupPanel
            studentId={manualStudentId}
            reason={manualReason}
            remarks={manualRemarks}
            students={participantStudents.map((student) => ({ id: student.id, label: `${studentName(student)} (${student.studentNumber})` }))}
            disabled={attendanceMutations.manualAttendanceMutation.isPending}
            onStudentChange={setManualStudentId}
            onReasonChange={setManualReason}
            onRemarksChange={setManualRemarks}
            onSubmit={submitManualAttendance}
          />
        </div>
        <div className="space-y-4">
          <LatestTapResultCard result={latestTapResult} />
          <div className="rounded-lg border bg-surface p-4">
            <h2 className="font-semibold">Recent activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest accepted, duplicate, and failed Development Simulation attempts refresh through mock repositories.</p>
          </div>
          <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={participantStudents.length} />
          <div className="grid gap-3 md:grid-cols-2">
            <StatCard title="Failed taps" value={String(failedAttempts)} tone="warning" />
            <StatCard title="Duplicate taps" value={String(duplicateAttempts)} />
          </div>
        </div>
        <div className="space-y-4">
          <SearchInput value={search} placeholder="Search live list" onChange={setSearch} />
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
              <option value="all">All methods</option>
              <option value="nfc">NFC</option>
              <option value="qr">QR</option>
              <option value="manual">Manual</option>
              <option value="online">Online</option>
            </select>
          </div>
          <LiveAttendanceList records={liveRecords} />
        </div>
      </section>
      <ConfirmModal open={endOpen} title="End mock event session" description="A reason is required when ending early or overtime." confirmLabel="End session" tone="danger" onCancel={() => setEndOpen(false)} onConfirm={confirmEnd}>
        <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={endReason} onChange={(event) => setEndReason(event.target.value)}>
          <option value="">Select reason</option>
          {["Event ended early", "Event extended overtime", "Venue issue", "Schedule adjustment", "Emergency", "Other"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </select>
        {mutations.endSessionMutation.isError ? <p className="mt-2 text-sm text-danger">A reason is required.</p> : null}
      </ConfirmModal>
    </OrganizerFrame>
  );
}

export function OrganizerRecordsPage() {
  const scope = useOrganizerScope();
  const [status, setStatus] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedCorrection, setSelectedCorrection] = useState<CorrectionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || correctionsQuery.isLoading) {
    return <LoadingState label="Loading event records" />;
  }
  if (sessionsQuery.isError || correctionsQuery.isError) {
    return <ErrorState title="Unable to load event records" message="The mock records repositories returned an error." />;
  }
  const events = eventsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const students = studentsQuery.data?.items ?? [];
  const sessions = (sessionsQuery.data?.items ?? []).filter((session) => status === "all" || session.status === status);
  const selectedRecords = selectedSessionId ? records.filter((record) => record.sessionId === selectedSessionId) : [];
  const sessionColumns: ColumnDef<AttendanceSession>[] = [
    { id: "code", header: "Event code", cell: ({ row }) => events.find((event) => event.id === row.original.eventId)?.code ?? "Event" },
    { id: "name", header: "Event name", cell: ({ row }) => events.find((event) => event.id === row.original.eventId)?.title ?? row.original.title },
    { id: "category", header: "Category", cell: ({ row }) => events.find((event) => event.id === row.original.eventId)?.category ?? "Event" },
    { id: "venue", header: "Venue", cell: ({ row }) => events.find((event) => event.id === row.original.eventId)?.venue ?? "Venue" },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { id: "time", header: "Session time", cell: ({ row }) => `${formatTime(row.original.startsAt)} - ${formatTime(row.original.endsAt)}` },
    { id: "present", header: "Present count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).present },
    { id: "late", header: "Late count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).late },
    { id: "absent", header: "Absent count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).absent },
    { accessorKey: "status", header: "Session status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "action", header: "View details", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSessionId(row.original.id)}>Details</Button> }
  ];
  const detailColumns: ColumnDef<AttendanceRecord>[] = [
    { id: "student", header: "Student name", cell: ({ row }) => studentName(students.find((student) => student.id === row.original.studentId)) },
    { id: "number", header: "Student number", cell: ({ row }) => students.find((student) => student.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { accessorKey: "status", header: "Attendance status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { accessorKey: "verificationMethod", header: "Verification method" },
    { id: "time", header: "Time recorded", cell: ({ row }) => formatTime(row.original.recordedAt) },
    { accessorKey: "note", header: "Remarks" },
    { id: "correction", header: "Correction request status", cell: ({ row }) => correctionsQuery.data?.items.find((request) => request.attendanceRecordId === row.original.id)?.status ?? "None" }
  ];
  const correctionColumns: ColumnDef<CorrectionRequest>[] = [
    { id: "student", header: "Student name", cell: ({ row }) => studentName(students.find((student) => student.id === row.original.studentId)) },
    { id: "number", header: "Student number", cell: ({ row }) => students.find((student) => student.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { id: "event", header: "Event", cell: ({ row }) => eventLabel(events.find((event) => event.id === row.original.eventId)) },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(records.find((record) => record.id === row.original.attendanceRecordId)?.recordedAt) },
    { accessorKey: "requestedStatus", header: "Request type" },
    { accessorKey: "reason", header: "Explanation summary" },
    { id: "attachment", header: "Attachment", cell: () => "Placeholder" },
    { id: "submitted", header: "Submitted date", cell: ({ row }) => formatDate(row.original.requestedAt) },
    { accessorKey: "status", header: "Request status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "action", header: "Review action", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCorrection(row.original)}>Review</Button> }
  ];
  async function approveCorrection() {
    if (!selectedCorrection) return;
    await correctionsQuery.reviewMutation.mutateAsync({ requestId: selectedCorrection.id, status: "approved" });
    setSelectedCorrection(null);
  }
  async function rejectCorrection() {
    if (!selectedCorrection) return;
    await correctionsQuery.reviewMutation.mutateAsync({ requestId: selectedCorrection.id, status: "rejected", reason: rejectReason });
    setSelectedCorrection(null);
    setRejectReason("");
  }
  return (
    <OrganizerFrame>
      <PageHeader eyebrow="Organizer" title="Event Records" description="Event sessions, attendance details, and event-based correction review." actions={<><Button disabled variant="outline">Generate PDF</Button><Button disabled variant="outline">Generate XLSX</Button></>} />
      <FilterBar search="" selectedFilter={status} filters={[{ label: "All", value: "all" }, { label: "Draft", value: "draft" }, { label: "Active", value: "active" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }]} onSearchChange={() => undefined} onFilterChange={setStatus} />
      <DataTable data={sessions} columns={sessionColumns} emptyTitle="No event sessions" />
      {selectedSessionId ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Session detail panel</h2>
          <div className="mt-4">
            <DataTable data={selectedRecords} columns={detailColumns} emptyTitle="No student attendance records" />
          </div>
        </section>
      ) : null}
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Correction Request Review</h2>
        <div className="mt-4">
          <DataTable data={correctionsQuery.data?.items ?? []} columns={correctionColumns} emptyTitle="No event correction requests" />
        </div>
      </section>
      {selectedCorrection ? (
        <section className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-lg border bg-popover p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Review event correction request</h2>
            <p className="mt-2 text-sm text-muted-foreground">{selectedCorrection.reason}</p>
            <div className="mt-4 rounded-lg border bg-surface p-3 text-sm">Attachment placeholder, attendance context, and prior mock audit history are shown as review context.</div>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium">Reject reason</span>
              <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedCorrection(null)}>Close</Button>
              <Button type="button" onClick={approveCorrection}>Approve</Button>
              <Button type="button" variant="destructive" onClick={rejectCorrection}>Reject</Button>
            </div>
          </div>
        </section>
      ) : null}
    </OrganizerFrame>
  );
}

export function OrganizerReportsPage() {
  const scope = useOrganizerScope();
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("term");
  const [modalOpen, setModalOpen] = useState(false);
  const reportsQuery = useReports({ pageSize: 100, search: query }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  const history: ReportHistoryRecord[] = (reportsQuery.data?.items ?? []).map((report) => ({
    id: report.id,
    name: report.title,
    scope: report.scope,
    generatedAt: report.generatedAt ? formatDate(report.generatedAt) : "Queued",
    status: report.status === "queued" ? "processing" : report.status
  }));
  return (
    <OrganizerFrame>
      <PageHeader eyebrow="Organizer" title="Reports" description="Mock organizer report previews. Real PDF and XLSX generation is Phase 12 functionality." actions={<><Button disabled variant="outline">Generate PDF</Button><Button disabled variant="outline">Generate XLSX</Button></>} />
      <ReportFilterPanel query={query} period={period} onQueryChange={setQuery} onPeriodChange={setPeriod} onApply={() => undefined} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {["Event attendance report", "Participant attendance summary", "Semester event summary", "Correction request summary", "Analytics and risk summary"].map((title) => (
          <ReportPreviewCard key={title} title={title} description="Development preview generated from mock organizer-scoped data." metrics={[{ label: "Period", value: period }, { label: "Scope", value: "Owned events" }, { label: "Export", value: "Phase 12" }]} />
        ))}
      </section>
      <ReportHistoryTable records={history} />
      <Button type="button" onClick={() => setModalOpen(true)}>Open mock generate modal</Button>
      <GenerateReportModal open={modalOpen} reportName="Organizer report preview" onClose={() => setModalOpen(false)} onGenerate={() => setModalOpen(false)} />
    </OrganizerFrame>
  );
}

export function OrganizerAnalyticsPage() {
  const scope = useOrganizerScope();
  const [eventId, setEventId] = useState("");
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const predictionsQuery = useMlPredictions({ pageSize: 100, eventId: eventId || undefined }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (eventsQuery.isLoading || predictionsQuery.isLoading) {
    return <LoadingState label="Loading organizer analytics" />;
  }
  if (predictionsQuery.isError) {
    return <ErrorState title="Unable to load analytics" message="No organizer-scoped analytics predictions are available." />;
  }
  const events = eventsQuery.data?.items ?? [];
  const predictions = predictionsQuery.data?.items ?? [];
  const chartData = events.map((event) => ({
    label: event.code,
    present: 4,
    late: predictions.filter((prediction) => prediction.eventId === event.id && prediction.riskLevel === "medium").length,
    absent: predictions.filter((prediction) => prediction.eventId === event.id && ["high", "critical"].includes(prediction.riskLevel)).length
  }));
  const participationData = events.map((event) => ({ label: event.code, participation: event.status === "completed" ? 92 : 74 }));
  const columns: ColumnDef<MlPrediction>[] = [
    { accessorKey: "patternLabel", header: "Risk or anomaly summary" },
    { accessorKey: "type", header: "Insight area" },
    { id: "affected", header: "Affected students or event", cell: ({ row }) => eventLabel(events.find((event) => event.id === row.original.eventId)) },
    { accessorKey: "riskLevel", header: "Risk", cell: ({ row }) => <StatusBadge label={row.original.riskLevel} tone={statusTone(row.original.riskLevel)} /> },
    { id: "range", header: "Data range", cell: () => "Current semester" },
    { id: "updated", header: "Last updated", cell: ({ row }) => formatDate(row.original.generatedAt) },
    { accessorKey: "explanation", header: "Safe explanation" },
    { id: "action", header: "Action", cell: () => <Button variant="outline" size="sm" disabled>View details</Button> }
  ];
  return (
    <OrganizerFrame>
      <PageHeader eyebrow="Review-only ML" title="Analytics and ML" description="Organizer-scoped analytics previews. No automatic sanctions or attendance changes are shown." />
      <section className="rounded-lg border bg-surface p-4">
        <label className="block max-w-xs space-y-1.5">
          <span className="text-sm font-medium">Event filter</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={eventId} onChange={(event) => setEventId(event.target.value)}>
            <option value="">All owned events</option>
            {events.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}
          </select>
        </label>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard title="Absenteeism Risk Prediction" value={String(predictions.filter((prediction) => prediction.type === "random_forest_risk").length)} icon={AlertTriangle} tone="warning" description="Review-only" />
        <StatCard title="Attendance Anomaly Detection" value={String(predictions.filter((prediction) => prediction.type === "linear_regression_anomaly").length)} icon={Search} description="Review-only" />
        <StatCard title="Participation Clustering" value={String(predictions.filter((prediction) => prediction.type === "k_means_cluster").length)} icon={BarChart3} description="Review-only" />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <AttendanceTrendChart data={chartData} />
        <ParticipationBarChart data={participationData} />
      </section>
      <RiskSummaryChart data={chartData.map((entry) => ({ label: entry.label, watchlist: entry.late, atRisk: entry.absent }))} />
      <DataTable data={predictions} columns={columns} emptyTitle="No analytics insights" emptyDescription="No review-only predictions match this event filter." />
    </OrganizerFrame>
  );
}
