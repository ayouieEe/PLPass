import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CalendarCheck, ClipboardList, TrendingUp, Users } from "lucide-react";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { PresentLateAbsentPieChart } from "@/components/charts/PresentLateAbsentPieChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminSectionCard,
  AdminStatGrid,
  AdminTableExportActions,
  formatDateTime,
  statusTone,
  useAdminScope,
  userName
  } from "@/features/admin/components/AdminPage";
import { useAttendanceRecords, useAttendanceSessions, useEvents, useMlPredictions, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { AttendanceSession } from "@/types/domain";

function countSessionRecords(records: Array<{ sessionId: string; status: string }>, sessionId: string, status?: string) {
  return records.filter((record) => record.sessionId === sessionId && (!status || record.status === status)).length;
}

export function AdminDashboardPage() {
  const scope = useAdminScope();
  const users = useUsers({ pageSize: 100 }, scope.context);
  const students = useStudents({ pageSize: 100 }, scope.context);
  const sessions = useAttendanceSessions({ pageSize: 100, semesterId: scope.activeSemester?.id }, scope.context);
  const records = useAttendanceRecords({ pageSize: 100 }, scope.context);
  const events = useEvents({ pageSize: 100 }, scope.context);
  const predictions = useMlPredictions({ pageSize: 100 }, scope.context);

  const isLoading = scope.isLoading || users.isLoading || students.isLoading || sessions.isLoading || records.isLoading || events.isLoading || predictions.isLoading;
  const hasPartialDataError = users.isError || students.isError || sessions.isError || records.isError || events.isError || predictions.isError;

  const recordItems = useMemo(() => records.data?.items ?? [], [records.data?.items]);
  const eventSessions = useMemo(
    () => (sessions.data?.items ?? []).filter((session) => session.type === "event"),
    [sessions.data?.items]
  );
  const activeSessions = eventSessions.filter((session) => session.status === "active");
  const randomForestRows = (predictions.data?.items ?? []).filter((prediction) => prediction.type === "random_forest_risk");
  const now = new Date();
  const eventsThisMonth = (events.data?.items ?? []).filter((event) => {
    const startsAt = new Date(event.startsAt);
    return event.status === "approved" && startsAt.getMonth() === now.getMonth() && startsAt.getFullYear() === now.getFullYear();
  });

  const trend = useMemo(() => eventSessions.slice(0, 7).map((session) => ({
    label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(session.startsAt)),
    present: countSessionRecords(recordItems, session.id, "present"),
    late: countSessionRecords(recordItems, session.id, "late"),
    absent: countSessionRecords(recordItems, session.id, "absent")
  })), [eventSessions, recordItems]);

  const riskSlices = useMemo(() => ["low", "medium", "high", "critical"].map((level) => ({
    name: level,
    value: randomForestRows.filter((prediction) => prediction.riskLevel === level).length
  })), [randomForestRows]);

  const activeColumns = useMemo<ColumnDef<AttendanceSession>[]>(() => [
    { header: "Event Session", accessorKey: "title" },
    { header: "Event ID", cell: ({ row }) => row.original.eventId ?? row.original.id },
    { header: "Organizer", cell: ({ row }) => userName(users.data?.items ?? [], row.original.createdByUserId) },
    { header: "Started At", cell: ({ row }) => formatDateTime(row.original.startsAt) },
    { header: "Current Attendance", cell: ({ row }) => countSessionRecords(recordItems, row.original.id) },
    { header: "Session Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { header: "Actions", cell: () => <Button type="button" size="sm" variant="outline">View</Button> }
  ], [recordItems, users.data?.items]);

  if (isLoading) {
    return <AdminFrame><LoadingState label="Loading admin dashboard" /></AdminFrame>;
  }

  if (scope.isError) {
    return (
      <AdminFrame>
        <AdminPageHeader title="Admin Dashboard" accessibleTitle="Admin dashboard" description="Department-level event operations overview." />
        <EmptyState title="Admin dashboard unavailable" description="The repository could not load the Dean overview." />
      </AdminFrame>
    );
  }

  const enrolledCount = students.data?.items.filter((student) => student.status === "enrolled").length ?? 0;
  const flaggedStudents = randomForestRows.filter((prediction) => ["high", "critical"].includes(prediction.riskLevel)).length;
  const pendingEvents = events.data?.items.filter((event) => event.status === "pending").length ?? 0;
  const predictedTurnout = randomForestRows.length
    ? `${Math.round((randomForestRows.reduce((sum, prediction) => sum + prediction.score, 0) / randomForestRows.length) * 100)}%`
    : "0%";
  const lastUpdated = recordItems[0]?.recordedAt ? formatDateTime(recordItems[0].recordedAt) : undefined;

  return (
    <AdminFrame>
      <AdminPageHeader
        title="Admin Dashboard"
        accessibleTitle="Admin dashboard"
        description="Dean overview for event attendance, approvals, and Random Forest risk signals."
      />
      <AdminContextBar
        department={scope.department}
        semester={scope.activeSemester}
        lastUpdated={lastUpdated}
        extra={hasPartialDataError ? <StatusBadge label="Some live data unavailable" tone="warning" /> : undefined}
      />

      <AdminStatGrid>
        <StatCard title="Enrolled students" value={String(enrolledCount)} icon={Users} />
        <StatCard title="Active event sessions" value={String(activeSessions.length)} icon={ClipboardList} />
        <StatCard title="Events this month" value={String(eventsThisMonth.length)} icon={CalendarCheck} />
        <StatCard title="Flagged students" value={String(flaggedStudents)} icon={AlertTriangle} tone={flaggedStudents ? "warning" : "default"} />
        <StatCard title="Pending approvals" value={String(pendingEvents)} icon={ClipboardList} tone={pendingEvents ? "warning" : "default"} />
        <StatCard title="Predicted turnout" value={predictedTurnout} icon={TrendingUp} />
      </AdminStatGrid>

      {trend.some((item) => item.present || item.late || item.absent) ? (
        <AttendanceTrendChart data={trend} />
      ) : (
        <EmptyState title="No attendance trend data" description="Completed event attendance activity will appear after records are captured." />
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <PLPassDataGrid label="Active event sessions" data={activeSessions} columns={activeColumns} emptyTitle="No active event sessions" emptyDescription="Active event attendance sessions will appear here." toolbarActions={<AdminTableExportActions />} />
        <AdminSectionCard title="Prediction overview">
          {riskSlices.some((slice) => slice.value) ? <PresentLateAbsentPieChart data={riskSlices} /> : <EmptyState title="No risk analysis available yet" />}
        </AdminSectionCard>
      </section>
    </AdminFrame>
  );
}
