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

export function FacultyDashboardPage() {
  const scope = useFacultyScope();
  const [semesterId, setSemesterId] = useState("");
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const classesQuery = useClasses({ pageSize: 100, semesterId: semesterId || undefined }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const mlQuery = useMlPredictions({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }

  const classes = classesQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const predictions = mlQuery.data?.items ?? [];
  const activeSession = sessions.find((session) => session.status === "active");
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const flagged = predictions.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical");
  const totalAssignedStudents = new Set(classes.flatMap((classRecord) => records.filter((record) => sessions.find((session) => session.id === record.sessionId)?.classId === classRecord.id).map((record) => record.studentId))).size;

  const trendData = classes.map((classRecord) => {
    const classSessions = sessions.filter((session) => session.classId === classRecord.id);
    const classRecords = records.filter((record) => classSessions.some((session) => session.id === record.sessionId));
    const counts = attendanceCounts(classRecords);
    return { label: classRecord.subjectCode, present: counts.present, late: counts.late, absent: counts.absent };
  });
  const riskData = classes.map((classRecord) => ({
    label: classRecord.subjectCode,
    watchlist: predictions.filter((prediction) => prediction.classId === classRecord.id && prediction.riskLevel === "medium").length,
    atRisk: predictions.filter((prediction) => prediction.classId === classRecord.id && ["high", "critical"].includes(prediction.riskLevel)).length
  }));

  if (classesQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || catalog.semesters.isLoading) {
    return <LoadingState label="Loading faculty dashboard" />;
  }

  if (classesQuery.isError || sessionsQuery.isError || recordsQuery.isError) {
    return <ErrorState title="Unable to load dashboard" message="The mock repository could not load faculty dashboard data." />;
  }

  return (
    <FacultyFrame>
      <PageHeader
        eyebrow="Faculty"
        title="Faculty dashboard"
        description="Scoped overview of assigned classes, session activity, and review-only risk signals."
        actions={
          <>
            <Button asChild variant="outline">
              <NavLink to={APP_ROUTES.facultyClasses}>View My Classes</NavLink>
            </Button>
            <Button asChild>
              <NavLink to={APP_ROUTES.facultyStartSession}>Start Session</NavLink>
            </Button>
          </>
        }
      />
      <section className="rounded-lg border bg-surface p-4">
        <label className="block max-w-xs space-y-1.5">
          <span className="text-sm font-medium">Semester</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">All semesters</option>
            {catalog.semesters.data?.items.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.label} {semester.schoolYear}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Assigned students" value={String(totalAssignedStudents)} icon={Users} />
        <StatCard title="Flagged students" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
        <StatCard title="Average attendance" value={`${attendanceRate(records)}%`} icon={CalendarCheck} />
        <StatCard title="Completed sessions" value={String(completedSessions.length)} icon={ClipboardList} />
      </section>
      {activeSession ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Active class session</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeSession.title} is currently active.</p>
          <Button className="mt-4" asChild>
            <NavLink to={APP_ROUTES.facultySession(activeSession.id)}>Open active session</NavLink>
          </Button>
        </section>
      ) : (
        <EmptyState title="No active session" description="Start a mock class session when your class begins." />
      )}
      <section className="grid gap-4 xl:grid-cols-2">
        <AttendanceTrendChart data={trendData} />
        <RiskSummaryChart data={riskData} />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Today's class schedule</h2>
          <div className="mt-4 grid gap-3">
            {classes.length ? classes.map((classRecord) => <ClassScheduleCard key={classRecord.id} classRecord={classRecord} />) : <EmptyState title="No upcoming class" />}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Attention-needed students</h2>
          <div className="mt-4 space-y-3">
            {flagged.length ? flagged.map((prediction) => <PredictionCard key={prediction.id} prediction={prediction} />) : <EmptyState title="No flagged students" description="No high-risk mock predictions are in your assigned classes." />}
          </div>
        </div>
      </section>
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Recent completed sessions</h2>
        <div className="mt-4 grid gap-3">
          {completedSessions.length ? completedSessions.slice(0, 4).map((session) => <SessionCard key={session.id} session={session} />) : <EmptyState title="No completed sessions" />}
        </div>
      </section>
    </FacultyFrame>
  );
}
