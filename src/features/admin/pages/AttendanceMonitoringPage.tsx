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
  AdminTabs,
  AdminToolbar,
  DetailPanel,
  compactProgram,
  formatDate,
  formatDateTime,
  formatStatus,
  formatTimeRange,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useAttendanceRecords, useAttendanceSessions, useClasses, useEvents, useFacultyProfiles, useStudents, useUsers } from "@/hooks/useRepositoryQueries";
import type { AttendanceRecord, AttendanceSession } from "@/types/domain";

type SessionTab = "class" | "event";

function count(records: AttendanceRecord[], sessionId: string, status: string) {
  return records.filter((record) => record.sessionId === sessionId && record.status === status).length;
}

export function AttendanceMonitoringPage() {
  const scope = useAdminScope();
  const [tab, setTab] = useState<SessionTab>("class");
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const sessions = useAttendanceSessions({ pageSize: 100, search }, scope.context);
  const records = useAttendanceRecords({ pageSize: 100 }, scope.context);
  const classes = useClasses({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const events = useEvents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const students = useStudents({ pageSize: 100, departmentId: scope.department?.id }, scope.context);
  const users = useUsers({ pageSize: 100 }, scope.context);
  const faculty = useFacultyProfiles({ pageSize: 100 }, scope.context);

  const recordItems = useMemo(() => records.data?.items ?? [], [records.data?.items]);
  const visibleSessions = (sessions.data?.items ?? []).filter((session) => session.type === tab);
  const selectedRecords = selectedSessionId ? recordItems.filter((record) => record.sessionId === selectedSessionId) : [];

  const sessionColumns = useMemo<ColumnDef<AttendanceSession>[]>(() => [
    { header: tab === "class" ? "Subject Code" : "Event Code", cell: ({ row }) => {
      const classRecord = classes.data?.items.find((item) => item.id === row.original.classId);
      const eventRecord = events.data?.items.find((item) => item.id === row.original.eventId);
      return classRecord?.subjectCode ?? eventRecord?.code ?? row.original.id;
    } },
    { header: tab === "class" ? "Subject Name" : "Event Name", cell: ({ row }) => {
      const classRecord = classes.data?.items.find((item) => item.id === row.original.classId);
      const eventRecord = events.data?.items.find((item) => item.id === row.original.eventId);
      return classRecord?.subjectTitle ?? eventRecord?.title ?? row.original.title;
    } },
    { header: tab === "class" ? "Faculty" : "Category", cell: ({ row }) => {
      const classRecord = classes.data?.items.find((item) => item.id === row.original.classId);
      const profile = faculty.data?.items.find((item) => item.id === classRecord?.facultyId);
      const eventRecord = events.data?.items.find((item) => item.id === row.original.eventId);
      return tab === "class" ? userName(users.data?.items ?? [], profile?.userId) : eventRecord?.category ?? "Event";
    } },
    { header: tab === "class" ? "Year and Section" : "Venue", cell: ({ row }) => {
      const classRecord = classes.data?.items.find((item) => item.id === row.original.classId);
      const eventRecord = events.data?.items.find((item) => item.id === row.original.eventId);
      return tab === "class" ? `${classRecord?.yearLevel ?? "-"}-${classRecord?.section ?? "-"}` : eventRecord?.venue ?? "Venue";
    } },
    { header: tab === "class" ? "Room" : "Session Time", cell: ({ row }) => {
      const classRecord = classes.data?.items.find((item) => item.id === row.original.classId);
      return tab === "class" ? classRecord?.room ?? "Room" : formatTimeRange(row.original.startsAt, row.original.endsAt);
    } },
    { header: "Session Date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { header: "Present Count", cell: ({ row }) => count(recordItems, row.original.id, "present") },
    { header: "Late Count", cell: ({ row }) => count(recordItems, row.original.id, "late") },
    { header: "Absent Count", cell: ({ row }) => count(recordItems, row.original.id, "absent") },
    { header: "View Details", cell: ({ row }) => <Button type="button" size="sm" variant="outline" onClick={() => setSelectedSessionId(row.original.id)}>View</Button> }
  ], [classes.data?.items, events.data?.items, faculty.data?.items, recordItems, tab, users.data?.items]);

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
    { header: "Time Out", cell: () => "Not recorded" },
    { header: "Verification Method", cell: ({ row }) => formatStatus(row.original.verificationMethod) },
    { header: "Notes or Correction Status", cell: ({ row }) => row.original.note ?? "No notes" }
  ], [scope.programs, students.data?.items, users.data?.items]);

  return (
    <AdminFrame>
      <AdminPageHeader title="Attendance Records" accessibleTitle="Attendance monitoring" description="Completed class and event attendance sessions with attendee-level records." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminTabs
        label="Attendance records tabs"
        selected={tab}
        onSelect={(value) => {
          setTab(value);
          setSelectedSessionId(null);
        }}
        tabs={[
          { label: "Class Sessions", value: "class" },
          { label: "Event Sessions", value: "event" }
        ]}
      />
      <AdminToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search sessions">
        <StatusBadge label="Date range: current data" tone="muted" />
        <StatusBadge label="Attendance status: all" tone="muted" />
      </AdminToolbar>
      {scope.isLoading || sessions.isLoading || records.isLoading ? <LoadingState label="Loading attendance records" /> : null}
      <PLPassDataGrid label="Attendance sessions" data={visibleSessions} columns={sessionColumns} emptyTitle="No sessions found" emptyDescription="No class or event sessions match the selected records filters." />
      <div className="sr-only" aria-label="Visible attendance session titles">
        {visibleSessions.map((session) => <span key={session.id}>{session.title}</span>)}
      </div>
      {selectedSessionId ? (
        <PLPassDataGrid label="Attendance attendee roster" data={selectedRecords} columns={rosterColumns} emptyTitle="No attendee records found" emptyDescription="No attendance records are attached to the selected session." />
      ) : (
        <DetailPanel title="Session details">Select a completed session to review attendee roster, statistics, verification method, and correction context. Report generation appears only when the repository supports it.</DetailPanel>
      )}
    </AdminFrame>
  );
}
