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

export function ActiveSessionPage() {
  const { sessionId } = useParams();
  const scope = useFacultyScope();
  const navigate = useNavigate();
  const [nfcValue, setNfcValue] = useState("");
  const [readerState, setReaderState] = useState<"ready" | "processing" | "success" | "error" | "disconnected">("ready");
  const [qrEnabled, setQrEnabled] = useState(false);
  const [latestResult, setLatestResult] = useState<AttendanceSimulationResult | null>(null);
  const [manualStudentId, setManualStudentId] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualRemarks, setManualRemarks] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [endOpen, setEndOpen] = useState(false);
  const [endReason, setEndReason] = useState("");
  const sessionQuery = useAttendanceSession(sessionId, scope.context);
  const classQuery = useClass(sessionQuery.data?.classId, scope.context);
  const rosterQuery = useStudentsForClass(sessionQuery.data?.classId ?? "", { pageSize: 500 }, scope.context);
  const recordsQuery = useAttendanceRecords({ classId: sessionQuery.data?.classId, pageSize: 500 }, scope.context);
  const tapsQuery = useNfcTapAttempts({ pageSize: 500 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const attendanceMutations = useAttendanceSimulationMutations(scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }
  if (sessionQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || rosterQuery.isLoading || tapsQuery.isLoading) {
    return <LoadingState label="Loading active session" />;
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    return <ErrorState title="Session unavailable" message="This session was not found or is outside your assigned classes." />;
  }
  const session = sessionQuery.data;
  const classRecord = classQuery.data;
  const records = (recordsQuery.data?.items ?? []).filter((record) => record.sessionId === session.id);
  const students = studentsQuery.data?.items ?? [];
  const rosterStudents = rosterQuery.data?.items ?? [];
  const attempts = (tapsQuery.data?.items ?? []).filter((attempt) => attempt.sessionId === session.id);
  const filteredRecords = records.filter((record) => {
    const student = students.find((entry) => entry.id === record.studentId);
    return (
      (statusFilter === "all" || record.status === statusFilter) &&
      (methodFilter === "all" || record.verificationMethod === methodFilter) &&
      (!search || student?.studentNumber.toLowerCase().includes(search.toLowerCase()) || record.status.includes(search.toLowerCase()))
    );
  });
  const counts = attendanceCounts(records);
  const duplicateAttempts = attempts.filter((attempt) => attempt.message === "Already recorded").length;
  const failedAttempts = attempts.filter((attempt) => !attempt.accepted).length;
  const liveRecords: LiveAttendanceRecord[] = filteredRecords.map((record) => {
    const student = students.find((entry) => entry.id === record.studentId);
    return {
      id: record.id,
      studentName: studentName(student),
      identifier: student?.studentNumber ?? record.studentId,
      status: record.status === "excused" ? "manual" : record.status,
      timestamp: formatTime(record.recordedAt)
    };
  });
  const latestTapResult = latestResult
    ? {
        studentName: latestResult.studentDisplayName,
        studentNumber: latestResult.studentNumber,
        status: latestResult.attendanceStatus === "absent" ? "absent" as const : latestResult.attendanceStatus === "late" ? "late" as const : latestResult.attendanceStatus === "present" ? "present" as const : "manual" as const,
        message: latestResult.safeMessage,
        timestamp: formatTime(latestResult.recordedAt),
        resultLabel: latestResult.resultStatus,
        method: latestResult.verificationMethod
      }
    : records[0]
      ? {
          studentName: studentName(students.find((student) => student.id === records[0].studentId)),
          studentNumber: students.find((student) => student.id === records[0].studentId)?.studentNumber,
          status: records[0].status === "excused" ? "manual" as const : records[0].status,
          message: "Most recent mock attendance record.",
          timestamp: formatTime(records[0].recordedAt),
          resultLabel: records[0].status,
          method: records[0].verificationMethod
        }
      : undefined;
  function simulatedTime(outcome?: string) {
    if (outcome === "late") {
      return session.lateCutoffAt ? new Date(new Date(session.lateCutoffAt).getTime() + 60_000).toISOString() : undefined;
    }
    if (outcome === "outside-window") {
      return session.attendanceWindowEndAt ? new Date(new Date(session.attendanceWindowEndAt).getTime() + 60_000).toISOString() : undefined;
    }
    return session.startsAt ? new Date(new Date(session.startsAt).getTime() + 120_000).toISOString() : undefined;
  }
  async function submitCredentialScan(code: string, method: "nfc" | "qr", outcome?: string) {
    setReaderState("processing");
    setNfcValue("");
    try {
      const result = await attendanceMutations.credentialScanMutation.mutateAsync({
        sessionId: session.id,
        credentialCode: code,
        method,
        occurredAt: simulatedTime(outcome)
      });
      setLatestResult(result);
      setReaderState(result.attendanceRecord ? "success" : "error");
      toast(result.resultStatus, { description: result.safeMessage });
    } catch {
      setReaderState("error");
      toast.error("Attendance simulation failed", { description: "The mock repository rejected the scan." });
    }
  }
  async function submitManualAttendance() {
    try {
      const result = await attendanceMutations.manualAttendanceMutation.mutateAsync({
        sessionId: session.id,
        studentId: manualStudentId,
        reason: manualReason,
        remarks: manualRemarks,
        occurredAt: simulatedTime()
      });
      setLatestResult(result);
      setManualStudentId("");
      setManualReason("");
      setManualRemarks("");
      toast(result.resultStatus, { description: result.safeMessage });
    } catch {
      toast.error("Manual attendance was not saved", { description: "Select a student, reason, and remarks." });
    }
  }
  async function confirmEnd() {
    await mutations.endSessionMutation.mutateAsync({ sessionId: session.id, reason: endReason });
    navigate(APP_ROUTES.facultyAttendance);
  }
  return (
    <FacultyFrame>
      <PageHeader
        eyebrow="Active Session"
        title={session.title}
        description="Development Simulation for keyboard-style NFC attendance, QR fallback, and manual override."
        actions={<Button type="button" variant="destructive" onClick={() => setEndOpen(true)}>End Session</Button>}
      />
      <ActiveSessionHeader title={classRecord ? `${classRecord.subjectTitle} (${classRecord.subjectCode})` : session.title} venue={`${classRecord?.section ?? "Class"} · ${classRecord?.room ?? "Room"}`} startedAt={`${formatDate(session.startsAt)} ${formatTime(session.startsAt)}`} statusLabel={session.status} />
      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <NFCReaderInput value={nfcValue} readerState={readerState} showTestMenu onChange={setNfcValue} onSubmit={(code) => submitCredentialScan(code, "nfc")} onTestScan={(code, outcome) => submitCredentialScan(code, "nfc", outcome)} />
          <div className="rounded-lg border bg-highlight-soft p-4 text-sm text-foreground">
            <p className="font-semibold">Development Simulation</p>
            <p className="mt-1">Late cutoff: {formatTime(session.lateCutoffAt ?? session.startsAt)}. Window ends: {formatTime(session.attendanceWindowEndAt ?? session.endsAt ?? session.startsAt)}.</p>
          </div>
          <QRFallbackPanel enabled={qrEnabled} disabled={attendanceMutations.credentialScanMutation.isPending} onToggle={() => setQrEnabled((value) => !value)} onSimulate={(code) => submitCredentialScan(code, "qr")} />
          <ManualLookupPanel
            studentId={manualStudentId}
            reason={manualReason}
            remarks={manualRemarks}
            students={rosterStudents.map((student) => ({ id: student.id, label: `${studentName(student)} (${student.studentNumber})` }))}
            disabled={attendanceMutations.manualAttendanceMutation.isPending}
            onStudentChange={setManualStudentId}
            onReasonChange={setManualReason}
            onRemarksChange={setManualRemarks}
            onSubmit={submitManualAttendance}
          />
        </div>
        <div className="space-y-4">
          <LatestTapResultCard result={latestTapResult} />
          <div className="rounded-lg border bg-surface p-4">
            <h2 className="font-semibold">Recent activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest accepted, duplicate, and failed Development Simulation attempts refresh through mock repositories.</p>
          </div>
          <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={rosterStudents.length} />
          <div className="grid gap-3 md:grid-cols-2">
            <StatCard title="Failed taps" value={String(failedAttempts)} tone="warning" />
            <StatCard title="Duplicate taps" value={String(duplicateAttempts)} />
          </div>
        </div>
        <div className="space-y-4">
          <SearchInput value={search} placeholder="Search live list" onChange={setSearch} />
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
              <option value="all">All methods</option>
              <option value="nfc">NFC</option>
              <option value="qr">QR</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <LiveAttendanceList records={liveRecords} />
        </div>
      </section>
      <ConfirmModal open={endOpen} title="End mock session" description="A reason is required for early or overtime ending." confirmLabel="End session" tone="danger" onCancel={() => setEndOpen(false)} onConfirm={confirmEnd}>
        <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={endReason} onChange={(event) => setEndReason(event.target.value)}>
          <option value="">Select reason</option>
          {["Class ended early", "Class extended overtime", "Room issue", "Schedule adjustment", "Emergency", "Other"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </select>
        {mutations.endSessionMutation.isError ? <p className="mt-2 text-sm text-danger">A reason is required.</p> : null}
      </ConfirmModal>
    </FacultyFrame>
  );
}
