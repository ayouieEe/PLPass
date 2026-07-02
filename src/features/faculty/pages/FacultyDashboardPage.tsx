/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  Radio,
  Search,
  UserCheck,
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

function isSameCalendarDay(value: string | undefined, date: Date) {
  if (!value) {
    return false;
  }
  const next = new Date(value);
  return next.getFullYear() === date.getFullYear() && next.getMonth() === date.getMonth() && next.getDate() === date.getDate();
}

function sortByStartTime(a: AttendanceSession, b: AttendanceSession) {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

function sortByLatestStart(a: AttendanceSession, b: AttendanceSession) {
  return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
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
          <NavLink to={APP_ROUTES.facultyClass(classRecord.id ?? "")}>View</NavLink>
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
          <NavLink to={APP_ROUTES.facultySession(session.id ?? "")}>View session</NavLink>
        </Button>
      </div>
    </article>
  );

}

function DashboardScheduleCard({ classRecord, session }: { classRecord: Class; session?: AttendanceSession }) {
  return (
    <article className="rounded-lg border bg-background p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{classRecord.subjectCode}</p>
            {session ? <StatusBadge label={session.status} tone={statusTone(session.status)} /> : null}
          </div>
          <p className="mt-1 truncate text-sm text-foreground">{classRecord.subjectTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {session ? `${formatTime(session.startsAt)} - ${classRecord.room}` : `${classRecord.scheduleLabel} - ${classRecord.room}`}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={session ? APP_ROUTES.facultySession(session.id ?? "") : APP_ROUTES.facultyClass(classRecord.id ?? "")}>
            {session ? "Open" : "View"}
          </NavLink>
        </Button>
      </div>
    </article>
  );
}

function DashboardPredictionCard({ prediction, classRecord, student }: { prediction: MlPrediction; classRecord?: Class; student?: Student }) {
  return (
    <article className="rounded-lg border bg-background p-4 shadow-sm transition hover:border-destructive/40 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{studentName(student)}</p>
            <StatusBadge label={prediction.riskLevel} tone={statusTone(prediction.riskLevel)} />
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{prediction.patternLabel}</p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{prediction.explanation}</p>
          {classRecord ? <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{classLabel(classRecord)}</p> : null}
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={classRecord ? APP_ROUTES.facultyClass(classRecord.id ?? "") : APP_ROUTES.facultyClasses}>View details</NavLink>
        </Button>
      </div>
    </article>
  );
}

function DashboardSessionCard({ session, classRecord, records }: { session: AttendanceSession; classRecord?: Class; records: AttendanceRecord[] }) {
  const counts = attendanceCounts(records);
  return (
    <article className="rounded-lg border bg-background p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{session.title}</p>
            <StatusBadge label={session.status} tone={statusTone(session.status)} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {classRecord ? `${classLabel(classRecord)} - ` : ""}{formatDate(session.startsAt)} - {formatTime(session.startsAt)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {counts.present} present - {counts.late} late - {counts.absent} absent
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.facultySession(session.id ?? "")}>View session</NavLink>
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
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.facultyId) {
    return shellState;
  }

  const classes = classesQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const predictions = mlQuery.data?.items ?? [];
  const students = studentsQuery.data?.items ?? [];
  const today = new Date();
  const now = today.getTime();
  const classIds = new Set(classes.map((classRecord) => classRecord.id));
  const classById = new Map(classes.map((classRecord) => [classRecord.id, classRecord]));
  const studentById = new Map(students.map((student) => [student.id, student]));
  const scopedSessions = sessions.filter((session) => classIds.has(session.classId ?? ""));
  const sessionIds = new Set(scopedSessions.map((session) => session.id));
  const scopedRecords = records.filter((record) => sessionIds.has(record.sessionId));
  const scopedPredictions = predictions.filter((prediction) => classIds.has(prediction.classId ?? ""));
  const todaySessions = scopedSessions.filter((session) => isSameCalendarDay(session.startsAt, today)).sort(sortByStartTime);
  const activeSession = todaySessions.find((session) => session.status === "active") ?? scopedSessions.find((session) => session.status === "active");
  const incomingSession = todaySessions.find((session) => session.status !== "cancelled" && session.status !== "completed" && new Date(session.startsAt).getTime() >= now);
  const focusSession = activeSession ?? incomingSession;
  const focusClass = focusSession ? classById.get(focusSession.classId ?? "") : undefined;
  const recentSessions = scopedSessions.slice().sort(sortByLatestStart).slice(0, 5);
  const flagged = scopedPredictions.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical");
  const totalAssignedStudents = new Set(scopedRecords.map((record) => record.studentId)).size;
  const selectedSemester = catalog.semesters.data?.items.find((semester) => semester.id === semesterId);
  const semesterLabel = selectedSemester ? `${selectedSemester.label} ${selectedSemester.schoolYear}` : "All semesters";

  const trendData = classes.map((classRecord) => {
    const classSessions = scopedSessions.filter((session) => session.classId === classRecord.id);
    const classRecords = scopedRecords.filter((record) => classSessions.some((session) => session.id === record.sessionId));
    const counts = attendanceCounts(classRecords);
    return { label: classRecord.subjectCode, present: counts.present, late: counts.late, absent: counts.absent };
  });
  const riskData = classes.map((classRecord) => ({
    label: classRecord.subjectCode,
    watchlist: scopedPredictions.filter((prediction) => prediction.classId === classRecord.id && prediction.riskLevel === "medium").length,
    atRisk: scopedPredictions.filter((prediction) => prediction.classId === classRecord.id && ["high", "critical"].includes(prediction.riskLevel)).length
  }));

  if (classesQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || catalog.semesters.isLoading) {
    return <LoadingState label="Loading faculty dashboard" />;
  }

  if (classesQuery.isError || sessionsQuery.isError || recordsQuery.isError || studentsQuery.isError) {
    return <ErrorState title="Unable to load dashboard" message="The mock repository could not load faculty dashboard data." />;
  }

  return (
    <FacultyFrame>
      <PageHeader
        eyebrow="Faculty"
        title="Faculty dashboard"
        description="Semester overview of today's sessions, attendance health, and students who need follow-up."
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

      <section className="overflow-hidden rounded-lg border bg-surface">
        <div className="grid gap-0 lg:grid-cols-[1.45fr_0.9fr]">
          <div className="border-b p-6 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={focusSession?.status ?? "no session"} tone={focusSession ? statusTone(focusSession.status) : "muted"} />
              <span className="text-sm font-medium text-muted-foreground">{semesterLabel}</span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              {activeSession ? "Active session is live" : incomingSession ? "Incoming session for today" : "No session scheduled for today"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {focusSession
                ? `${focusSession.title}${focusClass ? ` - ${classLabel(focusClass)}` : ""} - ${formatTime(focusSession.startsAt)}`
                : "Use the semester filter to review assigned classes, attendance performance, and students who need support."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {focusSession ? (
                <Button asChild>
                  <NavLink to={APP_ROUTES.facultySession(focusSession.id ?? "")}>
                    {activeSession ? "Open active session" : "Open incoming session"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </NavLink>
                </Button>
              ) : (
                <Button asChild>
                  <NavLink to={APP_ROUTES.facultyStartSession}>Start Session</NavLink>
                </Button>
              )}
              <Button asChild variant="outline">
                <NavLink to={APP_ROUTES.facultyClasses}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  View Calendar
                </NavLink>
              </Button>
            </div>
          </div>

          <div className="grid content-between gap-4 p-6">
            <label className="block space-y-1.5">
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
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-muted-foreground">Today</p>
                <p className="mt-1 font-semibold">{todaySessions.length} session{todaySessions.length === 1 ? "" : "s"}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-muted-foreground">Recent</p>
                <p className="mt-1 font-semibold">{recentSessions.length} session{recentSessions.length === 1 ? "" : "s"}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total students under prof" value={String(totalAssignedStudents)} icon={Users} />
        <StatCard title="Flagged students" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
        <StatCard title="Avg. attendance per sem" value={`${attendanceRate(scopedRecords)}%`} icon={CalendarCheck} />
        <StatCard title="Recent sessions" value={String(recentSessions.length)} icon={ClipboardList} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AttendanceTrendChart data={trendData} />
        <RiskSummaryChart data={riskData} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Today's Schedule List</h2>
              <p className="mt-1 text-sm text-muted-foreground">Active and incoming sessions for today.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <NavLink to={APP_ROUTES.facultyClasses}>
                <CalendarDays className="mr-2 h-4 w-4" />
                View Calendar
              </NavLink>
            </Button>
          </div>
          <div className="mt-4 grid gap-3">
            {todaySessions.length ? (
              todaySessions.map((session) => {
                const classRecord = classById.get(session.classId ?? "");
                return classRecord ? <DashboardScheduleCard key={session.id} classRecord={classRecord} session={session} /> : null;
              })
            ) : classes.length ? (
              classes.slice(0, 4).map((classRecord) => <DashboardScheduleCard key={classRecord.id} classRecord={classRecord} />)
            ) : (
              <EmptyState title="No upcoming class" />
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Attention Needed</h2>
              <p className="mt-1 text-sm text-muted-foreground">Students with high or critical risk signals.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <NavLink to={APP_ROUTES.facultyClasses}>
                <UserCheck className="mr-2 h-4 w-4" />
                View Details
              </NavLink>
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {flagged.length ? (
              flagged.slice(0, 5).map((prediction) => (
                <DashboardPredictionCard
                  key={prediction.id}
                  prediction={prediction}
                  classRecord={classById.get(prediction.classId ?? "")}
                  student={studentById.get(prediction.studentId ?? "")}
                />
              ))
            ) : (
              <EmptyState title="No flagged students" description="No high-risk mock predictions are in your assigned classes." />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Recent Sessions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest activity across selected semester classes.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <NavLink to={APP_ROUTES.facultyStartSession}>
              <Radio className="mr-2 h-4 w-4" />
              Start Session
            </NavLink>
          </Button>
        </div>
        <div className="mt-4 grid gap-3">
          {recentSessions.length ? (
            recentSessions.map((session) => (
              <DashboardSessionCard
                key={session.id}
                session={session}
                classRecord={classById.get(session.classId ?? "")}
                records={recordsForSession(scopedRecords, session.id)}
              />
            ))
          ) : (
            <EmptyState title="No recent sessions" />
          )}
        </div>
      </section>
    </FacultyFrame>
  );
}