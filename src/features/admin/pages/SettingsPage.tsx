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

export function SettingsPage() {
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
