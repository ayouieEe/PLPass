/* eslint-disable @typescript-eslint/no-unused-vars */
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

export function AcademicManagementPage() {
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
