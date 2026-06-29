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
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
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

export function AttendanceMonitoringPage() {
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
      {sessions.data ? <PLPassDataGrid label="Attendance sessions" data={filteredSessions} columns={sessionColumns} emptyTitle="No sessions found" /> : null}
      {records.data ? <PLPassDataGrid label="Attendance records" data={filteredRecords} columns={recordColumns} emptyTitle="No attendance records found" /> : null}
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Details view</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedDetail ? `Selected attendance item: ${selectedDetail}.` : "Select a session or record to review details."}
        </p>
      </section>
    </AdminFrame>
  );
}
