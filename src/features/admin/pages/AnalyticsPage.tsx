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
  AdminTabs,
  AdminTableExportActions,
  AdminToolbar,
  compactProgram,
  formatDateTime,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useAttendanceRecords, useAttendanceSessions, useEvents, useMlPredictions, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { AttendanceSession, MlPrediction } from "@/types/domain";

type InsightTab = "prediction" | "feedback";

function eventContext(events: ReturnType<typeof useEvents>["data"], prediction: MlPrediction) {
  return events?.items.find((item) => item.id === prediction.eventId)?.title ?? "Event attendance signal";
}

function sessionAttendance(records: Array<{ sessionId: string; status: string }>, sessionId: string) {
  const sessionRecords = records.filter((record) => record.sessionId === sessionId);
  const present = sessionRecords.filter((record) => record.status === "present").length;
  const late = sessionRecords.filter((record) => record.status === "late").length;
  return {
    total: sessionRecords.length,
    attended: present + late,
    attendanceRate: sessionRecords.length ? Math.round(((present + late) / sessionRecords.length) * 100) : 0
  };
}

export function AnalyticsPage() {
  const scope = useAdminScope();
  const [tab, setTab] = useState<InsightTab>("prediction");
  const [search, setSearch] = useState("");
  const predictions = useMlPredictions({ pageSize: 100 }, scope.context);
  const users = useUsers({ pageSize: 100 }, scope.context);
  const students = useStudents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const events = useEvents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const sessions = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const records = useAttendanceRecords({ pageSize: 100 }, scope.context);

  const predictionRows = (predictions.data?.items ?? []).filter((prediction) =>
    prediction.type === "random_forest_risk" &&
    [prediction.patternLabel, prediction.explanation, prediction.riskLevel].join(" ").toLowerCase().includes(search.toLowerCase())
  );
  const eventSessions = (sessions.data?.items ?? []).filter((session) =>
    session.type === "event" &&
    [session.title, session.status, session.mode].join(" ").toLowerCase().includes(search.toLowerCase())
  );
  const recordItems = useMemo(() => records.data?.items ?? [], [records.data?.items]);

  const riskData = useMemo(() => ["low", "medium", "high", "critical"].map((level) => ({
    label: level,
    watchlist: predictionRows.filter((prediction) => prediction.riskLevel === level && prediction.score < 0.8).length,
    atRisk: predictionRows.filter((prediction) => prediction.riskLevel === level && prediction.score >= 0.8).length
  })), [predictionRows]);

  const turnoutData = useMemo(() => predictionRows.map((prediction) => ({
    label: prediction.patternLabel.slice(0, 16),
    participation: Math.round(prediction.score * 100)
  })), [predictionRows]);

  const predictionColumns = useMemo<ColumnDef<MlPrediction>[]>(() => [
    { header: "Student Name", cell: ({ row }) => userName(users.data?.items ?? [], students.data?.items.find((student) => student.id === row.original.studentId)?.userId) },
    { header: "Student ID", cell: ({ row }) => students.data?.items.find((student) => student.id === row.original.studentId)?.studentNumber ?? "Group signal" },
    { header: "Event Context", cell: ({ row }) => eventContext(events.data, row.original) },
    { header: "Risk Level", cell: ({ row }) => <StatusBadge label={row.original.riskLevel} tone={statusTone(row.original.riskLevel)} /> },
    { header: "Predicted Turnout", cell: ({ row }) => `${Math.round(row.original.score * 100)}%` },
    { header: "Supporting Indicators", accessorKey: "explanation" },
    { header: "Last Updated", cell: ({ row }) => formatDateTime(row.original.generatedAt) },
    { header: "Actions", cell: () => <Button type="button" size="sm" variant="outline">View</Button> }
  ], [events.data, students.data?.items, users.data?.items]);

  const feedbackColumns = useMemo<ColumnDef<AttendanceSession>[]>(() => [
    { header: "Event Session", accessorKey: "title" },
    { header: "Event ID", cell: ({ row }) => row.original.eventId ?? row.original.id },
    { header: "Mode", cell: ({ row }) => row.original.mode },
    { header: "Attendance Rate", cell: ({ row }) => `${sessionAttendance(recordItems, row.original.id).attendanceRate}%` },
    { header: "Records Captured", cell: ({ row }) => sessionAttendance(recordItems, row.original.id).total },
    { header: "Objective Signal", cell: ({ row }) => {
      const rate = sessionAttendance(recordItems, row.original.id).attendanceRate;
      return rate >= 80 ? "Objective met" : rate >= 50 ? "Needs monitoring" : "Follow-up needed";
    } },
    { header: "Program Signal", cell: () => compactProgram(scope.programs, students.data?.items[0]?.programId) },
    { header: "Last Activity", cell: ({ row }) => formatDateTime(row.original.endsAt ?? row.original.startsAt) }
  ], [recordItems, scope.programs, students.data?.items]);

  return (
    <AdminFrame>
      <AdminPageHeader title="Analytics Insights" description="Random Forest event attendance prediction and feedback insights." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search insights">
        <StatusBadge label="Review-only" tone="info" />
      </AdminToolbar>
      <AdminTabs
        label="Analytics insight tabs"
        selected={tab}
        onSelect={setTab}
        tabs={[
          { label: "Event Attendance Prediction", value: "prediction" },
          { label: "Feedback and Objective Insights", value: "feedback" }
        ]}
      />
      {scope.isLoading || predictions.isLoading || sessions.isLoading || records.isLoading ? <LoadingState label="Loading analytics insights" /> : null}
      {tab === "prediction" ? (
        <>
          <section className="grid gap-4 xl:grid-cols-2">
            {predictionRows.length ? <RiskSummaryChart data={riskData} /> : <EmptyState title="No prediction distribution data" />}
            {predictionRows.length ? <ParticipationBarChart data={turnoutData} /> : <EmptyState title="No turnout prediction data" />}
          </section>
          <PLPassDataGrid label="Event attendance prediction" data={predictionRows} columns={predictionColumns} emptyTitle="No event attendance predictions" emptyDescription="Random Forest prediction rows will appear after event attendance signals are generated." toolbarActions={<AdminTableExportActions />} />
        </>
      ) : (
        <PLPassDataGrid label="Feedback and objective insights" data={eventSessions} columns={feedbackColumns} emptyTitle="No feedback insights" emptyDescription="Event session feedback and objective signals will appear after attendance records are captured." toolbarActions={<AdminTableExportActions />} />
      )}
    </AdminFrame>
  );
}
