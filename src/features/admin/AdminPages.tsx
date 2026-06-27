import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  CalendarCheck,
  ClipboardList,
  Nfc,
  Users
} from "lucide-react";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { ParticipationBarChart } from "@/components/charts/ParticipationBarChart";
import { PresentLateAbsentPieChart } from "@/components/charts/PresentLateAbsentPieChart";
import { RiskSummaryChart } from "@/components/charts/RiskSummaryChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatCard } from "@/components/shared/StatCard";
import { FilterBar } from "@/components/tables/FilterBar";
import { DataTable } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSessions,
  useAuditLogs,
  useClasses,
  useEventStatusMutation,
  useEvents,
  useFacultyProfiles,
  useMlPredictions,
  useNfcCredentialStatusMutation,
  useNfcCredentials,
  useNfcReaders,
  useNfcReaderStatusMutation,
  useOrganizerProfiles,
  useReports,
  useRosterMutations,
  useStudents,
  useSystemSettings,
  useUsers
} from "@/hooks/useRepositoryQueries";
import type {
  AttendanceRecord,
  AttendanceSession,
  AuditLog,
  Class,
  Event,
  FacultyProfile,
  MlPrediction,
  NfcCredential,
  NfcReader,
  OrganizerProfile,
  Report,
  Student
} from "@/types/domain";
import type { NfcCredentialStatus, NfcReaderStatus } from "@/types/enums";

type BadgeTone = "success" | "warning" | "danger" | "info" | "muted";
type AdminContext = { actorUserId: string; actorRole: "admin" };

function useAdminContext(): { context?: AdminContext; userLabel?: string } {
  const { session } = useDevelopmentSession();
  return {
    context: session?.role === "admin" ? { actorUserId: session.userId, actorRole: "admin" } : undefined,
    userLabel: session?.displayName
  };
}

function AdminFrame({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function statusTone(status: string): BadgeTone {
  if (["present", "success", "approved", "active", "activated", "ready", "low"].includes(status)) {
    return "success";
  }
  if (["late", "warning", "pending", "processing", "queued", "medium", "maintenance"].includes(status)) {
    return "warning";
  }
  if (["absent", "error", "rejected", "failed", "blocked", "lost", "damaged", "critical", "high"].includes(status)) {
    return "danger";
  }
  if (["draft", "info", "inactive", "read"].includes(status)) {
    return "info";
  }
  return "muted";
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function isQueryLoading(queries: Array<{ isLoading: boolean }>) {
  return queries.some((query) => query.isLoading);
}

function hasQueryError(queries: Array<{ isError: boolean }>) {
  return queries.some((query) => query.isError);
}

function ErrorPanel() {
  return <ErrorState title="Admin data unavailable" message="The mock repository returned an error state for this view." />;
}

function isEmptyResult(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EMPTY_RESULT";
}

type TabOption<T extends string> = {
  label: string;
  value: T;
};

function TabBar<T extends string>({
  label,
  tabs,
  selected,
  onSelect
}: {
  label: string;
  tabs: TabOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-2" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={selected === tab.value}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            selected === tab.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-primary-hover hover:text-primary-foreground"
          }`}
          onClick={() => onSelect(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function DeferredFeaturePanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-lg border bg-surface-muted p-6 text-foreground" aria-disabled="true">
      <StatusBadge label="Disabled" tone="muted" />
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
    </section>
  );
}

function maskIdentifier(identifier: string) {
  if (identifier.length <= 4) {
    return "****";
  }
  return `${identifier.slice(0, 3)}-${"*".repeat(Math.max(identifier.length - 6, 4))}-${identifier.slice(-3)}`;
}

function countRecordsForSession(records: AttendanceRecord[], sessionId: string, status: string) {
  return records.filter((record) => record.sessionId === sessionId && record.status === status).length;
}

export function AdminDashboardPage() {
  const { context } = useAdminContext();
  const users = useUsers({ pageSize: 100 }, context);
  const students = useStudents({ pageSize: 100 }, context);
  const classes = useClasses({ pageSize: 100 }, context);
  const sessions = useAttendanceSessions({ pageSize: 100 }, context);
  const records = useAttendanceRecords({ pageSize: 100 }, context);
  const credentials = useNfcCredentials({ pageSize: 100 }, context);
  const predictions = useMlPredictions({ pageSize: 100 }, context);
  const queries = [users, students, classes, sessions, records, credentials, predictions];

  const attendanceSlices = useMemo(() => {
    const source = records.data?.items ?? [];
    return ["present", "late", "absent"].map((status) => ({
      name: formatStatus(status),
      value: source.filter((record) => record.status === status).length
    }));
  }, [records.data?.items]);

  const trend = useMemo(() => {
    const source = sessions.data?.items.slice(0, 4) ?? [];
    return source.map((session) => {
      const sessionRecords = records.data?.items.filter((record) => record.sessionId === session.id) ?? [];
      return {
        label: session.title.split(" ").slice(0, 2).join(" "),
        present: sessionRecords.filter((record) => record.status === "present").length,
        late: sessionRecords.filter((record) => record.status === "late").length,
        absent: sessionRecords.filter((record) => record.status === "absent").length
      };
    });
  }, [records.data?.items, sessions.data?.items]);

  if (isQueryLoading(queries)) {
    return <AdminFrame><LoadingState label="Loading admin dashboard" /></AdminFrame>;
  }
  if (hasQueryError(queries)) {
    return <AdminFrame><ErrorPanel /></AdminFrame>;
  }

  const enrolledCount = students.data?.items.filter((student) => student.status === "enrolled").length ?? 0;
  const activeSessions = sessions.data?.items.filter((session) => session.status === "active").length ?? 0;

  return (
    <AdminFrame>
      <PageHeader
        eyebrow="Admin portal"
        title="Admin dashboard"
        description="Mock-backed operating summary for PLPass users, attendance, NFC credentials, and review-only analytics."
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Active users" value={String(users.data?.total ?? 0)} icon={Users} description="All enabled mock accounts" />
        <StatCard title="Enrolled students" value={String(enrolledCount)} icon={ClipboardList} description="Excludes LOA, dropped, and archived students" />
        <StatCard title="Active sessions" value={String(activeSessions)} icon={CalendarCheck} description="Class and event attendance sessions" />
        <StatCard title="NFC credentials" value={String(credentials.data?.total ?? 0)} icon={Nfc} description="Sticker credentials in mock registry" />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <AttendanceTrendChart data={trend} />
        <PresentLateAbsentPieChart data={attendanceSlices} />
      </section>
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="text-lg font-semibold">Review-only ML placeholders</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(predictions.data?.items ?? []).slice(0, 3).map((prediction) => (
            <article key={prediction.id} className="rounded-lg border bg-background p-3">
              <StatusBadge label={prediction.riskLevel} tone={statusTone(prediction.riskLevel)} />
              <p className="mt-3 font-medium">{prediction.patternLabel}</p>
              <p className="mt-1 text-sm text-muted-foreground">{prediction.explanation}</p>
            </article>
          ))}
        </div>
      </section>
    </AdminFrame>
  );
}

export function AdminUsersPage() {
  const { context } = useAdminContext();
  const [tab, setTab] = useState<"students" | "faculty" | "organizers">("students");
  const [search, setSearch] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const students = useStudents({ pageSize: 100, search }, context);
  const faculty = useFacultyProfiles({ pageSize: 100, search }, context);
  const organizers = useOrganizerProfiles({ pageSize: 100, search }, context);

  const studentColumns = useMemo<ColumnDef<Student>[]>(() => [
    { header: "Student no.", accessorKey: "studentNumber" },
    { header: "Program", accessorKey: "programId" },
    { header: "Year", accessorKey: "yearLevel" },
    { header: "Section", accessorKey: "section" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { header: "Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], []);
  const facultyColumns = useMemo<ColumnDef<FacultyProfile>[]>(() => [
    { header: "Employee no.", accessorKey: "employeeNumber" },
    { header: "Department", accessorKey: "departmentId" },
    { header: "Title", accessorKey: "title" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.employmentStatus} tone={statusTone(row.original.employmentStatus)} /> },
    { header: "Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], []);
  const organizerColumns = useMemo<ColumnDef<OrganizerProfile>[]>(() => [
    { header: "Employee no.", accessorKey: "employeeNumber" },
    { header: "Organization", accessorKey: "organizationName" },
    { header: "Position", accessorKey: "position" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.employmentStatus} tone={statusTone(row.original.employmentStatus)} /> },
    { header: "Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], []);

  const activeQuery = tab === "students" ? students : tab === "faculty" ? faculty : organizers;
  const selectedDescription =
    selectedDetail ? `Selected record: ${selectedDetail}. Full editing workflows remain deferred to later admin phases.` : "Select a record to inspect details.";

  return (
    <AdminFrame>
      <PageHeader title="Users and roles" description="Admin-only mock user directory grouped by Students, Faculty, and Organizers." />
      <TabBar
        label="User management tabs"
        selected={tab}
        onSelect={(value) => {
          setTab(value);
          setSelectedDetail(null);
        }}
        tabs={[
          { label: "Students", value: "students" },
          { label: "Faculty", value: "faculty" },
          { label: "Organizers", value: "organizers" }
        ]}
      />
      <FilterBar
        search={search}
        selectedFilter={tab}
        filters={[
          { label: "Students", value: "students" },
          { label: "Faculty", value: "faculty" },
          { label: "Organizers", value: "organizers" }
        ]}
        onSearchChange={setSearch}
        onFilterChange={(value) => setTab(value as "students" | "faculty" | "organizers")}
      />
      {activeQuery.isLoading ? <LoadingState label="Loading user management records" /> : null}
      {activeQuery.isError && !isEmptyResult(activeQuery.error) ? <ErrorPanel /> : null}
      {tab === "students" && students.data ? <DataTable data={students.data.items} columns={studentColumns} emptyTitle="No students found" /> : null}
      {tab === "faculty" && faculty.data ? <DataTable data={faculty.data.items} columns={facultyColumns} emptyTitle="No faculty found" /> : null}
      {tab === "organizers" && organizers.data ? <DataTable data={organizers.data.items} columns={organizerColumns} emptyTitle="No organizers found" /> : null}
      {activeQuery.isError && isEmptyResult(activeQuery.error) ? <EmptyState title={`No ${tab} found`} description="Adjust the search or filters and try again." /> : null}
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Details view</h2>
        <p className="mt-2 text-sm text-muted-foreground">{selectedDescription}</p>
      </section>
    </AdminFrame>
  );
}

export function AdminAcademicPage() {
  const { context } = useAdminContext();
  const [tab, setTab] = useState<"classes" | "events">("classes");
  const [eventView, setEventView] = useState<"approved" | "pending">("approved");
  const [search, setSearch] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const classes = useClasses({ pageSize: 100, search }, context);
  const events = useEvents({ pageSize: 100, search }, context);
  const students = useStudents({ pageSize: 100 }, context);
  const { addStudentMutation, removeStudentMutation } = useRosterMutations(context);
  const eventStatusMutation = useEventStatusMutation(context);
  const filteredEvents = (events.data?.items ?? []).filter((event) => event.status === eventView);
  const classColumns = useMemo<ColumnDef<Class>[]>(() => [
    { header: "Subject", cell: ({ row }) => `${row.original.subjectCode} - ${row.original.subjectTitle}` },
    { header: "Section", accessorKey: "section" },
    { header: "Room", accessorKey: "room" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { header: "Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], [setSelectedDetail]);
  const eventColumns = useMemo<ColumnDef<Event>[]>(() => [
    { header: "Code", accessorKey: "code" },
    { header: "Title", accessorKey: "title" },
    { header: "Category", accessorKey: "category" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    {
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            type="button"
            disabled={row.original.status !== "pending"}
            onClick={() => eventStatusMutation.mutate({ eventId: row.original.id, status: "approved" })}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={row.original.status !== "pending"}
            onClick={() => eventStatusMutation.mutate({ eventId: row.original.id, status: "rejected", reason: "Rejected in mock admin review." })}
          >
            Reject
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button>
        </div>
      )
    }
  ], [eventStatusMutation, setSelectedDetail]);
  const enrolledStudents = students.data?.items.filter((student) => student.status === "enrolled") ?? [];

  return (
    <AdminFrame>
      <PageHeader title="Academic management" description="Mock classes, rosters, and event approval actions." />
      <TabBar
        label="Academic management tabs"
        selected={tab}
        onSelect={(value) => {
          setTab(value);
          setSelectedDetail(null);
        }}
        tabs={[
          { label: "Classes", value: "classes" },
          { label: "Events", value: "events" }
        ]}
      />
      <FilterBar
        search={search}
        selectedFilter={tab}
        filters={[
          { label: "Classes", value: "classes" },
          { label: "Events", value: "events" }
        ]}
        onSearchChange={setSearch}
        onFilterChange={(value) => setTab(value as "classes" | "events")}
      />
      {tab === "classes" ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Roster maintenance</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">Select class</option>
              {(classes.data?.items ?? []).map((classRecord) => <option key={classRecord.id} value={classRecord.id}>{classRecord.subjectCode}</option>)}
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Select enrolled student</option>
              {enrolledStudents.map((student) => <option key={student.id} value={student.id}>{student.studentNumber}</option>)}
            </select>
            <Button type="button" disabled={!classId || !studentId} onClick={() => addStudentMutation.mutate({ classId, studentId })}>Add</Button>
            <Button type="button" variant="outline" disabled={!classId || !studentId} onClick={() => removeStudentMutation.mutate({ classId, studentId })}>Remove</Button>
          </div>
          {addStudentMutation.isError || removeStudentMutation.isError ? (
            <p className="mt-3 text-sm text-danger">Roster action could not be completed in the mock repository.</p>
          ) : null}
        </section>
      ) : (
        <TabBar
          label="Events review tabs"
          selected={eventView}
          onSelect={setEventView}
          tabs={[
            { label: "Approved Events", value: "approved" },
            { label: "Pending Events", value: "pending" }
          ]}
        />
      )}
      {classes.isLoading || events.isLoading ? <LoadingState label="Loading academic records" /> : null}
      {classes.isError || events.isError ? <ErrorPanel /> : null}
      {tab === "classes" && classes.data ? <DataTable data={classes.data.items} columns={classColumns} emptyTitle="No classes found" /> : null}
      {tab === "events" && events.data ? (
        <DataTable data={filteredEvents} columns={eventColumns} emptyTitle={`No ${eventView} events found`} />
      ) : null}
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Details view</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedDetail ? `Selected academic record: ${selectedDetail}.` : "Select a class or event to review details."}
        </p>
      </section>
    </AdminFrame>
  );
}

export function AdminAttendancePage() {
  const { context } = useAdminContext();
  const [tab, setTab] = useState<"class" | "event">("class");
  const [search, setSearch] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const sessions = useAttendanceSessions({ pageSize: 100, search }, context);
  const records = useAttendanceRecords({ pageSize: 100 }, context);
  const sessionRecords = useMemo(() => records.data?.items ?? [], [records.data?.items]);
  const filteredSessions = (sessions.data?.items ?? []).filter((session) => session.type === tab);
  const sessionColumns = useMemo<ColumnDef<AttendanceSession>[]>(() => [
    { header: "Session", accessorKey: "title" },
    { header: "Type", accessorKey: "type" },
    { header: "Mode", accessorKey: "mode" },
    { header: "Present", cell: ({ row }) => countRecordsForSession(sessionRecords, row.original.id, "present") },
    { header: "Late", cell: ({ row }) => countRecordsForSession(sessionRecords, row.original.id, "late") },
    { header: "Absent", cell: ({ row }) => countRecordsForSession(sessionRecords, row.original.id, "absent") },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { header: "Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], [sessionRecords]);
  const recordColumns = useMemo<ColumnDef<AttendanceRecord>[]>(() => [
    { header: "Student", accessorKey: "studentId" },
    { header: "Session", accessorKey: "sessionId" },
    { header: "Method", accessorKey: "verificationMethod" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { header: "Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedDetail(row.original.id)}>View</Button> }
  ], []);
  const visibleSessionIds = new Set(filteredSessions.map((session) => session.id));
  const filteredRecords = sessionRecords.filter((record) => visibleSessionIds.has(record.sessionId));

  return (
    <AdminFrame>
      <PageHeader title="Attendance monitoring" description="Class and event attendance records from mock repositories." />
      <TabBar
        label="Attendance records tabs"
        selected={tab}
        onSelect={(value) => {
          setTab(value);
          setSelectedDetail(null);
        }}
        tabs={[
          { label: "Class Sessions", value: "class" },
          { label: "Event Sessions", value: "event" }
        ]}
      />
      <FilterBar
        search={search}
        selectedFilter={tab}
        filters={[{ label: "Class Sessions", value: "class" }, { label: "Event Sessions", value: "event" }]}
        onSearchChange={setSearch}
        onFilterChange={(value) => setTab(value as "class" | "event")}
      />
      {sessions.isLoading || records.isLoading ? <LoadingState label="Loading attendance" /> : null}
      {sessions.isError || records.isError ? <ErrorPanel /> : null}
      {sessions.data ? <DataTable data={filteredSessions} columns={sessionColumns} emptyTitle="No sessions found" /> : null}
      {records.data ? <DataTable data={filteredRecords} columns={recordColumns} emptyTitle="No attendance records found" /> : null}
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Details view</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedDetail ? `Selected attendance item: ${selectedDetail}.` : "Select a session or record to review details."}
        </p>
      </section>
    </AdminFrame>
  );
}

export function AdminNfcCredentialsPage() {
  const { context } = useAdminContext();
  const [tab, setTab] = useState<"nfc" | "qr" | "face">("nfc");
  const [search, setSearch] = useState("");
  const credentials = useNfcCredentials({ pageSize: 100 }, context);
  const updateStatus = useNfcCredentialStatusMutation(context);
  const setStatus = useCallback(
    (credentialId: string, status: NfcCredentialStatus) => updateStatus.mutate({ credentialId, status }),
    [updateStatus]
  );
  const columns = useMemo<ColumnDef<NfcCredential>[]>(() => [
    { header: "Masked credential", cell: ({ row }) => maskIdentifier(row.original.nfcUid) },
    { header: "Student", accessorKey: "studentId" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    {
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button size="sm" type="button" onClick={() => setStatus(row.original.id, "activated")}>Activate</Button>
          <Button size="sm" variant="outline" type="button" onClick={() => setStatus(row.original.id, "blocked")}>Block</Button>
        </div>
      )
    }
  ], [setStatus]);
  const filteredCredentials = (credentials.data?.items ?? []).filter((credential) =>
    [credential.studentId, credential.status, credential.nfcUid].some((value) => value.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <AdminFrame>
      <PageHeader title="Authentication methods" description="Admin review area for MVP NFC credentials and future fallback methods." />
      <TabBar
        label="Authentication methods tabs"
        selected={tab}
        onSelect={setTab}
        tabs={[
          { label: "NFC Credentials", value: "nfc" },
          { label: "QR Credentials", value: "qr" },
          { label: "Facial Recognition", value: "face" }
        ]}
      />
      {tab === "nfc" ? (
        <>
          <FilterBar
            search={search}
            selectedFilter="nfc"
            filters={[{ label: "NFC Credentials", value: "nfc" }]}
            onSearchChange={setSearch}
            onFilterChange={() => undefined}
          />
          {credentials.isLoading ? <LoadingState label="Loading NFC credentials" /> : null}
          {credentials.isError ? <ErrorPanel /> : null}
          {credentials.data ? <DataTable data={filteredCredentials} columns={columns} emptyTitle="No NFC credentials found" /> : null}
        </>
      ) : null}
      {tab === "qr" ? (
        <DeferredFeaturePanel title="QR Credentials" message="QR attendance fallback will be implemented in Phase 11." />
      ) : null}
      {tab === "face" ? (
        <DeferredFeaturePanel
          title="Facial Recognition"
          message="Facial Recognition is outside the PLPass MVP and will not be implemented in the current version."
        />
      ) : null}
    </AdminFrame>
  );
}

export function AdminNfcReadersPage() {
  const { context } = useAdminContext();
  const readers = useNfcReaders({ pageSize: 100 }, context);
  const updateStatus = useNfcReaderStatusMutation(context);
  const setStatus = useCallback(
    (readerId: string, status: NfcReaderStatus) => updateStatus.mutate({ readerId, status }),
    [updateStatus]
  );
  const columns = useMemo<ColumnDef<NfcReader>[]>(() => [
    { header: "Reader", accessorKey: "label" },
    { header: "Serial", accessorKey: "serialNumber" },
    { header: "Location", accessorKey: "location" },
    { header: "Trusted", cell: ({ row }) => <StatusBadge label={row.original.isTrusted ? "trusted" : "untrusted"} tone={row.original.isTrusted ? "success" : "warning"} /> },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    {
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button size="sm" type="button" onClick={() => setStatus(row.original.id, "active")}>Active</Button>
          <Button size="sm" variant="outline" type="button" onClick={() => setStatus(row.original.id, "maintenance")}>Maintenance</Button>
        </div>
      )
    }
  ], [setStatus]);

  return (
    <AdminFrame>
      <PageHeader title="NFC readers" description="USB reader inventory and mock status monitoring." />
      {readers.isLoading ? <LoadingState label="Loading NFC readers" /> : null}
      {readers.isError ? <ErrorPanel /> : null}
      {readers.data ? <DataTable data={readers.data.items} columns={columns} emptyTitle="No NFC readers found" /> : null}
    </AdminFrame>
  );
}

export function AdminReportsPage() {
  const { context } = useAdminContext();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const reports = useReports({ pageSize: 100 }, context);
  const filteredReports = (reports.data?.items ?? []).filter(
    (report) =>
      (status === "all" || report.status === status) &&
      [report.title, report.scope, report.status].some((value) => value.toLowerCase().includes(search.toLowerCase()))
  );
  const columns = useMemo<ColumnDef<Report>[]>(() => [
    { header: "Title", accessorKey: "title" },
    { header: "Scope", accessorKey: "scope" },
    { header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { header: "Generated", cell: ({ row }) => row.original.generatedAt ?? "Pending" }
  ], []);

  return (
    <AdminFrame>
      <PageHeader
        title="Reports"
        description="Report history and filters with PDF and XLSX generation deferred to Phase 12."
        actions={<Button type="button" disabled title="Report generation is Phase 12 functionality">Generate report</Button>}
      />
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Report filters</h2>
        <div className="mt-3">
          <FilterBar
            search={search}
            selectedFilter={status}
            filters={[
              { label: "All", value: "all" },
              { label: "Ready", value: "ready" },
              { label: "Processing", value: "processing" },
              { label: "Failed", value: "failed" }
            ]}
            onSearchChange={setSearch}
            onFilterChange={setStatus}
          />
        </div>
      </section>
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Phase 12 export controls</h2>
        <p className="mt-2 text-sm text-muted-foreground">PDF and XLSX generation are Phase 12 functionality.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" disabled title="PDF generation is Phase 12 functionality">Generate PDF</Button>
          <Button type="button" variant="outline" disabled title="XLSX generation is Phase 12 functionality">Generate XLSX</Button>
        </div>
      </section>
      {reports.isLoading ? <LoadingState label="Loading reports" /> : null}
      {reports.isError ? <ErrorPanel /> : null}
      {reports.data ? <DataTable data={filteredReports} columns={columns} emptyTitle="No report history found" /> : null}
    </AdminFrame>
  );
}

export function AdminAnalyticsPage() {
  const { context } = useAdminContext();
  const predictions = useMlPredictions({ pageSize: 100 }, context);
  const riskData = useMemo(() => {
    const source = predictions.data?.items ?? [];
    return ["low", "medium", "high", "critical"].map((level) => ({
      label: level,
      watchlist: source.filter((prediction) => prediction.riskLevel === level && prediction.score < 0.8).length,
      atRisk: source.filter((prediction) => prediction.riskLevel === level && prediction.score >= 0.8).length
    }));
  }, [predictions.data?.items]);
  const participationData = useMemo(() => (predictions.data?.items ?? []).map((prediction) => ({
    label: prediction.patternLabel.slice(0, 10),
    participation: Math.round(prediction.score * 100)
  })), [predictions.data?.items]);
  const columns = useMemo<ColumnDef<MlPrediction>[]>(() => [
    { header: "Model", accessorKey: "type" },
    { header: "Signal", accessorKey: "patternLabel" },
    { header: "Review", cell: () => <StatusBadge label="Review-only" tone="info" /> },
    { header: "Risk", cell: ({ row }) => <StatusBadge label={row.original.riskLevel} tone={statusTone(row.original.riskLevel)} /> },
    { header: "Score", cell: ({ row }) => `${Math.round(row.original.score * 100)}%` }
  ], []);
  const insightSections = [
    {
      title: "Absenteeism Risk Prediction",
      type: "random_forest_risk",
      description: "Review-only absenteeism risk signals. No automatic decisions are made."
    },
    {
      title: "Attendance Anomaly Detection",
      type: "linear_regression_anomaly",
      description: "Review-only anomaly signals for unusual attendance patterns."
    },
    {
      title: "Participation Clustering",
      type: "k_means_cluster",
      description: "Review-only participation groupings for planning and support."
    }
  ];

  return (
    <AdminFrame>
      <PageHeader title="Analytics" description="Review-only mock analytics. Facial recognition remains outside the MVP." />
      {predictions.isLoading ? <LoadingState label="Loading analytics" /> : null}
      {predictions.isError ? <ErrorPanel /> : null}
      <section className="grid gap-4 xl:grid-cols-2">
        <RiskSummaryChart data={riskData} />
        <ParticipationBarChart data={participationData} />
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        {insightSections.map((section) => {
          const items = (predictions.data?.items ?? []).filter((prediction) => prediction.type === section.type);
          return (
            <article key={section.type} className="rounded-lg border bg-surface p-4">
              <StatusBadge label="Review-only" tone="info" />
              <h2 className="mt-3 text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
              <div className="mt-4 space-y-3">
                {items.length > 0 ? (
                  items.map((item) => (
                    <div key={item.id} className="rounded-md border bg-background p-3">
                      <p className="font-medium">{item.patternLabel}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.explanation}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No review signals found" />
                )}
              </div>
            </article>
          );
        })}
      </section>
      {predictions.data ? <DataTable data={predictions.data.items} columns={columns} emptyTitle="No analytics signals found" /> : null}
    </AdminFrame>
  );
}

export function AdminAuditLogsPage() {
  const { context } = useAdminContext();
  const [search, setSearch] = useState("");
  const logs = useAuditLogs({ pageSize: 100, search }, context);
  const columns = useMemo<ColumnDef<AuditLog>[]>(() => [
    { header: "Action", accessorKey: "action" },
    { header: "Target", cell: ({ row }) => `${row.original.targetType}: ${row.original.targetId}` },
    { header: "Actor", accessorKey: "actorUserId" },
    { header: "Timestamp", accessorKey: "timestamp" }
  ], []);

  return (
    <AdminFrame>
      <PageHeader title="Audit logs" description="Admin-only audit trail with mock search filtering." />
      <SearchInput value={search} placeholder="Filter audit logs" onChange={setSearch} />
      {logs.isLoading ? <LoadingState label="Loading audit logs" /> : null}
      {logs.isError && isEmptyResult(logs.error) ? <EmptyState title="No audit logs found" /> : null}
      {logs.isError && !isEmptyResult(logs.error) ? <ErrorPanel /> : null}
      {logs.data ? <DataTable data={logs.data.items} columns={columns} emptyTitle="No audit logs found" /> : null}
    </AdminFrame>
  );
}

const settingsSchema = z.object({
  institutionName: z.string().min(2),
  currentSchoolYear: z.string().min(4),
  attendanceLateCutoffMinutes: z.coerce.number().min(0).max(120),
  defaultSessionDurationMinutes: z.coerce.number().min(15).max(480),
  readerPolicy: z.string().min(2),
  credentialStatusPolicy: z.string().min(2),
  notificationPreferencePlaceholder: z.string().min(2)
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function AdminSettingsPage() {
  const { context } = useAdminContext();
  const settings = useSystemSettings(context);
  const catalog = useAcademicCatalog({ pageSize: 100 }, context);
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    values: settings.data
      ? {
          institutionName: settings.data.institutionName,
          currentSchoolYear: settings.data.currentSchoolYear,
          attendanceLateCutoffMinutes: settings.data.attendanceLateCutoffMinutes,
          defaultSessionDurationMinutes: settings.data.defaultSessionDurationMinutes,
          readerPolicy: settings.data.readerPolicy,
          credentialStatusPolicy: settings.data.credentialStatusPolicy,
          notificationPreferencePlaceholder: settings.data.notificationPreferencePlaceholder
        }
      : undefined
  });
  const submit = form.handleSubmit((values) => settings.updateMutation.mutate(values));

  return (
    <AdminFrame>
      <PageHeader title="System settings" description="Mock-only institution and attendance policy settings." />
      {settings.isLoading || catalog.semesters.isLoading ? <LoadingState label="Loading settings" /> : null}
      {settings.isError ? <ErrorPanel /> : null}
      {settings.data ? (
        <form className="grid gap-4 rounded-lg border bg-surface p-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
          {[
            ["Institution name", "institutionName"],
            ["School year", "currentSchoolYear"],
            ["Late cutoff minutes", "attendanceLateCutoffMinutes"],
            ["Default session minutes", "defaultSessionDurationMinutes"],
            ["Reader policy", "readerPolicy"],
            ["Credential policy", "credentialStatusPolicy"],
            ["Notification placeholder", "notificationPreferencePlaceholder"]
          ].map(([label, name]) => (
            <label key={name} className="space-y-2 text-sm font-medium">
              <span>{label}</span>
              <input className="plpass-field h-10 w-full rounded-md border px-3" {...form.register(name as keyof SettingsFormValues)} />
            </label>
          ))}
          <div className="md:col-span-2 flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">Current semester: {settings.data.currentSemesterId}</p>
            <Button type="submit" disabled={settings.updateMutation.isPending}>Save settings</Button>
          </div>
          {settings.updateMutation.isSuccess ? <p className="text-sm text-success md:col-span-2">Settings saved in mock state.</p> : null}
        </form>
      ) : null}
    </AdminFrame>
  );
}

export function AdminRootPage() {
  return <AdminDashboardPage />;
}
