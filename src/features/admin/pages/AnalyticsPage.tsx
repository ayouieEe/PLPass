import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ParticipationBarChart } from "@/components/charts/ParticipationBarChart";
import { RiskSummaryChart } from "@/components/charts/RiskSummaryChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminToolbar,
  compactProgram,
  formatDateTime,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useClasses, useEvents, useMlPredictions, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { MlPrediction } from "@/types/domain";

function contextLabel(classes: ReturnType<typeof useClasses>["data"], events: ReturnType<typeof useEvents>["data"], prediction: MlPrediction) {
  return classes?.items.find((item) => item.id === prediction.classId)?.subjectCode ?? events?.items.find((item) => item.id === prediction.eventId)?.code ?? "Department context";
}

export function AnalyticsPage() {
  const scope = useAdminScope();
  const [search, setSearch] = useState("");
  const predictions = useMlPredictions({ pageSize: 100 }, scope.context);
  const users = useUsers({ pageSize: 100 }, scope.context);
  const students = useStudents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const classes = useClasses({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const events = useEvents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);

  const items = (predictions.data?.items ?? []).filter((prediction) =>
    [prediction.patternLabel, prediction.explanation, prediction.riskLevel, prediction.type].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const riskData = useMemo(() => ["low", "medium", "high", "critical"].map((level) => ({
    label: level,
    watchlist: items.filter((prediction) => prediction.riskLevel === level && prediction.score < 0.8).length,
    atRisk: items.filter((prediction) => prediction.riskLevel === level && prediction.score >= 0.8).length
  })), [items]);

  const participationData = useMemo(() => items.map((prediction) => ({
    label: prediction.patternLabel.slice(0, 16),
    participation: Math.round(prediction.score * 100)
  })), [items]);

  const riskColumns = useMemo<ColumnDef<MlPrediction>[]>(() => [
    { header: "Student Name", cell: ({ row }) => userName(users.data?.items ?? [], students.data?.items.find((student) => student.id === row.original.studentId)?.userId) },
    { header: "Student ID", cell: ({ row }) => students.data?.items.find((student) => student.id === row.original.studentId)?.studentNumber ?? "Group signal" },
    { header: "Class or Event Context", cell: ({ row }) => contextLabel(classes.data, events.data, row.original) },
    { header: "Risk Level", cell: ({ row }) => <StatusBadge label={row.original.riskLevel} tone={statusTone(row.original.riskLevel)} /> },
    { header: "Supporting Attendance Indicators", accessorKey: "explanation" },
    { header: "Last Updated", cell: ({ row }) => formatDateTime(row.original.generatedAt) },
    { header: "View Details", cell: () => <Button type="button" size="sm" variant="outline">View</Button> }
  ], [classes.data, events.data, students.data?.items, users.data?.items]);

  const anomalyColumns = useMemo<ColumnDef<MlPrediction>[]>(() => [
    { header: "Class or Event", cell: ({ row }) => contextLabel(classes.data, events.data, row.original) },
    { header: "Anomaly Type", accessorKey: "patternLabel" },
    { header: "Detected Date", cell: ({ row }) => formatDateTime(row.original.generatedAt) },
    { header: "Severity", cell: ({ row }) => <StatusBadge label={row.original.riskLevel} tone={statusTone(row.original.riskLevel)} /> },
    { header: "Supporting Metric", cell: ({ row }) => `${Math.round(row.original.score * 100)}% confidence` },
    { header: "View Details", cell: () => <Button type="button" size="sm" variant="outline">View</Button> }
  ], [classes.data, events.data]);

  const clusterColumns = useMemo<ColumnDef<MlPrediction>[]>(() => [
    { header: "Student Name", cell: ({ row }) => userName(users.data?.items ?? [], students.data?.items.find((student) => student.id === row.original.studentId)?.userId) },
    { header: "Student ID", cell: ({ row }) => students.data?.items.find((student) => student.id === row.original.studentId)?.studentNumber ?? "Group signal" },
    { header: "Cluster Label", accessorKey: "patternLabel" },
    { header: "Attendance Pattern Summary", cell: ({ row }) => `${row.original.explanation} ${compactProgram(scope.programs, students.data?.items.find((student) => student.id === row.original.studentId)?.programId)}` },
    { header: "Last Updated", cell: ({ row }) => formatDateTime(row.original.generatedAt) },
    { header: "View Details", cell: () => <Button type="button" size="sm" variant="outline">View</Button> }
  ], [scope.programs, students.data?.items, users.data?.items]);

  const riskRows = items.filter((prediction) => prediction.type === "random_forest_risk");
  const anomalyRows = items.filter((prediction) => prediction.type === "linear_regression_anomaly");
  const clusterRows = items.filter((prediction) => prediction.type === "k_means_cluster");

  return (
    <AdminFrame>
      <AdminPageHeader title="Analytics" description="Review-only decision support for attendance patterns. Predictions never change grades, attendance, permissions, or student status automatically." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search analytics">
        <StatusBadge label="Review-only" tone="info" />
        <StatusBadge label="Date range: repository data" tone="muted" />
      </AdminToolbar>
      {scope.isLoading || predictions.isLoading ? <LoadingState label="Loading analytics" /> : null}
      <section className="grid gap-4 xl:grid-cols-2">
        {items.length ? <RiskSummaryChart data={riskData} /> : <EmptyState title="No risk distribution data" />}
        {items.length ? <ParticipationBarChart data={participationData} /> : <EmptyState title="No participation cluster data" />}
      </section>
      <section className="space-y-3">
        <div>
          <StatusBadge label="Review-only" tone="info" />
          <h2 className="mt-2 text-lg font-semibold">Absenteeism Risk Prediction</h2>
          <p className="text-sm text-muted-foreground">Who may need early support?</p>
        </div>
        <PLPassDataGrid label="Absenteeism risk prediction" data={riskRows} columns={riskColumns} emptyTitle="No absenteeism risk signals" />
      </section>
      <section className="space-y-3">
        <div>
          <StatusBadge label="Review-only" tone="info" />
          <h2 className="mt-2 text-lg font-semibold">Attendance Anomaly Detection</h2>
          <p className="text-sm text-muted-foreground">Is an attendance pattern changing unexpectedly?</p>
        </div>
        <PLPassDataGrid label="Attendance anomaly detection" data={anomalyRows} columns={anomalyColumns} emptyTitle="No attendance anomalies" />
      </section>
      <section className="space-y-3">
        <div>
          <StatusBadge label="Review-only" tone="info" />
          <h2 className="mt-2 text-lg font-semibold">Participation Clustering</h2>
          <p className="text-sm text-muted-foreground">Which students show similar participation patterns?</p>
        </div>
        <PLPassDataGrid label="Participation clustering" data={clusterRows} columns={clusterColumns} emptyTitle="No participation clusters" />
      </section>
    </AdminFrame>
  );
}
