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

export function UserManagementPage() {
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
