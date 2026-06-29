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

export function AnalyticsPage() {
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
      {predictions.data ? <PLPassDataGrid label="Admin analytics signals" data={predictions.data.items} columns={columns} emptyTitle="No analytics signals found" /> : null}
    </AdminFrame>
  );
}
