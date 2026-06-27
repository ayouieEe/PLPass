import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Search,
  Users
} from "lucide-react";
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
  useClass,
  useClasses,
  useCorrectionRequests,
  useFacultyProfiles,
  useMlPredictions,
  useNfcTapAttempts,
  useReports,
  useStudents,
  useStudentsForClass
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { AttendanceSimulationResult } from "@/services/contracts";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { AttendanceRecord, AttendanceSession, Class, CorrectionRequest, MlPrediction, Student } from "@/types/domain";
import type { AttendanceStatus, CorrectionRequestStatus, RiskLevel, SessionStatus, StudentStatus } from "@/types/enums";

type FacultyScope = {
  context: RepositoryContext;
  facultyId?: string;
  facultyName: string;
  isLoading: boolean;
  isError: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const sessionFormSchema = z
  .object({
    classId: z.string().min(1, "Select an assigned class."),
    room: z.string().min(2, "Room is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required."),
    attendanceMode: z.enum(["face-to-face", "online"])
  })
  .refine((value) => value.expectedEndTime > value.startTime, {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time."
  });

type SessionFormValues = z.infer<typeof sessionFormSchema>;

function useFacultyScope(): FacultyScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const facultyQuery = useFacultyProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "faculty" },
    facultyId: facultyQuery.data?.items[0]?.id,
    facultyName: session?.displayName ?? "Faculty",
    isLoading: facultyQuery.isLoading,
    isError: facultyQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
}

function statusTone(status: AttendanceStatus | SessionStatus | CorrectionRequestStatus | StudentStatus | RiskLevel) {
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

function classLabel(classRecord: Class | undefined) {
  return classRecord ? `${classRecord.subjectCode} ${classRecord.section}` : "Unknown class";
}

function recordsForSession(records: AttendanceRecord[], sessionId: string) {
  return records.filter((record) => record.sessionId === sessionId);
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

function studentName(student: Student | undefined) {
  return student ? student.studentNumber : "Unknown student";
}

function ShellState({ scope }: { scope: FacultyScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading faculty workspace" />;
  }
  if (scope.isError || !scope.facultyId) {
    return <ErrorState title="Faculty profile unavailable" message="The signed-in mock account does not have a faculty profile fixture." />;
  }
  return null;
}

function FacultyFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

export function FacultyRootPage() {
  return <Navigate to={APP_ROUTES.facultyDashboard} replace />;
}

export function FacultyDashboardPage() {
  const scope = useFacultyScope();
  const [semesterId, setSemesterId] = useState("");
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const classesQuery = useClasses({ pageSize: 100, semesterId: semesterId || undefined }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const mlQuery = useMlPredictions({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }

  const classes = classesQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const predictions = mlQuery.data?.items ?? [];
  const activeSession = sessions.find((session) => session.status === "active");
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const flagged = predictions.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical");
  const totalAssignedStudents = new Set(classes.flatMap((classRecord) => records.filter((record) => sessions.find((session) => session.id === record.sessionId)?.classId === classRecord.id).map((record) => record.studentId))).size;

  const trendData = classes.map((classRecord) => {
    const classSessions = sessions.filter((session) => session.classId === classRecord.id);
    const classRecords = records.filter((record) => classSessions.some((session) => session.id === record.sessionId));
    const counts = attendanceCounts(classRecords);
    return { label: classRecord.subjectCode, present: counts.present, late: counts.late, absent: counts.absent };
  });
  const riskData = classes.map((classRecord) => ({
    label: classRecord.subjectCode,
    watchlist: predictions.filter((prediction) => prediction.classId === classRecord.id && prediction.riskLevel === "medium").length,
    atRisk: predictions.filter((prediction) => prediction.classId === classRecord.id && ["high", "critical"].includes(prediction.riskLevel)).length
  }));

  if (classesQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || catalog.semesters.isLoading) {
    return <LoadingState label="Loading faculty dashboard" />;
  }

  if (classesQuery.isError || sessionsQuery.isError || recordsQuery.isError) {
    return <ErrorState title="Unable to load dashboard" message="The mock repository could not load faculty dashboard data." />;
  }

  return (
    <FacultyFrame>
      <PageHeader
        eyebrow="Faculty"
        title="Faculty dashboard"
        description="Scoped overview of assigned classes, session activity, and review-only risk signals."
        actions={
          <>
            <Button asChild variant="outline">
              <NavLink to={APP_ROUTES.facultyClasses}>View My Classes</NavLink>
            </Button>
            <Button asChild>
              <NavLink to={APP_ROUTES.facultyStartSession}>Start Session</NavLink>
            </Button>
          </>
        }
      />
      <section className="rounded-lg border bg-surface p-4">
        <label className="block max-w-xs space-y-1.5">
          <span className="text-sm font-medium">Semester</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">All semesters</option>
            {catalog.semesters.data?.items.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.label} {semester.schoolYear}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Assigned students" value={String(totalAssignedStudents)} icon={Users} />
        <StatCard title="Flagged students" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
        <StatCard title="Average attendance" value={`${attendanceRate(records)}%`} icon={CalendarCheck} />
        <StatCard title="Completed sessions" value={String(completedSessions.length)} icon={ClipboardList} />
      </section>
      {activeSession ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Active class session</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeSession.title} is currently active.</p>
          <Button className="mt-4" asChild>
            <NavLink to={APP_ROUTES.facultySession(activeSession.id)}>Open active session</NavLink>
          </Button>
        </section>
      ) : (
        <EmptyState title="No active session" description="Start a mock class session when your class begins." />
      )}
      <section className="grid gap-4 xl:grid-cols-2">
        <AttendanceTrendChart data={trendData} />
        <RiskSummaryChart data={riskData} />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Today's class schedule</h2>
          <div className="mt-4 grid gap-3">
            {classes.length ? classes.map((classRecord) => <ClassScheduleCard key={classRecord.id} classRecord={classRecord} />) : <EmptyState title="No upcoming class" />}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Attention-needed students</h2>
          <div className="mt-4 space-y-3">
            {flagged.length ? flagged.map((prediction) => <PredictionCard key={prediction.id} prediction={prediction} />) : <EmptyState title="No flagged students" description="No high-risk mock predictions are in your assigned classes." />}
          </div>
        </div>
      </section>
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Recent completed sessions</h2>
        <div className="mt-4 grid gap-3">
          {completedSessions.length ? completedSessions.slice(0, 4).map((session) => <SessionCard key={session.id} session={session} />) : <EmptyState title="No completed sessions" />}
        </div>
      </section>
    </FacultyFrame>
  );
}

function ClassScheduleCard({ classRecord }: { classRecord: Class }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{classRecord.subjectCode} - {classRecord.subjectTitle}</p>
          <p className="text-sm text-muted-foreground">{classRecord.scheduleLabel} · {classRecord.room}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.facultyClass(classRecord.id)}>View</NavLink>
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
          <p className="text-sm text-muted-foreground">{formatDate(session.startsAt)} · {formatTime(session.startsAt)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.facultySession(session.id)}>View session</NavLink>
        </Button>
      </div>
    </article>
  );
}

export function FacultyClassesPage() {
  const scope = useFacultyScope();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [view, setView] = useState<"table" | "schedule">("table");
  const classesQuery = useClasses({ pageSize: 100, search }, scope.context);
  const rostersQuery = useStudents({ pageSize: 200 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (classesQuery.isLoading || rostersQuery.isLoading) {
    return <LoadingState label="Loading assigned classes" />;
  }
  if (classesQuery.isError) {
    return <ErrorState title="Unable to load classes" message="The mock repository could not load assigned classes." />;
  }
  const classes = (classesQuery.data?.items ?? []).filter((classRecord) => status === "all" || classRecord.status === status);
  const columns: ColumnDef<Class>[] = [
    { accessorKey: "subjectCode", header: "Subject code" },
    { accessorKey: "subjectTitle", header: "Subject name" },
    { accessorKey: "section", header: "Section" },
    { accessorKey: "room", header: "Room" },
    { accessorKey: "scheduleLabel", header: "Schedule" },
    {
      id: "students",
      header: "Enrolled",
      cell: ({ row }) => rostersQuery.data?.items.filter((student) => student.programId === row.original.programId).length ?? 0
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status === "active" ? "completed" : "cancelled")} />
    },
    {
      id: "action",
      header: "Action",
      cell: ({ row }) => (
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.facultyClass(row.original.id)}>View class</NavLink>
        </Button>
      )
    }
  ];
  return (
    <FacultyFrame>
      <PageHeader eyebrow="Faculty" title="My Classes" description="Assigned class list with responsive table and schedule views." />
      <FilterBar
        search={search}
        selectedFilter={status}
        filters={[{ label: "All", value: "all" }, { label: "Active", value: "active" }, { label: "Archived", value: "archived" }]}
        onSearchChange={setSearch}
        onFilterChange={setStatus}
      />
      <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-3">
        <Button type="button" variant={view === "table" ? "default" : "outline"} onClick={() => setView("table")}>Table view</Button>
        <Button type="button" variant={view === "schedule" ? "default" : "outline"} onClick={() => setView("schedule")}>Schedule view</Button>
      </div>
      {view === "table" ? (
        <DataTable data={classes} columns={columns} emptyTitle="No assigned classes" />
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {classes.map((classRecord) => <ClassScheduleCard key={classRecord.id} classRecord={classRecord} />)}
        </section>
      )}
    </FacultyFrame>
  );
}

export function FacultyClassDetailsPage() {
  const { classId } = useParams();
  const scope = useFacultyScope();
  const classQuery = useClass(classId, scope.context);
  const rosterQuery = useStudentsForClass(classId, { pageSize: 200 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ classId, pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ classId, pageSize: 500 }, scope.context);
  const [tab, setTab] = useState("roster");
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (classQuery.isLoading) {
    return <LoadingState label="Loading class details" />;
  }
  if (classQuery.isError) {
    return <ErrorState title="Class unavailable" message="This class was not found or is outside your assigned classes." />;
  }
  if (rosterQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading) {
    return <LoadingState label="Loading class details" />;
  }
  const classRecord = classQuery.data;
  const roster = rosterQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const flaggedCount = records.filter((record) => record.status === "absent").length;
  const rosterColumns: ColumnDef<Student>[] = [
    { id: "name", header: "Student name", cell: ({ row }) => studentName(row.original) },
    { accessorKey: "studentNumber", header: "Student number" },
    { accessorKey: "programId", header: "Program" },
    { accessorKey: "yearLevel", header: "Year level" },
    { accessorKey: "section", header: "Section" },
    { accessorKey: "status", header: "Student status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "rate", header: "Attendance rate", cell: ({ row }) => `${attendanceRate(records.filter((record) => record.studentId === row.original.id))}%` },
    { id: "risk", header: "Risk status", cell: ({ row }) => <StatusBadge label={records.some((record) => record.studentId === row.original.id && record.status === "absent") ? "watchlist" : "normal"} tone={records.some((record) => record.studentId === row.original.id && record.status === "absent") ? "warning" : "success"} /> },
    { id: "action", header: "Action", cell: () => <Button variant="outline" size="sm" disabled>View details</Button> }
  ];
  const sessionColumns: ColumnDef<AttendanceSession>[] = [
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { id: "start", header: "Start time", cell: ({ row }) => formatTime(row.original.startsAt) },
    { id: "end", header: "End time", cell: ({ row }) => formatTime(row.original.endsAt) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "present", header: "Present", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).present },
    { id: "late", header: "Late", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).late },
    { id: "absent", header: "Absent", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).absent },
    { id: "action", header: "Action", cell: ({ row }) => <Button asChild variant="outline" size="sm"><NavLink to={APP_ROUTES.facultySession(row.original.id)}>View session</NavLink></Button> }
  ];
  return (
    <FacultyFrame>
      <PageHeader
        eyebrow="Class Details"
        title={`${classRecord?.subjectCode} - ${classRecord?.subjectTitle}`}
        description={`${classRecord?.section} · ${classRecord?.room} · ${classRecord?.scheduleLabel}`}
        actions={<Button asChild><NavLink to={`${APP_ROUTES.facultyStartSession}?classId=${classId}`}>Start Session</NavLink></Button>}
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Enrolled students" value={String(roster.length)} icon={Users} />
        <StatCard title="Completed sessions" value={String(sessions.filter((session) => session.status === "completed").length)} icon={ClipboardList} />
        <StatCard title="Average attendance" value={`${attendanceRate(records)}%`} icon={CalendarCheck} />
        <StatCard title="Flagged students" value={String(flaggedCount)} icon={AlertTriangle} tone={flaggedCount ? "warning" : "success"} />
      </section>
      <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-3" role="tablist" aria-label="Class details sections">
        {["roster", "recent sessions", "attendance summary", "class information"].map((item) => (
          <Button key={item} type="button" variant={tab === item ? "default" : "outline"} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>
            {item}
          </Button>
        ))}
      </div>
      {tab === "roster" ? <DataTable data={roster} columns={rosterColumns} emptyTitle="No roster students" /> : null}
      {tab === "recent sessions" ? <DataTable data={sessions} columns={sessionColumns} emptyTitle="No class sessions" /> : null}
      {tab === "attendance summary" ? <AttendanceTrendChart data={sessions.map((session) => ({ label: formatDate(session.startsAt), ...attendanceCounts(recordsForSession(records, session.id)) }))} /> : null}
      {tab === "class information" ? (
        <section className="rounded-lg border bg-surface p-4">
          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["Subject code", classRecord?.subjectCode],
              ["Subject name", classRecord?.subjectTitle],
              ["Faculty", scope.facultyName],
              ["Room", classRecord?.room],
              ["Schedule", classRecord?.scheduleLabel],
              ["Semester", classRecord?.semesterId],
              ["School year", "2026-2027"],
              ["Class status", classRecord?.status]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-background p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </FacultyFrame>
  );
}

export function FacultyStartSessionPage() {
  const scope = useFacultyScope();
  const navigate = useNavigate();
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      classId: new URLSearchParams(window.location.search).get("classId") ?? "",
      room: "",
      date: "2026-06-27",
      startTime: "08:00",
      expectedEndTime: "09:00",
      attendanceMode: "face-to-face"
    }
  });
  const selectedClass = classesQuery.data?.items.find((classRecord) => classRecord.id === form.watch("classId"));
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  async function submit(values: SessionFormValues) {
    const created = await mutations.createClassSessionMutation.mutateAsync({
      classId: values.classId,
      title: `${selectedClass?.subjectCode ?? "Class"} Active Session`,
      room: values.room,
      date: values.date,
      startTime: values.startTime,
      expectedEndTime: values.expectedEndTime,
      mode: values.attendanceMode === "face-to-face" ? "required" : "optional"
    });
    navigate(APP_ROUTES.facultySession(created.id));
  }
  return (
    <FacultyFrame>
      <PageHeader eyebrow="Session preparation" title="Start class session" description="Create a mock active session for one of your assigned classes." />
      {classesQuery.isLoading ? <LoadingState label="Loading assigned classes" /> : null}
      {classesQuery.isError ? <ErrorState title="Unable to load classes" message="Assigned class options are unavailable." /> : null}
      <form className="grid gap-4 rounded-lg border bg-surface p-4 md:grid-cols-2" onSubmit={form.handleSubmit(submit)}>
        <SelectField control={form.control} name="classId" label="Assigned class" options={(classesQuery.data?.items ?? []).map((classRecord) => ({ label: `${classRecord.subjectCode} ${classRecord.section}`, value: classRecord.id }))} />
        <TextField control={form.control} name="room" label="Room" placeholder={selectedClass?.room ?? "Room"} />
        <DatePickerField control={form.control} name="date" label="Date" />
        <TimePickerField control={form.control} name="startTime" label="Start time" />
        <TimePickerField control={form.control} name="expectedEndTime" label="Expected end time" />
        <SelectField control={form.control} name="attendanceMode" label="Attendance mode" options={[{ label: "Face-to-face", value: "face-to-face" }, { label: "Online", value: "online" }]} />
        <div className="rounded-lg border bg-background p-4 md:col-span-2">
          <h2 className="font-semibold">Selected class details</h2>
          {selectedClass ? <p className="mt-1 text-sm text-muted-foreground">{selectedClass.subjectTitle} · {selectedClass.scheduleLabel} · {selectedClass.room}</p> : <p className="mt-1 text-sm text-muted-foreground">Choose a class to preview details.</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            Face-to-face mode plans NFC as primary, with QR and manual attendance as future fallback previews. Online mode shows an online verification placeholder.
          </p>
        </div>
        <div className="md:col-span-2">
          <SubmitButton isSubmitting={mutations.createClassSessionMutation.isPending}>Create mock active session</SubmitButton>
        </div>
      </form>
    </FacultyFrame>
  );
}

export function FacultyActiveSessionPage() {
  const { sessionId } = useParams();
  const scope = useFacultyScope();
  const navigate = useNavigate();
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
  const sessionQuery = useAttendanceSession(sessionId, scope.context);
  const classQuery = useClass(sessionQuery.data?.classId, scope.context);
  const rosterQuery = useStudentsForClass(sessionQuery.data?.classId ?? "", { pageSize: 500 }, scope.context);
  const recordsQuery = useAttendanceRecords({ classId: sessionQuery.data?.classId, pageSize: 500 }, scope.context);
  const tapsQuery = useNfcTapAttempts({ pageSize: 500 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const attendanceMutations = useAttendanceSimulationMutations(scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (sessionQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || rosterQuery.isLoading || tapsQuery.isLoading) {
    return <LoadingState label="Loading active session" />;
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    return <ErrorState title="Session unavailable" message="This session was not found or is outside your assigned classes." />;
  }
  const session = sessionQuery.data;
  const classRecord = classQuery.data;
  const records = (recordsQuery.data?.items ?? []).filter((record) => record.sessionId === session.id);
  const students = studentsQuery.data?.items ?? [];
  const rosterStudents = rosterQuery.data?.items ?? [];
  const attempts = (tapsQuery.data?.items ?? []).filter((attempt) => attempt.sessionId === session.id);
  const filteredRecords = records.filter((record) => {
    const student = students.find((entry) => entry.id === record.studentId);
    return (
      (statusFilter === "all" || record.status === statusFilter) &&
      (methodFilter === "all" || record.verificationMethod === methodFilter) &&
      (!search || student?.studentNumber.toLowerCase().includes(search.toLowerCase()) || record.status.includes(search.toLowerCase()))
    );
  });
  const counts = attendanceCounts(records);
  const duplicateAttempts = attempts.filter((attempt) => attempt.message === "Already recorded").length;
  const failedAttempts = attempts.filter((attempt) => !attempt.accepted).length;
  const liveRecords: LiveAttendanceRecord[] = filteredRecords.map((record) => {
    const student = students.find((entry) => entry.id === record.studentId);
    return {
      id: record.id,
      studentName: studentName(student),
      identifier: student?.studentNumber ?? record.studentId,
      status: record.status === "excused" ? "manual" : record.status,
      timestamp: formatTime(record.recordedAt)
    };
  });
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
      toast.error("Manual attendance was not saved", { description: "Select a student, reason, and remarks." });
    }
  }
  async function confirmEnd() {
    await mutations.endSessionMutation.mutateAsync({ sessionId: session.id, reason: endReason });
    navigate(APP_ROUTES.facultyAttendance);
  }
  return (
    <FacultyFrame>
      <PageHeader
        eyebrow="Active Session"
        title={session.title}
        description="Development Simulation for keyboard-style NFC attendance, QR fallback, and manual override."
        actions={<Button type="button" variant="destructive" onClick={() => setEndOpen(true)}>End Session</Button>}
      />
      <ActiveSessionHeader title={classRecord ? `${classRecord.subjectTitle} (${classRecord.subjectCode})` : session.title} venue={`${classRecord?.section ?? "Class"} · ${classRecord?.room ?? "Room"}`} startedAt={`${formatDate(session.startsAt)} ${formatTime(session.startsAt)}`} statusLabel={session.status} />
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
            students={rosterStudents.map((student) => ({ id: student.id, label: `${studentName(student)} (${student.studentNumber})` }))}
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
          <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={rosterStudents.length} />
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
            </select>
          </div>
          <LiveAttendanceList records={liveRecords} />
        </div>
      </section>
      <ConfirmModal open={endOpen} title="End mock session" description="A reason is required for early or overtime ending." confirmLabel="End session" tone="danger" onCancel={() => setEndOpen(false)} onConfirm={confirmEnd}>
        <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={endReason} onChange={(event) => setEndReason(event.target.value)}>
          <option value="">Select reason</option>
          {["Class ended early", "Class extended overtime", "Room issue", "Schedule adjustment", "Emergency", "Other"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </select>
        {mutations.endSessionMutation.isError ? <p className="mt-2 text-sm text-danger">A reason is required.</p> : null}
      </ConfirmModal>
    </FacultyFrame>
  );
}

export function FacultyAttendancePage() {
  const scope = useFacultyScope();
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, search }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (sessionsQuery.isLoading || recordsQuery.isLoading || classesQuery.isLoading) {
    return <LoadingState label="Loading attendance records" />;
  }
  if (sessionsQuery.isError) {
    return <ErrorState title="Unable to load attendance records" message="The mock attendance session repository returned an error." />;
  }
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const classes = classesQuery.data?.items ?? [];
  const selectedRecords = selectedSessionId ? records.filter((record) => record.sessionId === selectedSessionId) : [];
  const columns: ColumnDef<AttendanceSession>[] = [
    { id: "code", header: "Subject code", cell: ({ row }) => classes.find((entry) => entry.id === row.original.classId)?.subjectCode ?? "Class" },
    { accessorKey: "title", header: "Subject name" },
    { id: "section", header: "Section", cell: ({ row }) => classes.find((entry) => entry.id === row.original.classId)?.section ?? "N/A" },
    { id: "room", header: "Room", cell: ({ row }) => classes.find((entry) => entry.id === row.original.classId)?.room ?? "N/A" },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { id: "time", header: "Session time", cell: ({ row }) => `${formatTime(row.original.startsAt)} - ${formatTime(row.original.endsAt)}` },
    { id: "present", header: "Present", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).present },
    { id: "late", header: "Late", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).late },
    { id: "absent", header: "Absent", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).absent },
    { accessorKey: "status", header: "Session status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "action", header: "View", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSessionId(row.original.id)}>Details</Button> }
  ];
  const detailColumns: ColumnDef<AttendanceRecord>[] = [
    { id: "student", header: "Student name", cell: ({ row }) => studentName(studentsQuery.data?.items.find((student) => student.id === row.original.studentId)) },
    { id: "number", header: "Student number", cell: ({ row }) => studentsQuery.data?.items.find((student) => student.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { accessorKey: "status", header: "Attendance status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { accessorKey: "verificationMethod", header: "Verification method" },
    { id: "time", header: "Time recorded", cell: ({ row }) => formatTime(row.original.recordedAt) },
    { accessorKey: "note", header: "Remarks" },
    { id: "correction", header: "Correction request", cell: () => "No active request" }
  ];
  return (
    <FacultyFrame>
      <PageHeader eyebrow="Faculty" title="Attendance Records" description="Completed and relevant sessions for your assigned classes." actions={<><Button disabled variant="outline">Generate PDF</Button><Button disabled variant="outline">Generate XLSX</Button></>} />
      <FilterBar search={search} selectedFilter="all" filters={[{ label: "All statuses", value: "all" }]} onSearchChange={setSearch} onFilterChange={() => undefined} />
      <DataTable data={sessions} columns={columns} emptyTitle="No attendance sessions" />
      {selectedSessionId ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Attendance detail panel</h2>
          <div className="mt-4">
            <DataTable data={selectedRecords} columns={detailColumns} emptyTitle="No student attendance records" />
          </div>
        </section>
      ) : null}
    </FacultyFrame>
  );
}

export function FacultyCorrectionsPage() {
  const scope = useFacultyScope();
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<CorrectionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (correctionsQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading) {
    return <LoadingState label="Loading correction requests" />;
  }
  if (correctionsQuery.isError) {
    return <ErrorState title="Unable to load correction requests" message="The mock correction repository returned an error." />;
  }
  const requests = (correctionsQuery.data?.items ?? []).filter((request) => status === "all" || request.status === status);
  const columns: ColumnDef<CorrectionRequest>[] = [
    { id: "student", header: "Student name", cell: ({ row }) => studentName(studentsQuery.data?.items.find((student) => student.id === row.original.studentId)) },
    { id: "number", header: "Student number", cell: ({ row }) => studentsQuery.data?.items.find((student) => student.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { id: "class", header: "Class", cell: ({ row }) => row.original.classId ?? "Event" },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(recordsQuery.data?.items.find((record) => record.id === row.original.attendanceRecordId)?.recordedAt) },
    { accessorKey: "requestedStatus", header: "Request type" },
    { accessorKey: "reason", header: "Explanation summary" },
    { id: "attachment", header: "Attachment", cell: () => "Placeholder" },
    { id: "submitted", header: "Submitted date", cell: ({ row }) => formatDate(row.original.requestedAt) },
    { accessorKey: "status", header: "Request status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "action", header: "Review", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => setSelected(row.original)}>Review</Button> }
  ];
  async function approve() {
    if (!selected) return;
    await correctionsQuery.reviewMutation.mutateAsync({ requestId: selected.id, status: "approved" });
    setSelected(null);
  }
  async function reject() {
    if (!selected) return;
    await correctionsQuery.reviewMutation.mutateAsync({ requestId: selected.id, status: "rejected", reason: rejectReason });
    setSelected(null);
    setRejectReason("");
  }
  return (
    <FacultyFrame>
      <PageHeader eyebrow="Faculty" title="Correction Requests" description="Review student-submitted requests for your assigned classes only." />
      <FilterBar search="" selectedFilter={status} filters={[{ label: "All", value: "all" }, { label: "Pending", value: "pending" }, { label: "Approved", value: "approved" }, { label: "Rejected", value: "rejected" }]} onSearchChange={() => undefined} onFilterChange={setStatus} />
      <DataTable data={requests} columns={columns} emptyTitle="No correction requests" />
      {selected ? (
        <section className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-lg border bg-popover p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Review correction request</h2>
            <p className="mt-2 text-sm text-muted-foreground">{selected.reason}</p>
            <div className="mt-4 rounded-lg border bg-surface p-3 text-sm">Attached-file placeholder and previous audit history are shown as mock review context.</div>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium">Reject reason</span>
              <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelected(null)}>Close</Button>
              <Button type="button" onClick={approve}>Approve</Button>
              <Button type="button" variant="destructive" onClick={reject}>Reject</Button>
            </div>
          </div>
        </section>
      ) : null}
    </FacultyFrame>
  );
}

export function FacultyReportsPage() {
  const scope = useFacultyScope();
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("term");
  const [modalOpen, setModalOpen] = useState(false);
  const reportsQuery = useReports({ pageSize: 100, search: query }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
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
    <FacultyFrame>
      <PageHeader eyebrow="Faculty" title="Reports" description="Mock report previews only. Real exports are deferred." actions={<><Button disabled variant="outline">Generate PDF</Button><Button disabled variant="outline">Generate XLSX</Button></>} />
      <ReportFilterPanel query={query} period={period} onQueryChange={setQuery} onPeriodChange={setPeriod} onApply={() => undefined} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {["Class attendance report", "Student attendance summary", "Semester attendance summary", "Correction request summary", "Analytics and risk summary"].map((title) => (
          <ReportPreviewCard key={title} title={title} description="Development preview generated from mock faculty-scoped data." metrics={[{ label: "Period", value: period }, { label: "Scope", value: "Assigned" }, { label: "Export", value: "Phase 12" }]} />
        ))}
      </section>
      <ReportHistoryTable records={history} />
      <Button type="button" onClick={() => setModalOpen(true)}>Open mock generate modal</Button>
      <GenerateReportModal open={modalOpen} reportName="Faculty report preview" onClose={() => setModalOpen(false)} onGenerate={() => setModalOpen(false)} />
    </FacultyFrame>
  );
}

export function FacultyAnalyticsPage() {
  const scope = useFacultyScope();
  const [classId, setClassId] = useState("");
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const predictionsQuery = useMlPredictions({ pageSize: 100, classId: classId || undefined }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (classesQuery.isLoading || predictionsQuery.isLoading) {
    return <LoadingState label="Loading analytics" />;
  }
  if (predictionsQuery.isError) {
    return <ErrorState title="Unable to load analytics" message="No faculty-scoped analytics predictions are available." />;
  }
  const predictions = predictionsQuery.data?.items ?? [];
  const chartData = (classesQuery.data?.items ?? []).map((classRecord) => ({
    label: classRecord.subjectCode,
    present: 4,
    late: predictions.filter((prediction) => prediction.classId === classRecord.id && prediction.riskLevel === "medium").length,
    absent: predictions.filter((prediction) => prediction.classId === classRecord.id && prediction.riskLevel === "high").length
  }));
  const participationData = (classesQuery.data?.items ?? []).map((classRecord) => ({ label: classRecord.subjectCode, participation: classRecord.status === "active" ? 88 : 72 }));
  const columns: ColumnDef<MlPrediction>[] = [
    { accessorKey: "patternLabel", header: "Summary" },
    { accessorKey: "type", header: "Insight area" },
    { accessorKey: "riskLevel", header: "Risk", cell: ({ row }) => <StatusBadge label={row.original.riskLevel} tone={statusTone(row.original.riskLevel)} /> },
    { id: "range", header: "Data range", cell: () => "Current semester" },
    { id: "updated", header: "Last updated", cell: ({ row }) => formatDate(row.original.generatedAt) },
    { accessorKey: "explanation", header: "Safe explanation" },
    { id: "action", header: "Action", cell: () => <Button variant="outline" size="sm" disabled>View details</Button> }
  ];
  return (
    <FacultyFrame>
      <PageHeader eyebrow="Review-only ML" title="Analytics and ML" description="Faculty-scoped analytics previews. No automatic decisions or punitive recommendations are shown." />
      <section className="rounded-lg border bg-surface p-4">
        <label className="block max-w-xs space-y-1.5">
          <span className="text-sm font-medium">Class filter</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">All assigned classes</option>
            {classesQuery.data?.items.map((classRecord) => <option key={classRecord.id} value={classRecord.id}>{classLabel(classRecord)}</option>)}
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
      <DataTable data={predictions} columns={columns} emptyTitle="No analytics insights" emptyDescription="No review-only predictions match this class filter." />
    </FacultyFrame>
  );
}
