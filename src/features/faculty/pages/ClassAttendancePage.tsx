/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
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
  useStudentsForClass,
  useUsers
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { AttendanceSimulationResult } from "@/services/contracts";
import type { AttendanceRecord, AttendanceSession, Class, CorrectionRequest, MlPrediction, Student, User } from "@/types/domain";
import type { AttendanceStatus, CorrectionRequestStatus, RiskLevel, SessionStatus, StudentStatus, UserRole } from "@/types/enums";

type RepositoryContext = {
  actorUserId: string;
  actorRole: UserRole;
};

type FacultyScope = {
  context: RepositoryContext;
  facultyId?: string;
  facultyName: string;
  isLoading: boolean;
  isError: boolean;
};

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });
const gridThemeVars = {
  "--ag-background-color": "hsl(var(--background))",
  "--ag-foreground-color": "hsl(var(--foreground))",
  "--ag-header-background-color": "hsl(var(--muted))",
  "--ag-header-foreground-color": "hsl(var(--muted-foreground))",
  "--ag-border-color": "hsl(var(--border))",
  "--ag-row-border-color": "hsl(var(--border))",
  "--ag-row-hover-color": "hsl(var(--muted) / 0.5)",
  "--ag-selected-row-background-color": "hsl(var(--muted))",
  "--ag-accent-color": "hsl(var(--primary))",
  "--ag-font-family": "inherit",
  "--ag-font-size": "13.5px",
  "--ag-header-font-weight": "600",
  "--ag-border-radius": "0.5rem",
  "--ag-wrapper-border-radius": "0.5rem"
} as React.CSSProperties;

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

/** Resolves a student's real display name via their linked User record.
 *  Falls back to the student number only if no matching user is found. */
function studentName(student: Student | undefined, users: User[]) {
  if (!student) {
    return "Unknown student";
  }
  const user = users.find((entry) => entry.id === student.userId);
  return user?.displayName ?? student.studentNumber;
}

function ShellState({ scope }: { scope: FacultyScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading faculty workspace" />;
  }
  if (scope.isError || !scope.facultyId) {
    return <ErrorState title="Faculty profile unavailable" message="Unable to resolve faculty profile from the signed-in user." />;
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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFormat, setReportFormat] = useState<"PDF" | "XLSX">("PDF");
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, search }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const usersQuery = useUsers({ pageSize: 500 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (sessionsQuery.isLoading || recordsQuery.isLoading || classesQuery.isLoading || studentsQuery.isLoading || usersQuery.isLoading) {
    return <LoadingState label="Loading attendance records" />;
  }
  if (sessionsQuery.isError) {
    return <ErrorState title="Unable to load attendance records" message="There was an error loading attendance sessions. Please verify your Supabase connection and permissions." />;
  }
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const classes = classesQuery.data?.items ?? [];
  const students = studentsQuery.data?.items ?? [];
  const users = usersQuery.data?.items ?? [];
  const selectedRecords = selectedSessionId ? records.filter((record) => record.sessionId === selectedSessionId) : [];
  const columns: ColDef<AttendanceSession>[] = [
    { headerName: "Subject code", valueGetter: (params) => classes.find((entry) => entry.id === params.data?.classId)?.subjectCode ?? "Class" },
    { field: "title", headerName: "Subject name" },
    { headerName: "Section", valueGetter: (params) => classes.find((entry) => entry.id === params.data?.classId)?.section ?? "N/A" },
    { headerName: "Room", valueGetter: (params) => classes.find((entry) => entry.id === params.data?.classId)?.room ?? "N/A" },
    { headerName: "Session date", valueGetter: (params) => formatDate(params.data?.startsAt) },
    { headerName: "Session time", valueGetter: (params) => `${formatTime(params.data?.startsAt)} - ${formatTime(params.data?.endsAt)}` },
    { headerName: "Present", valueGetter: (params) => attendanceCounts(recordsForSession(records, params.data?.id ?? "")).present },
    { headerName: "Late", valueGetter: (params) => attendanceCounts(recordsForSession(records, params.data?.id ?? "")).late },
    { headerName: "Absent", valueGetter: (params) => attendanceCounts(recordsForSession(records, params.data?.id ?? "")).absent },
    { field: "status", headerName: "Session status", cellRenderer: (params: ICellRendererParams<AttendanceSession>) => <StatusBadge label={params.value as string} tone={statusTone(params.value as AttendanceSession["status"])} /> },
    { headerName: "View", cellRenderer: (params: ICellRendererParams<AttendanceSession>) => <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSessionId(params.data?.id ?? null)}>Details</Button> }
  ];
  const detailColumns: ColDef<AttendanceRecord>[] = [
    { headerName: "Student name", valueGetter: (params) => studentName(students.find((student) => student.id === params.data?.studentId), users) },
    { headerName: "Student number", valueGetter: (params) => students.find((student) => student.id === params.data?.studentId)?.studentNumber ?? params.data?.studentId },
    { field: "status", headerName: "Attendance status", cellRenderer: (params: ICellRendererParams<AttendanceRecord>) => <StatusBadge label={params.value as string} tone={statusTone(params.value as AttendanceRecord["status"])} /> },
    { field: "verificationMethod", headerName: "Verification method" },
    { headerName: "Time recorded", valueGetter: (params) => formatTime(params.data?.recordedAt) },
    { field: "note", headerName: "Remarks" },
    { headerName: "Correction request", valueGetter: () => "No active request" }
  ];
  return (
    <FacultyFrame>
      <PageHeader
        eyebrow="Faculty"
        title="Attendance Records"
        description="Completed and relevant sessions for your assigned classes."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setReportFormat("PDF");
                setReportOpen(true);
              }}
            >
              Generate PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setReportFormat("XLSX");
                setReportOpen(true);
              }}
            >
              Generate XLSX
            </Button>
          </>
        }
      />
      <FilterBar search={search} selectedFilter="all" filters={[{ label: "All statuses", value: "all" }]} onSearchChange={setSearch} onFilterChange={() => undefined} />
      <div className="ag-theme-quartz overflow-hidden rounded-lg border shadow-sm" style={{ height: 360, width: "100%", ...gridThemeVars }}>
        <AgGridReact<AttendanceSession>
          theme="legacy"
          rowData={sessions}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, filter: true }}
          rowHeight={52}
          headerHeight={44}
          pagination
          paginationPageSize={8}
          paginationPageSizeSelector={[8, 16, 24]}
        />
      </div>
      {selectedSessionId ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Attendance detail panel</h2>
          <div className="mt-4">
            <div className="ag-theme-quartz overflow-hidden rounded-lg border shadow-sm" style={{ height: 280, width: "100%", ...gridThemeVars }}>
              <AgGridReact<AttendanceRecord>
                theme="legacy"
                rowData={selectedRecords}
                columnDefs={detailColumns}
                defaultColDef={{ sortable: true, resizable: true, filter: true }}
                rowHeight={52}
                headerHeight={44}
                pagination
                paginationPageSize={6}
                paginationPageSizeSelector={[6, 12, 24]}
              />
            </div>
          </div>
        </section>
      ) : null}
      <GenerateReportModal
        open={reportOpen}
        reportName={`Attendance records (${reportFormat})`}
        onClose={() => setReportOpen(false)}
        onGenerate={() => {
          toast.success(`Queued ${reportFormat} report for attendance records`);
          setReportOpen(false);
        }}
      />
    </FacultyFrame>
  );
}