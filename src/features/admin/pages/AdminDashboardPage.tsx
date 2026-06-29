import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CalendarCheck, ClipboardList, Users } from "lucide-react";
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
  AdminToolbar,
  formatDateTime,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useAttendanceRecords, useAttendanceSessions, useEvents, useFacultyProfiles, useMlPredictions, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { AttendanceSession } from "@/types/domain";

type ActivityFilter = "all" | "class" | "event";

function countSessionRecords(records: Array<{ sessionId: string; status: string }>, sessionId: string, status?: string) {
  return records.filter((record) => record.sessionId === sessionId && (!status || record.status === status)).length;
}

export function AdminDashboardPage() {
  const scope = useAdminScope();
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const users = useUsers({ pageSize: 100 }, scope.context);
  const students = useStudents({ pageSize: 100 }, scope.context);
  const faculty = useFacultyProfiles({ pageSize: 100 }, scope.context);
  const sessions = useAttendanceSessions({ pageSize: 100, semesterId: scope.activeSemester?.id }, scope.context);
  const records = useAttendanceRecords({ pageSize: 100 }, scope.context);
  const events = useEvents({ pageSize: 100 }, scope.context);
  const predictions = useMlPredictions({ pageSize: 100 }, scope.context);

  const isLoading = scope.isLoading || users.isLoading || students.isLoading || faculty.isLoading || sessions.isLoading || records.isLoading || events.isLoading || predictions.isLoading;
  const isError = scope.isError || users.isError || students.isError || faculty.isError || sessions.isError || records.isError || events.isError || predictions.isError;

  const sessionItems = useMemo(() => sessions.data?.items ?? [], [sessions.data?.items]);
  const recordItems = useMemo(() => records.data?.items ?? [], [records.data?.items]);
  const activeSessions = sessionItems.filter((session) => session.status === "active");
  const now = new Date();
  const eventsThisMonth = (events.data?.items ?? []).filter((event) => {
    const startsAt = new Date(event.startsAt);
    return event.status === "approved" && startsAt.getMonth() === now.getMonth() && startsAt.getFullYear() === now.getFullYear();
  });

  const trend = useMemo(() => {
    const filtered = sessionItems.filter((session) => activityFilter === "all" || session.type === activityFilter);
    return filtered.slice(0, 7).map((session) => ({
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(session.startsAt)),
      present: countSessionRecords(recordItems, session.id, "present"),
      late: countSessionRecords(recordItems, session.id, "late"),
      absent: countSessionRecords(recordItems, session.id, "absent")
    }));
  }, [activityFilter, recordItems, sessionItems]);

  const riskSlices = useMemo(() => {
    const source = predictions.data?.items ?? [];
    return ["low", "medium", "high", "critical"].map((level) => ({
      name: level,
      value: source.filter((prediction) => prediction.riskLevel === level).length
    }));
  }, [predictions.data?.items]);

  const activeColumns = useMemo<ColumnDef<AttendanceSession>[]>(() => [
    { header: "Session Type", accessorKey: "type" },
    { header: "Code", cell: ({ row }) => row.original.classId ?? row.original.eventId ?? row.original.id },
    { header: "Subject or Event Name", accessorKey: "title" },
    { header: "Faculty or Organizer", cell: ({ row }) => userName(users.data?.items ?? [], row.original.createdByUserId) },
    { header: "Started At", cell: ({ row }) => formatDateTime(row.original.startsAt) },
    { header: "Current Attendance Count", cell: ({ row }) => countSessionRecords(recordItems, row.original.id) },
    { header: "Session Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { header: "View Details", cell: () => <Button type="button" size="sm" variant="outline">View</Button> }
  ], [recordItems, users.data?.items]);

  if (isLoading) {
    return <AdminFrame><LoadingState label="Loading admin dashboard" /></AdminFrame>;
  }

  if (isError) {
    return (
      <AdminFrame>
        <AdminPageHeader title="Admin Dashboard" accessibleTitle="Admin dashboard" description="Department-level attendance and academic operations overview." />
        <EmptyState title="Admin dashboard unavailable" description="The repository could not load the Dean overview." />
      </AdminFrame>
    );
  }

  const enrolledCount = students.data?.items.filter((student) => student.status === "enrolled").length ?? 0;
  const highRiskCount = predictions.data?.items.filter((prediction) => ["high", "critical"].includes(prediction.riskLevel)).length ?? 0;
  const pendingEvents = events.data?.items.filter((event) => event.status === "pending").length ?? 0;
  const lastUpdated = recordItems[0]?.recordedAt ? formatDateTime(recordItems[0].recordedAt) : undefined;

  return (
    <AdminFrame>
      <AdminPageHeader
        title="Admin Dashboard"
        accessibleTitle="Admin dashboard"
        description="Department-level attendance and academic operations overview for assigned Dean scope."
      />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} lastUpdated={lastUpdated} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Enrolled students" value={String(enrolledCount)} icon={Users} description="Counts enrolled students only; LOA, dropped, and archived records are excluded." />
        <StatCard title="Active classes" value={String(activeSessions.filter((session) => session.type === "class").length)} icon={ClipboardList} description="Active class sessions in the selected semester." />
        <StatCard title="Events this month" value={String(eventsThisMonth.length)} icon={CalendarCheck} description="Approved events in the current calendar month." />
        <StatCard title="High-risk students" value={String(highRiskCount)} icon={AlertTriangle} description={highRiskCount ? "Review-only ML support signals." : "No risk analysis available yet."} tone={highRiskCount ? "warning" : "default"} />
        <StatCard title="Reviews and reminders" value={String(pendingEvents)} icon={ClipboardList} description="Pending event approvals from current repository data." />
      </section>

      <section className="space-y-3">
        <AdminToolbar
          selectedFilter={activityFilter}
          filters={[
            { label: "All activity", value: "all" },
            { label: "Classes only", value: "class" },
            { label: "Events only", value: "event" }
          ]}
          onFilterChange={(value) => setActivityFilter(value as ActivityFilter)}
        />
        {trend.some((item) => item.present || item.late || item.absent) ? <AttendanceTrendChart data={trend} /> : <EmptyState title="No attendance trend data" description="Completed attendance activity will appear after records are captured." />}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <PLPassDataGrid label="Active sessions preview" data={activeSessions} columns={activeColumns} emptyTitle="No active sessions" emptyDescription="Active class or event sessions will appear here." />
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="text-lg font-semibold">Attendance Risk Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review-only decision support from available model results.</p>
          {riskSlices.some((slice) => slice.value) ? <PresentLateAbsentPieChart data={riskSlices} /> : <EmptyState title="No risk analysis available yet" />}
        </div>
      </section>

      <section className="rounded-lg border bg-surface p-4">
        <h2 className="text-lg font-semibold">Attention Needed</h2>
        <div className="mt-3 space-y-2">
          {pendingEvents ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm">
              <span>Pending event approvals</span>
              <StatusBadge label={`${pendingEvents} items`} tone="warning" />
            </div>
          ) : <EmptyState title="No review queue items" description="Pending approvals and flagged records will appear here when repository data is available." />}
        </div>
      </section>
    </AdminFrame>
  );
}
