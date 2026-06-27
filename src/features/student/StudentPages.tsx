import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CalendarCheck, ClipboardList, Nfc, UserCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { SelectField } from "@/components/forms/SelectField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { AttachmentUploader } from "@/components/shared/AttachmentUploader";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { DataTable } from "@/components/tables/DataTable";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { ReportFilterPanel } from "@/features/reports/ReportFilterPanel";
import { ReportHistoryTable } from "@/features/reports/ReportHistoryTable";
import type { ReportHistoryRecord } from "@/features/reports/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSessions,
  useClasses,
  useCorrectionRequests,
  useEvents,
  useFacultyProfiles,
  useNfcCredentialForStudent,
  useNfcCredentialRequests,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
  Class,
  CorrectionRequest,
  Event,
  FacultyProfile,
  NfcCredentialRequest,
  OrganizerProfile,
  Report,
  Student
} from "@/types/domain";
import type {
  AttendanceStatus,
  CorrectionRequestStatus,
  EventStatus,
  NfcCredentialRequestStatus,
  NfcCredentialStatus,
  SessionStatus
} from "@/types/enums";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  studentName: string;
  isLoading: boolean;
  isError: boolean;
};

type AttendanceRow = {
  id: string;
  kind: "class" | "event";
  record: AttendanceRecord;
  session?: AttendanceSession;
  classRecord?: Class;
  event?: Event;
  faculty?: FacultyProfile;
  organizer?: OrganizerProfile;
};

type ScheduleRow = {
  id: string;
  kind: "class" | "event";
  name: string;
  code: string;
  venue: string;
  startsAt: string;
  endsAt?: string;
  owner: string;
  mode: string;
  status: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const correctionSchema = z.object({
  attendanceRecordId: z.string().min(1, "Select a related attendance record."),
  requestedStatus: z.enum(["present", "late", "absent", "excused"]),
  reason: z.string().min(12, "Explanation must be at least 12 characters.")
});

const nfcRequestSchema = z.object({
  type: z.enum(["lost", "damaged", "replacement"]),
  reason: z.string().min(10, "Reason must be at least 10 characters.")
});

type CorrectionFormValues = z.infer<typeof correctionSchema>;
type NfcRequestFormValues = z.infer<typeof nfcRequestSchema>;

function useStudentScope(): StudentScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const studentQuery = useStudents({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "student" },
    student: studentQuery.data?.items[0],
    studentName: session?.displayName ?? "Student",
    isLoading: studentQuery.isLoading,
    isError: studentQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
}

function statusTone(
  status:
    | AttendanceStatus
    | SessionStatus
    | CorrectionRequestStatus
    | EventStatus
    | NfcCredentialStatus
    | NfcCredentialRequestStatus
) {
  if (["present", "completed", "approved", "activated"].includes(status)) {
    return "success" as const;
  }
  if (["late", "draft", "pending", "inactive", "damaged", "replacement"].includes(status)) {
    return "warning" as const;
  }
  if (["absent", "cancelled", "rejected", "blocked", "lost"].includes(status)) {
    return "danger" as const;
  }
  return "muted" as const;
}

function maskCredential(value: string | undefined) {
  if (!value) {
    return "Not available";
  }
  return `${value.slice(0, 3)}-${"*".repeat(Math.max(value.length - 6, 4))}-${value.slice(-3)}`;
}

function attendanceRate(records: AttendanceRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  const attended = records.filter((record) => record.status === "present" || record.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

function ShellState({ scope }: { scope: StudentScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }
  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in mock account does not have a student profile fixture." />;
  }
  return null;
}

function StudentFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function buildAttendanceRows(
  records: AttendanceRecord[],
  sessions: AttendanceSession[],
  classes: Class[],
  events: Event[],
  faculty: FacultyProfile[],
  organizers: OrganizerProfile[]
): AttendanceRow[] {
  return records.map((record) => {
    const session = sessions.find((entry) => entry.id === record.sessionId);
    const classRecord = classes.find((entry) => entry.id === session?.classId);
    const event = events.find((entry) => entry.id === session?.eventId);
    return {
      id: record.id,
      kind: session?.type ?? (classRecord ? "class" : "event"),
      record,
      session,
      classRecord,
      event,
      faculty: faculty.find((entry) => entry.id === classRecord?.facultyId),
      organizer: organizers.find((entry) => entry.id === event?.organizerId)
    };
  });
}

function buildScheduleRows(classes: Class[], events: Event[], faculty: FacultyProfile[], organizers: OrganizerProfile[]): ScheduleRow[] {
  const classRows = classes.map((classRecord) => ({
    id: classRecord.id,
    kind: "class" as const,
    name: classRecord.subjectTitle,
    code: classRecord.subjectCode,
    venue: classRecord.room,
    startsAt: "2026-06-27T00:00:00.000Z",
    endsAt: "2026-06-27T01:00:00.000Z",
    owner: faculty.find((profile) => profile.id === classRecord.facultyId)?.title ?? "Faculty",
    mode: "required",
    status: classRecord.status
  }));
  const eventRows = events.map((event) => ({
    id: event.id,
    kind: "event" as const,
    name: event.title,
    code: event.code,
    venue: event.venue,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    owner: organizers.find((profile) => profile.id === event.organizerId)?.organizationName ?? "Organizer",
    mode: "required",
    status: event.status
  }));
  return [...classRows, ...eventRows].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function attendanceColumns(onDetails: (row: AttendanceRow) => void): ColumnDef<AttendanceRow>[] {
  return [
    { id: "code", header: "Code", cell: ({ row }) => row.original.classRecord?.subjectCode ?? row.original.event?.code ?? "N/A" },
    { id: "name", header: "Name", cell: ({ row }) => row.original.classRecord?.subjectTitle ?? row.original.event?.title ?? row.original.session?.title ?? "Unknown" },
    { id: "owner", header: "Faculty or organizer", cell: ({ row }) => row.original.faculty?.title ?? row.original.organizer?.organizationName ?? "N/A" },
    { id: "section", header: "Section or venue", cell: ({ row }) => row.original.classRecord?.section ?? row.original.event?.venue ?? "N/A" },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.session?.startsAt) },
    { id: "time", header: "Session time", cell: ({ row }) => `${formatTime(row.original.session?.startsAt)} - ${formatTime(row.original.session?.endsAt)}` },
    { id: "status", header: "Attendance status", cell: ({ row }) => <StatusBadge label={row.original.record.status} tone={statusTone(row.original.record.status)} /> },
    { accessorKey: "record.verificationMethod", header: "Verification method" },
    { id: "action", header: "View details", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => onDetails(row.original)}>Details</Button> }
  ];
}

export function StudentRootPage() {
  return <Navigate to={APP_ROUTES.studentDashboard} replace />;
}

export function StudentDashboardPage() {
  const scope = useStudentScope();
  const [semesterId, setSemesterId] = useState("");
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const classesQuery = useClasses({ pageSize: 100, semesterId: semesterId || undefined }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.student) {
    return shellState;
  }
  if (classesQuery.isLoading || eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || catalog.semesters.isLoading) {
    return <LoadingState label="Loading student dashboard" />;
  }
  if (classesQuery.isError || eventsQuery.isError || recordsQuery.isError) {
    return <ErrorState title="Unable to load student dashboard" message="The mock repositories could not load student-scoped dashboard data." />;
  }
  const classes = classesQuery.data?.items ?? [];
  const events = eventsQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const classRecords = records.filter((record) => sessions.find((session) => session.id === record.sessionId)?.type === "class");
  const eventRecords = records.filter((record) => sessions.find((session) => session.id === record.sessionId)?.type === "event");
  const trendData = [
    { label: "Classes", present: classRecords.filter((record) => record.status === "present").length, late: classRecords.filter((record) => record.status === "late").length, absent: classRecords.filter((record) => record.status === "absent").length },
    { label: "Events", present: eventRecords.filter((record) => record.status === "present").length, late: eventRecords.filter((record) => record.status === "late").length, absent: eventRecords.filter((record) => record.status === "absent").length }
  ];
  const schedule = buildScheduleRows(classes, events, [], []);
  return (
    <StudentFrame>
      <PageHeader
        eyebrow="Student"
        title="Student dashboard"
        description="Your class attendance, event participation, schedule, and reminders."
        actions={
          <>
            <Button asChild variant="outline"><NavLink to={APP_ROUTES.studentAttendance}>View Attendance Records</NavLink></Button>
            <Button asChild><NavLink to={APP_ROUTES.studentCorrections}>Submit Correction Request</NavLink></Button>
          </>
        }
      />
      <section className="rounded-lg border bg-surface p-4">
        <label className="block max-w-xs space-y-1.5">
          <span className="text-sm font-medium">Semester</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">All semesters</option>
            {catalog.semesters.data?.items.map((semester) => <option key={semester.id} value={semester.id}>{semester.label} {semester.schoolYear}</option>)}
          </select>
        </label>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Class attendance total" value={String(classRecords.length)} icon={CalendarCheck} />
        <StatCard title="Class attendance rate" value={`${attendanceRate(classRecords)}%`} icon={ClipboardList} />
        <StatCard title="Events attended" value={String(eventRecords.filter((record) => record.status === "present" || record.status === "late").length)} icon={UserCheck} />
        <StatCard title="Alerts and reminders" value={records.some((record) => record.status === "absent") ? "1" : "0"} icon={AlertTriangle} tone={records.some((record) => record.status === "absent") ? "warning" : "success"} />
      </section>
      <AttendanceTrendChart data={trendData} />
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Today's class and event schedule</h2>
          <div className="mt-4 grid gap-3">
            {schedule.length ? schedule.slice(0, 4).map((item) => <ScheduleCard key={`${item.kind}-${item.id}`} item={item} />) : <EmptyState title="No upcoming schedule" />}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Recent attendance activity</h2>
          <div className="mt-4 grid gap-3">
            {records.length ? records.slice(0, 5).map((record) => <ActivityCard key={record.id} record={record} session={sessions.find((session) => session.id === record.sessionId)} />) : <EmptyState title="No recent attendance records" />}
          </div>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {events.length ? <EmptyState title="Upcoming events available" description={`${events.length} registered event schedule item(s) are visible in Schedule.`} /> : <EmptyState title="No event participation" description="You are not listed as a participant in any current mock event." />}
        <EmptyState title="NFC reminder" description="Keep your school ID sticker attached and report lost or damaged stickers from the NFC Credential page." />
      </section>
    </StudentFrame>
  );
}

function ScheduleCard({ item }: { item: ScheduleRow }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{item.code} - {item.name}</p>
          <p className="text-sm text-muted-foreground">{formatDate(item.startsAt)} {formatTime(item.startsAt)} - {formatTime(item.endsAt)} - {item.venue}</p>
        </div>
        <StatusBadge label={item.kind} tone={item.kind === "class" ? "info" : "success"} />
      </div>
    </article>
  );
}

function ActivityCard({ record, session }: { record: AttendanceRecord; session?: AttendanceSession }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{session?.title ?? "Attendance session"}</p>
          <p className="text-sm text-muted-foreground">{formatDate(record.recordedAt)} - {record.verificationMethod}</p>
        </div>
        <StatusBadge label={record.status} tone={statusTone(record.status)} />
      </div>
    </article>
  );
}

export function StudentAttendancePage() {
  const scope = useStudentScope();
  const [tab, setTab] = useState<"class" | "event">("class");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<AttendanceRow | null>(null);
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const facultyQuery = useFacultyProfiles({ pageSize: 100 }, scope.context);
  const organizerQuery = useOrganizerProfiles({ pageSize: 100 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.student) {
    return shellState;
  }
  if (classesQuery.isLoading || eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading) {
    return <LoadingState label="Loading attendance records" />;
  }
  const rows = buildAttendanceRows(recordsQuery.data?.items ?? [], sessionsQuery.data?.items ?? [], classesQuery.data?.items ?? [], eventsQuery.data?.items ?? [], facultyQuery.data?.items ?? [], organizerQuery.data?.items ?? [])
    .filter((row) => row.kind === tab)
    .filter((row) => status === "all" || row.record.status === status)
    .filter((row) => !search || `${row.classRecord?.subjectCode ?? ""} ${row.classRecord?.subjectTitle ?? ""} ${row.event?.code ?? ""} ${row.event?.title ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <StudentFrame>
      <PageHeader eyebrow="Student" title="Attendance Records" description="Your class attendance and event participation records only." />
      <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-3" role="tablist" aria-label="Attendance record type">
        <Button type="button" role="tab" variant={tab === "class" ? "default" : "outline"} onClick={() => setTab("class")}>Classes</Button>
        <Button type="button" role="tab" variant={tab === "event" ? "default" : "outline"} onClick={() => setTab("event")}>Events</Button>
        <Button type="button" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>List view</Button>
        <Button type="button" variant={view === "calendar" ? "default" : "outline"} onClick={() => setView("calendar")}>Calendar view</Button>
      </div>
      <FilterBar search={search} selectedFilter={status} filters={[{ label: "All", value: "all" }, { label: "Present", value: "present" }, { label: "Late", value: "late" }, { label: "Absent", value: "absent" }, { label: "Excused", value: "excused" }]} onSearchChange={setSearch} onFilterChange={setStatus} />
      {view === "list" ? (
        <DataTable data={rows} columns={attendanceColumns(setSelected)} emptyTitle="No attendance records" emptyDescription="No student-owned records match the selected filters." />
      ) : (
        <CalendarList rows={rows} />
      )}
      {selected ? <AttendanceDetail row={selected} corrections={correctionsQuery.data?.items ?? []} onClose={() => setSelected(null)} /> : null}
    </StudentFrame>
  );
}

function CalendarList({ rows }: { rows: AttendanceRow[] }) {
  if (!rows.length) {
    return <EmptyState title="No calendar attendance items" />;
  }
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Attendance calendar items">
      {rows.map((row) => (
        <article key={row.id} className="rounded-lg border bg-surface p-4">
          <p className="text-sm font-medium">{formatDate(row.session?.startsAt)}</p>
          <h2 className="mt-2 font-semibold">{row.classRecord?.subjectCode ?? row.event?.code} - {row.classRecord?.subjectTitle ?? row.event?.title}</h2>
          <StatusBadge label={row.record.status} tone={statusTone(row.record.status)} />
        </article>
      ))}
    </section>
  );
}

function AttendanceDetail({ row, corrections, onClose }: { row: AttendanceRow; corrections: CorrectionRequest[]; onClose: () => void }) {
  const request = corrections.find((entry) => entry.attendanceRecordId === row.record.id);
  return (
    <section className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-lg border bg-popover p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Attendance detail</h2>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["Class or event", row.classRecord?.subjectTitle ?? row.event?.title ?? row.session?.title],
            ["Attendance status", row.record.status],
            ["Verification method", row.record.verificationMethod],
            ["Recorded time", `${formatDate(row.record.recordedAt)} ${formatTime(row.record.recordedAt)}`],
            ["Remarks", row.record.note ?? "No remarks"],
            ["Correction request status", request?.status ?? "No request"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-surface p-3">
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button asChild><NavLink to={APP_ROUTES.studentCorrections}>Available correction request action</NavLink></Button>
        </div>
      </div>
    </section>
  );
}

export function StudentSchedulePage() {
  const scope = useStudentScope();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<ScheduleRow | null>(null);
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const facultyQuery = useFacultyProfiles({ pageSize: 100 }, scope.context);
  const organizerQuery = useOrganizerProfiles({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.student) {
    return shellState;
  }
  if (classesQuery.isLoading || eventsQuery.isLoading) {
    return <LoadingState label="Loading schedule" />;
  }
  const rows = buildScheduleRows(classesQuery.data?.items ?? [], eventsQuery.data?.items ?? [], facultyQuery.data?.items ?? [], organizerQuery.data?.items ?? []).filter((row) => filter === "all" || row.kind === filter);
  const columns: ColumnDef<ScheduleRow>[] = [
    { accessorKey: "code", header: "Code" },
    { accessorKey: "name", header: "Class or event name" },
    { accessorKey: "venue", header: "Venue or room" },
    { id: "time", header: "Start and end time", cell: ({ row }) => `${formatDate(row.original.startsAt)} ${formatTime(row.original.startsAt)} - ${formatTime(row.original.endsAt)}` },
    { accessorKey: "owner", header: "Faculty or organizer" },
    { accessorKey: "mode", header: "Attendance mode" },
    { accessorKey: "status", header: "Schedule status" },
    { id: "action", header: "Details", cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => setSelected(row.original)}>Details</Button> }
  ];
  return (
    <StudentFrame>
      <PageHeader eyebrow="Student" title="Schedule" description="Your registered classes and eligible events." />
      <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-3">
        <Button type="button" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
        <Button type="button" variant={filter === "class" ? "default" : "outline"} onClick={() => setFilter("class")}>Classes</Button>
        <Button type="button" variant={filter === "event" ? "default" : "outline"} onClick={() => setFilter("event")}>Events</Button>
        <Button type="button" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>List view</Button>
        <Button type="button" variant={view === "calendar" ? "default" : "outline"} onClick={() => setView("calendar")}>Calendar view</Button>
      </div>
      <div className="rounded-lg border bg-surface p-3 text-sm text-muted-foreground">Legend: classes use information badges, events use success badges. Day, week, and month controls are represented by this responsive agenda/calendar mock.</div>
      {view === "list" ? <DataTable data={rows} columns={columns} emptyTitle="No schedule items" /> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <ScheduleCard key={`${row.kind}-${row.id}`} item={row} />)}</section>}
      {selected ? (
        <section className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-lg border bg-popover p-5 shadow-lg">
            <h2 className="text-lg font-semibold">{selected.code} - {selected.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{selected.venue} - {formatDate(selected.startsAt)} {formatTime(selected.startsAt)}</p>
            <div className="mt-4 rounded-lg border bg-surface p-3 text-sm">Related attendance information appears when a matching record exists.</div>
            <div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></div>
          </div>
        </section>
      ) : null}
    </StudentFrame>
  );
}

export function StudentCorrectionsPage() {
  const scope = useStudentScope();
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const [selected, setSelected] = useState<CorrectionRequest | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const form = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: { attendanceRecordId: "", requestedStatus: "present", reason: "" }
  });
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.student) {
    return shellState;
  }
  if (recordsQuery.isLoading || correctionsQuery.isLoading || sessionsQuery.isLoading) {
    return <LoadingState label="Loading correction requests" />;
  }
  async function submit(values: CorrectionFormValues) {
    const record = recordsQuery.data?.items.find((entry) => entry.id === values.attendanceRecordId);
    await correctionsQuery.createMutation.mutateAsync({
      studentId: scope.student?.id ?? "",
      attendanceRecordId: values.attendanceRecordId,
      classId: sessionsQuery.data?.items.find((session) => session.id === record?.sessionId)?.classId,
      eventId: sessionsQuery.data?.items.find((session) => session.id === record?.sessionId)?.eventId,
      requestedStatus: values.requestedStatus,
      reason: values.reason
    });
    toast.success("Correction request submitted.");
    form.reset({ attendanceRecordId: "", requestedStatus: "present", reason: "" });
  }
  const columns: ColumnDef<CorrectionRequest>[] = [
    { id: "record", header: "Class or event", cell: ({ row }) => row.original.classId ?? row.original.eventId ?? "Attendance record" },
    { id: "date", header: "Submitted date", cell: ({ row }) => formatDate(row.original.requestedAt) },
    { accessorKey: "requestedStatus", header: "Request type" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "reviewed", header: "Reviewed by", cell: ({ row }) => row.original.reviewedByUserId ?? "Pending" },
    { id: "reviewDate", header: "Review date", cell: ({ row }) => formatDate(row.original.reviewedAt) },
    { id: "action", header: "View details", cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => setSelected(row.original)}>Details</Button> }
  ];
  return (
    <StudentFrame>
      <PageHeader eyebrow="Student" title="Correction Requests" description="Submit and review your own attendance correction request history." />
      <form className="space-y-4 rounded-lg border bg-surface p-5" onSubmit={form.handleSubmit(submit)}>
        <h2 className="font-semibold">Create Request</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField control={form.control} name="attendanceRecordId" label="Category, class or event" options={(recordsQuery.data?.items ?? []).map((record) => ({ label: `${record.id} - ${record.status}`, value: record.id }))} />
          <SelectField control={form.control} name="requestedStatus" label="Request type" options={[{ label: "Excused absence", value: "excused" }, { label: "Attendance status correction", value: "present" }, { label: "Recorded time correction", value: "late" }, { label: "System issue", value: "absent" }]} />
          <AttachmentUploader label={`Attachment placeholder (${files.length} selected)`} onFilesSelected={setFiles} />
        </div>
        <TextAreaField control={form.control} name="reason" label="Explanation" />
        {correctionsQuery.createMutation.isError ? <p className="text-sm text-danger">Unable to submit. Check for duplicate pending requests and required fields.</p> : null}
        <SubmitButton isSubmitting={correctionsQuery.createMutation.isPending}>Submit correction request</SubmitButton>
      </form>
      <DataTable data={correctionsQuery.data?.items ?? []} columns={columns} emptyTitle="No correction requests" />
      {selected ? (
        <section className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-lg border bg-popover p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Correction request details</h2>
            <p className="mt-2 text-sm text-muted-foreground">{selected.reason}</p>
            <div className="mt-4 rounded-lg border bg-surface p-3 text-sm">Original attendance record, attachment placeholder, staff decision, rejection reason, and safe audit timeline are represented by mock data.</div>
            <div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></div>
          </div>
        </section>
      ) : null}
    </StudentFrame>
  );
}

export function StudentNfcCredentialPage() {
  const scope = useStudentScope();
  const credentialQuery = useNfcCredentialForStudent(scope.student?.id, scope.context);
  const tapsQuery = useNfcTapAttempts({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const requestsQuery = useNfcCredentialRequests({ pageSize: 100 }, scope.context);
  const form = useForm<NfcRequestFormValues>({ resolver: zodResolver(nfcRequestSchema), defaultValues: { type: "lost", reason: "" } });
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.student) {
    return shellState;
  }
  if (credentialQuery.isLoading || tapsQuery.isLoading || requestsQuery.isLoading) {
    return <LoadingState label="Loading NFC credential" />;
  }
  async function submit(values: NfcRequestFormValues) {
    await requestsQuery.createMutation.mutateAsync({ studentId: scope.student?.id ?? "", credentialId: credentialQuery.data?.id, ...values });
    toast.success("NFC issue request submitted.");
    form.reset({ type: "lost", reason: "" });
  }
  const requestColumns: ColumnDef<NfcCredentialRequest>[] = [
    { accessorKey: "type", header: "Request type" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { accessorKey: "reason", header: "Reason" },
    { id: "date", header: "Submitted", cell: ({ row }) => formatDate(row.original.requestedAt) }
  ];
  return (
    <StudentFrame>
      <PageHeader eyebrow="Student" title="NFC Credential" description="Credential status, safe tap history, and issue request actions." />
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard title="Credential status" value={credentialQuery.data?.status ?? "Not available"} icon={Nfc} />
        <StatCard title="Masked credential identifier" value={maskCredential(credentialQuery.data?.nfcUid)} icon={ClipboardList} />
        <StatCard title="Date issued" value={formatDate(credentialQuery.data?.issuedAt)} icon={CalendarCheck} />
      </section>
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Clear NFC use instructions</h2>
        <p className="mt-2 text-sm text-muted-foreground">Keep your sticker attached to your school ID. Tap once on the reader and wait for staff confirmation. Raw NFC values and reader metadata are never shown here.</p>
      </section>
      <form className="space-y-4 rounded-lg border bg-surface p-5" onSubmit={form.handleSubmit(submit)}>
        <h2 className="font-semibold">Lost or damaged sticker reporting action</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField control={form.control} name="type" label="Replacement request action" options={[{ label: "Lost", value: "lost" }, { label: "Damaged", value: "damaged" }, { label: "Replacement", value: "replacement" }]} />
          <TextAreaField control={form.control} name="reason" label="Reason" />
        </div>
        {requestsQuery.createMutation.isError ? <p className="text-sm text-danger">A pending request of this type may already exist.</p> : null}
        <SubmitButton isSubmitting={requestsQuery.createMutation.isPending}>Submit NFC issue request</SubmitButton>
      </form>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">NFC tap history</h2>
          <div className="mt-4 space-y-3">
            {(tapsQuery.data?.items ?? []).length ? tapsQuery.data?.items.map((tap) => <ActivityCard key={tap.id} record={{ id: tap.id, sessionId: tap.sessionId, studentId: tap.studentId ?? "", status: tap.accepted ? "present" : "absent", verificationMethod: "nfc", recordedAt: tap.attemptedAt, note: tap.message }} session={sessionsQuery.data?.items.find((session) => session.id === tap.sessionId)} />) : <EmptyState title="No NFC tap history" />}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Future methods</h2>
          <div className="mt-4 grid gap-3">
            <EmptyState title="QR not available" description="QR attendance fallback is not available in the current version." />
            <EmptyState title="Facial recognition not available" description="Facial recognition is not available in the current version." />
          </div>
        </div>
      </section>
      <DataTable data={requestsQuery.data?.items ?? []} columns={requestColumns} emptyTitle="No NFC issue requests" />
    </StudentFrame>
  );
}

export function StudentReportsPage() {
  const scope = useStudentScope();
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("term");
  const reportsQuery = useReports({ pageSize: 100, search: query }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.student) {
    return shellState;
  }
  const history: ReportHistoryRecord[] = (reportsQuery.data?.items ?? []).map((report: Report) => ({
    id: report.id,
    name: report.title,
    scope: report.scope,
    generatedAt: report.generatedAt ? formatDate(report.generatedAt) : "Queued",
    status: report.status === "queued" ? "processing" : report.status
  }));
  return (
    <StudentFrame>
      <PageHeader eyebrow="Student" title="Report History" description="Student-owned report history. PDF and XLSX downloads are disabled development placeholders." actions={<><Button disabled variant="outline">Download PDF</Button><Button disabled variant="outline">Download XLSX</Button></>} />
      <ReportFilterPanel query={query} period={period} onQueryChange={setQuery} onPeriodChange={setPeriod} onApply={() => undefined} />
      {history.length ? <ReportHistoryTable records={history} /> : <EmptyState title="No report history" description="No student-owned reports match the selected filters." />}
    </StudentFrame>
  );
}
