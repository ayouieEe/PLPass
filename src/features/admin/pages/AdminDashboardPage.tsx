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
