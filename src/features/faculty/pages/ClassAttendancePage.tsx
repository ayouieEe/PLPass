/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Search,
  Users
} from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { ParticipationBarChart } from "@/components/charts/ParticipationBarChart";
import { RiskSummaryChart } from "@/components/charts/RiskSummaryChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { SelectField } from "@/components/forms/SelectField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { TextField } from "@/components/forms/TextField";
import { TimePickerField } from "@/components/forms/TimePickerField";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatCard } from "@/components/shared/StatCard";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { NFCReaderInput } from "@/features/attendance/NFCReaderInput";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { GenerateReportModal } from "@/features/reports/GenerateReportModal";
import { ReportFilterPanel } from "@/features/reports/ReportFilterPanel";
import { ReportHistoryTable } from "@/features/reports/ReportHistoryTable";
import { ReportPreviewCard } from "@/features/reports/ReportPreviewCard";
import type { ReportHistoryRecord } from "@/features/reports/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSimulationMutations,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useClass,
  useClasses,
  useCorrectionRequests,
  useFacultyProfiles,
  useMlPredictions,
  useNfcTapAttempts,
  useReports,
  useStudents,
  useStudentsForClass
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { AttendanceSimulationResult } from "@/services/contracts";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { AttendanceRecord, AttendanceSession, Class, CorrectionRequest, MlPrediction, Student } from "@/types/domain";
import type { AttendanceStatus, CorrectionRequestStatus, RiskLevel, SessionStatus, StudentStatus } from "@/types/enums";

type FacultyScope = {
  context: RepositoryContext;
  facultyId?: string;
  facultyName: string;
  isLoading: boolean;
  isError: boolean;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const sessionFormSchema = z
  .object({
    classId: z.string().min(1, "Select an assigned class."),
    room: z.string().min(2, "Room is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required."),
    attendanceMode: z.enum(["face-to-face", "online"])
  })
  .refine((value) => value.expectedEndTime > value.startTime, {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time."
  });

type SessionFormValues = z.infer<typeof sessionFormSchema>;

function useFacultyScope(): FacultyScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const facultyQuery = useFacultyProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "faculty" },
    facultyId: facultyQuery.data?.items[0]?.id,
    facultyName: session?.displayName ?? "Faculty",
    isLoading: facultyQuery.isLoading,
    isError: facultyQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
}

function statusTone(status: AttendanceStatus | SessionStatus | CorrectionRequestStatus | StudentStatus | RiskLevel) {
  if (status === "present" || status === "completed" || status === "approved" || status === "enrolled" || status === "low") {
    return "success" as const;
  }
  if (status === "late" || status === "draft" || status === "pending" || status === "medium") {
    return "warning" as const;
  }
  if (status === "absent" || status === "cancelled" || status === "rejected" || status === "high" || status === "critical") {
    return "danger" as const;
  }
  return "muted" as const;
}

function classLabel(classRecord: Class | undefined) {
  return classRecord ? `${classRecord.subjectCode} ${classRecord.section}` : "Unknown class";
}

function recordsForSession(records: AttendanceRecord[], sessionId: string) {
  return records.filter((record) => record.sessionId === sessionId);
}

function attendanceCounts(records: AttendanceRecord[]) {
  return {
    present: records.filter((record) => record.status === "present").length,
    late: records.filter((record) => record.status === "late").length,
    absent: records.filter((record) => record.status === "absent").length,
    excused: records.filter((record) => record.status === "excused").length
  };
}

function attendanceRate(records: AttendanceRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  const attended = records.filter((record) => record.status === "present" || record.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

function studentName(student: Student | undefined) {
  return student ? student.studentNumber : "Unknown student";
}

function ShellState({ scope }: { scope: FacultyScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading faculty workspace" />;
  }
  if (scope.isError || !scope.facultyId) {
    return <ErrorState title="Faculty profile unavailable" message="The signed-in mock account does not have a faculty profile fixture." />;
  }
  return null;
}

function FacultyFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function ClassScheduleCard({ classRecord }: { classRecord: Class }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{classRecord.subjectCode} - {classRecord.subjectTitle}</p>
          <p className="text-sm text-muted-foreground">{classRecord.scheduleLabel} · {classRecord.room}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.facultyClass(classRecord.id)}>View</NavLink>
        </Button>
      </div>
    </article>
  );
}

function PredictionCard({ prediction }: { prediction: MlPrediction }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{prediction.patternLabel}</p>
          <p className="text-sm text-muted-foreground">{prediction.explanation}</p>
        </div>
        <StatusBadge label={prediction.riskLevel} tone={statusTone(prediction.riskLevel)} />
      </div>
    </article>
  );
}

function SessionCard({ session }: { session: AttendanceSession }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{session.title}</p>
          <p className="text-sm text-muted-foreground">{formatDate(session.startsAt)} · {formatTime(session.startsAt)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.facultySession(session.id)}>View session</NavLink>
        </Button>
      </div>
    </article>
  );

}

export function ClassAttendancePage() {
  const scope = useFacultyScope();
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, search }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (sessionsQuery.isLoading || recordsQuery.isLoading || classesQuery.isLoading) {
    return <LoadingState label="Loading attendance records" />;
  }
  if (sessionsQuery.isError) {
    return <ErrorState title="Unable to load attendance records" message="The mock attendance session repository returned an error." />;
  }
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const classes = classesQuery.data?.items ?? [];
  const selectedRecords = selectedSessionId ? records.filter((record) => record.sessionId === selectedSessionId) : [];
  const columns: ColumnDef<AttendanceSession>[] = [
    { id: "code", header: "Subject code", cell: ({ row }) => classes.find((entry) => entry.id === row.original.classId)?.subjectCode ?? "Class" },
    { accessorKey: "title", header: "Subject name" },
    { id: "section", header: "Section", cell: ({ row }) => classes.find((entry) => entry.id === row.original.classId)?.section ?? "N/A" },
    { id: "room", header: "Room", cell: ({ row }) => classes.find((entry) => entry.id === row.original.classId)?.room ?? "N/A" },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { id: "time", header: "Session time", cell: ({ row }) => `${formatTime(row.original.startsAt)} - ${formatTime(row.original.endsAt)}` },
    { id: "present", header: "Present", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).present },
    { id: "late", header: "Late", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).late },
    { id: "absent", header: "Absent", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).absent },
    { accessorKey: "status", header: "Session status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "action", header: "View", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSessionId(row.original.id)}>Details</Button> }
  ];
  const detailColumns: ColumnDef<AttendanceRecord>[] = [
    { id: "student", header: "Student name", cell: ({ row }) => studentName(studentsQuery.data?.items.find((student) => student.id === row.original.studentId)) },
    { id: "number", header: "Student number", cell: ({ row }) => studentsQuery.data?.items.find((student) => student.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { accessorKey: "status", header: "Attendance status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { accessorKey: "verificationMethod", header: "Verification method" },
    { id: "time", header: "Time recorded", cell: ({ row }) => formatTime(row.original.recordedAt) },
    { accessorKey: "note", header: "Remarks" },
    { id: "correction", header: "Correction request", cell: () => "No active request" }
  ];
  return (
    <FacultyFrame>
      <PageHeader eyebrow="Faculty" title="Attendance Records" description="Completed and relevant sessions for your assigned classes." actions={<><Button disabled variant="outline">Generate PDF</Button><Button disabled variant="outline">Generate XLSX</Button></>} />
      <FilterBar search={search} selectedFilter="all" filters={[{ label: "All statuses", value: "all" }]} onSearchChange={setSearch} onFilterChange={() => undefined} />
      <PLPassDataGrid label="Faculty attendance sessions" data={sessions} columns={columns} emptyTitle="No attendance sessions" />
      {selectedSessionId ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Attendance detail panel</h2>
          <div className="mt-4">
            <PLPassDataGrid label="Faculty session attendance records" data={selectedRecords} columns={detailColumns} emptyTitle="No student attendance records" />
          </div>
        </section>
      ) : null}
    </FacultyFrame>
  );
}
