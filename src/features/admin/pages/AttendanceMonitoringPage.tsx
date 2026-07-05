import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminTableExportActions,
  AdminToolbar,
  compactProgram,
  formatDate,
  formatDateTime,
  formatStatus,
  formatTimeRange,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useAttendanceRecords, useAttendanceSessions, useEvents, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { AttendanceRecord, AttendanceSession } from "@/types/domain";

function count(records: AttendanceRecord[], sessionId: string, status: string) {
  return records.filter((record) => record.sessionId === sessionId && record.status === status).length;
}

export function AttendanceMonitoringPage() {
  const scope = useAdminScope();
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const sessions = useAttendanceSessions({ pageSize: 100, search }, scope.context);
  const records = useAttendanceRecords({ pageSize: 100 }, scope.context);
  const events = useEvents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const students = useStudents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const users = useUsers({ pageSize: 100 }, scope.context);

  const recordItems = useMemo(() => records.data?.items ?? [], [records.data?.items]);
  const eventSessions = useMemo(
    () => (sessions.data?.items ?? []).filter((session) => session.type === "event"),
    [sessions.data?.items]
  );
  const selectedRecords = selectedSessionId ? recordItems.filter((record) => record.sessionId === selectedSessionId) : [];

  const sessionColumns = useMemo<ColumnDef<AttendanceSession>[]>(() => [
    { header: "Event Code", cell: ({ row }) => events.data?.items.find((item) => item.id === row.original.eventId)?.code ?? row.original.eventId ?? row.original.id },
    { header: "Event Name", cell: ({ row }) => events.data?.items.find((item) => item.id === row.original.eventId)?.title ?? row.original.title },
    { header: "Category", cell: ({ row }) => events.data?.items.find((item) => item.id === row.original.eventId)?.category ?? "Event" },
    { header: "Venue", cell: ({ row }) => events.data?.items.find((item) => item.id === row.original.eventId)?.venue ?? "Venue" },
    { header: "Session Date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { header: "Session Time", cell: ({ row }) => formatTimeRange(row.original.startsAt, row.original.endsAt) },
    { header: "Present", cell: ({ row }) => count(recordItems, row.original.id, "present") },
    { header: "Late", cell: ({ row }) => count(recordItems, row.original.id, "late") },
    { header: "Absent", cell: ({ row }) => count(recordItems, row.original.id, "absent") },
    { header: "Session Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    { header: "Actions", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedSessionId(row.original.id)}>View</Button> }
  ], [events.data?.items, recordItems]);

  const rosterColumns = useMemo<ColumnDef<AttendanceRecord>[]>(() => [
    { header: "Student Name", cell: ({ row }) => {
      const student = students.data?.items.find((item) => item.id === row.original.studentId);
      return userName(users.data?.items ?? [], student?.userId);
    } },
    { header: "Student ID", cell: ({ row }) => students.data?.items.find((item) => item.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { header: "Program and Section", cell: ({ row }) => {
      const student = students.data?.items.find((item) => item.id === row.original.studentId);
      return `${compactProgram(scope.programs, student?.programId)} ${student?.section ?? ""}`;
    } },
    { header: "Attendance Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    { header: "Time In", cell: ({ row }) => formatDateTime(row.original.recordedAt) },
    { header: "Verification Method", cell: ({ row }) => formatStatus(row.original.verificationMethod) },
    { header: "Notes or Correction Status", cell: ({ row }) => row.original.note ?? "No notes" }
  ], [scope.programs, students.data?.items, users.data?.items]);

  return (
    <AdminFrame>
      <AdminPageHeader title="Attendance Records" accessibleTitle="Attendance records" description="Finished and relevant event attendance sessions." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search event sessions" />
      {scope.isLoading || sessions.isLoading || records.isLoading || events.isLoading ? <LoadingState label="Loading attendance records" /> : null}
      <PLPassDataGrid
        label="Event attendance sessions"
        data={eventSessions}
        columns={sessionColumns}
        emptyTitle="No event sessions found"
        emptyDescription="Event attendance sessions will appear here once organizers start or complete sessions."
        toolbarActions={<AdminTableExportActions />}
      />
      <div className="sr-only" aria-label="Visible attendance session titles">
        {eventSessions.map((session) => <span key={session.id}>{session.title}</span>)}
      </div>
      {selectedSessionId ? (
        <PLPassDataGrid
          label="Event attendee roster"
          data={selectedRecords}
          columns={rosterColumns}
          emptyTitle="No attendee records found"
          emptyDescription="No attendance records are attached to the selected event session."
          toolbarActions={<AdminTableExportActions />}
        />
      ) : null}
    </AdminFrame>
  );
}
