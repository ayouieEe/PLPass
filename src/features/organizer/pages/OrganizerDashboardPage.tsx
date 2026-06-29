/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, CalendarCheck, ClipboardList, Plus, Search, Users } from "lucide-react";
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
import { TextAreaField } from "@/components/forms/TextAreaField";
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
  useCorrectionRequests,
  useEvent,
  useEventMutations,
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { AttendanceSimulationResult } from "@/services/contracts";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
  CorrectionRequest,
  Event,
  EventParticipant,
  MlPrediction,
  Student
} from "@/types/domain";
import type {
  AttendanceStatus,
  CorrectionRequestStatus,
  EventStatus,
  RiskLevel,
  SessionStatus,
  StudentStatus,
  VerificationMethod
} from "@/types/enums";

type OrganizerScope = {
  context: RepositoryContext;
  organizerId?: string;
  organizerName: string;
  isLoading: boolean;
  isError: boolean;
};

type EventWithCount = Event & { participantCount: number };

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const eventFormSchema = z
  .object({
    code: z.string().min(2, "Event code is required."),
    title: z.string().min(3, "Event name is required."),
    category: z.string().min(2, "Category is required."),
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    endTime: z.string().min(1, "End time is required."),
    attendanceMode: z.enum(["face-to-face", "online"]),
    description: z.string().optional(),
    remarks: z.string().optional()
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must be after start time."
  });

const sessionFormSchema = z
  .object({
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required."),
    attendanceMode: z.enum(["face-to-face", "online"])
  })
  .refine((value) => value.expectedEndTime > value.startTime, {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time."
  });

type EventFormValues = z.infer<typeof eventFormSchema>;
type SessionFormValues = z.infer<typeof sessionFormSchema>;

function useOrganizerScope(): OrganizerScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" },
    organizerId: organizerQuery.data?.items[0]?.id,
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: organizerQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
}

function statusTone(status: AttendanceStatus | SessionStatus | CorrectionRequestStatus | StudentStatus | RiskLevel | EventStatus) {
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

function eventLabel(event: Event | undefined) {
  return event ? `${event.code} - ${event.title}` : "Unknown event";
}

function studentName(student: Student | undefined) {
  return student ? student.studentNumber : "Unknown student";
}

function ShellState({ scope }: { scope: OrganizerScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading organizer workspace" />;
  }
  if (scope.isError || !scope.organizerId) {
    return <ErrorState title="Organizer profile unavailable" message="The signed-in mock account does not have an organizer profile fixture." />;
  }
  return null;
}

function OrganizerFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function recordsForSession(records: AttendanceRecord[], sessionId: string) {
  return records.filter((record) => record.sessionId === sessionId);
}

function participantStudents(participants: EventParticipant[], students: Student[]) {
  const participantIds = new Set(participants.map((participant) => participant.studentId));
  return students.filter((student) => participantIds.has(student.id));
}

function eventSemesterId(event: Event, semesters: { id: string; startsAt: string; endsAt: string }[]) {
  const eventDate = event.startsAt.slice(0, 10);
  return semesters.find((semester) => eventDate >= semester.startsAt && eventDate <= semester.endsAt)?.id;
}

function eventMatchesDateRange(event: Event, dateFrom: string, dateTo: string) {
  const date = event.startsAt.slice(0, 10);
  return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
}

function buildLiveRecords(records: AttendanceRecord[], students: Student[]): LiveAttendanceRecord[] {
  return records.map((record) => ({
    id: record.id,
    studentName: studentName(students.find((student) => student.id === record.studentId)),
    identifier: students.find((student) => student.id === record.studentId)?.studentNumber ?? record.studentId,
    status: record.status === "excused" ? "manual" : record.status,
    timestamp: formatTime(record.recordedAt)
  }));
}

function EventScheduleCard({ event }: { event: Event }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{eventLabel(event)}</p>
          <p className="text-sm text-muted-foreground">{formatDate(event.startsAt)} {formatTime(event.startsAt)} - {formatTime(event.endsAt)} - {event.venue}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.organizerEvent(event.id)}>View</NavLink>
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
          <p className="text-sm text-muted-foreground">{formatDate(session.startsAt)} {formatTime(session.startsAt)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.organizerSession(session.id)}>View session</NavLink>
        </Button>
      </div>
    </article>
  );

}

export function OrganizerDashboardPage() {
  const scope = useOrganizerScope();
  const [semesterId, setSemesterId] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const predictionsQuery = useMlPredictions({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || catalog.semesters.isLoading) {
    return <LoadingState label="Loading organizer dashboard" />;
  }
  if (eventsQuery.isError || sessionsQuery.isError || recordsQuery.isError) {
    return <ErrorState title="Unable to load organizer dashboard" message="The mock repositories could not load organizer dashboard data." />;
  }

  const semesters = catalog.semesters.data?.items ?? [];
  const events = (eventsQuery.data?.items ?? []).filter((event) => {
    const matchesSemester = !semesterId || eventSemesterId(event, semesters) === semesterId;
    const matchesSchoolYear = !schoolYear || semesters.find((semester) => semester.id === eventSemesterId(event, semesters))?.schoolYear === schoolYear;
    return matchesSemester && matchesSchoolYear;
  });
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const predictions = predictionsQuery.data?.items ?? [];
  const activeSession = sessions.find((session) => session.status === "active");
  const nextEvent = events.filter((event) => new Date(event.startsAt) >= new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const flagged = predictions.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical");
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const trendData = events.map((event) => {
    const eventSessions = sessions.filter((session) => session.eventId === event.id);
    const eventRecords = records.filter((record) => eventSessions.some((session) => session.id === record.sessionId));
    const counts = attendanceCounts(eventRecords);
    return { label: event.code, present: counts.present, late: counts.late, absent: counts.absent };
  });
  const riskData = events.map((event) => ({
    label: event.code,
    watchlist: predictions.filter((prediction) => prediction.eventId === event.id && prediction.riskLevel === "medium").length,
    atRisk: predictions.filter((prediction) => prediction.eventId === event.id && ["high", "critical"].includes(prediction.riskLevel)).length
  }));

  return (
    <OrganizerFrame>
      <PageHeader
        eyebrow="Organizer"
        title="Organizer dashboard"
        description="Scoped event overview, participation activity, and review-only insight signals."
        actions={
          <>
            <Button asChild variant="outline">
              <NavLink to={APP_ROUTES.organizerEvents}>View Events</NavLink>
            </Button>
            <Button asChild>
              <NavLink to={APP_ROUTES.organizerCreateEvent}>Create Event</NavLink>
            </Button>
          </>
        }
      />
      <section className="grid gap-3 rounded-lg border bg-surface p-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Semester</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">All semesters</option>
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>{semester.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">School year</span>
          <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)}>
            <option value="">All school years</option>
            {[...new Set(semesters.map((semester) => semester.schoolYear))].map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total events" value={String(events.length)} icon={ClipboardList} />
        <StatCard title="Average participation" value={`${attendanceRate(records)}%`} icon={Users} />
        <StatCard title="Completed sessions" value={String(completedSessions.length)} icon={CalendarCheck} />
        <StatCard title="Flagged participants" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
      </section>
      {activeSession ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Active event session</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeSession.title} is currently active.</p>
          <Button className="mt-4" asChild>
            <NavLink to={APP_ROUTES.organizerSession(activeSession.id)}>Open active session</NavLink>
          </Button>
        </section>
      ) : nextEvent ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Next upcoming event</h2>
          <p className="mt-1 text-sm text-muted-foreground">{eventLabel(nextEvent)} on {formatDate(nextEvent.startsAt)}.</p>
          <Button className="mt-4" asChild variant="outline">
            <NavLink to={APP_ROUTES.organizerEvent(nextEvent.id)}>View event</NavLink>
          </Button>
        </section>
      ) : (
        <EmptyState title="No active or upcoming event" description="Create an event to populate your organizer schedule." />
      )}
      <section className="grid gap-4 xl:grid-cols-2">
        <AttendanceTrendChart data={trendData} />
        <RiskSummaryChart data={riskData} />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Upcoming event schedule</h2>
          <div className="mt-4 space-y-3">
            {events.length ? events.map((event) => <EventScheduleCard key={event.id} event={event} />) : <EmptyState title="No events" />}
          </div>
        </div>
        <div className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Attention-needed participants</h2>
          <div className="mt-4 space-y-3">
            {flagged.length ? flagged.map((prediction) => <PredictionCard key={prediction.id} prediction={prediction} />) : <EmptyState title="No flagged participants" description="No high-risk mock predictions are tied to your events." />}
          </div>
        </div>
      </section>
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Recent completed event sessions</h2>
        <div className="mt-4 grid gap-3">
          {completedSessions.length ? completedSessions.slice(0, 4).map((session) => <SessionCard key={session.id} session={session} />) : <EmptyState title="No completed event sessions" />}
        </div>
      </section>
    </OrganizerFrame>
  );
}
