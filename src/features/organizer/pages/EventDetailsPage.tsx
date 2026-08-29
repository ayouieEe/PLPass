/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, CalendarCheck, ClipboardList, Plus, Search, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { useHeader } from "@/app/providers/HeaderContext";
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
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { ModalShell } from "@/components/modals/ModalShell";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
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
  useAttendanceSubmissionMutations,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useCorrectionRequests,
  useEvent,
  useEventMutations,
  useEventObjectives,
  useEventResources,
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { compareDateValues, dateKey, formatDisplayDate, formatDisplayTime, isFutureOrNowDate } from "@/lib/utils/date";
import type { AttendanceSubmissionResult } from "@/services/contracts";
import type { RepositoryContext } from "@/services/repositoryUtils";
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
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
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
  return formatDisplayDate(value, "Not scheduled");
}

function formatTime(value: string | undefined) {
  return formatDisplayTime(value, "Not set");
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
  return student ? student.fullName ?? student.formattedName ?? student.studentNumber : "Unknown student";
}

function ShellState({ scope }: { scope: OrganizerScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading organizer workspace" />;
  }
  if (scope.isError || !scope.organizerId) {
    return <ErrorState title="Organizer profile unavailable" message="The signed-in account does not have an organizer profile record." />;
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
  const eventDate = dateKey(event.startsAt);
  if (!eventDate) {
    return undefined;
  }
  return semesters.find((semester) => eventDate >= semester.startsAt && eventDate <= semester.endsAt)?.id;
}

function eventMatchesDateRange(event: Event, dateFrom: string, dateTo: string) {
  const date = dateKey(event.startsAt);
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

export function EventDetailsPage() {
  const { eventId } = useParams();
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const { setHeaderOverride } = useHeader();
  const [tab, setTab] = useState("participants");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const eventQuery = useEvent(eventId, scope.context);
  const participantsQuery = useEventParticipants(eventId ?? "", { pageSize: 500 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, eventId }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500, eventId }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const catalog = useAcademicCatalog({ pageSize: 200 }, scope.context);
  const objectivesQuery = useEventObjectives(eventId, scope.context);
  const resourcesQuery = useEventResources(eventId ?? "", { pageSize: 20 }, scope.context);
  const predictionsQuery = useMlPredictions({ pageSize: 100, eventId }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  
  const selectedEvent = eventQuery.data;

  useEffect(() => {
    if (selectedEvent) {
      setHeaderOverride({
        title: `${selectedEvent.code} - ${selectedEvent.title}`,
        breadcrumbs: ["Organizer", "Events", selectedEvent.code],
        description: `${selectedEvent.category} at ${selectedEvent.venue}`
      });
    }
  }, [selectedEvent, setHeaderOverride]);

  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (eventQuery.isLoading) {
    return <LoadingState label="Loading event details" />;
  }
  if (eventQuery.isError || !eventQuery.data) {
    return <ErrorState title="Event unavailable" message="This event was not found or is outside the signed-in organizer scope." />;
  }
  if (participantsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || catalog.programs.isLoading || objectivesQuery.isLoading || resourcesQuery.isLoading) {
    return <LoadingState label="Loading event workspace" />;
  }
  const event = eventQuery.data;
  const programById = new Map((catalog.programs.data?.items ?? []).map((program) => [program.id, program.code]));
  const participants = participantsQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const students = studentsQuery.data?.items ?? [];
  const objectives = objectivesQuery.data ?? [];
  const resources = resourcesQuery.data?.items ?? [];
  const participantList = participantStudents(participants, students);
  const counts = attendanceCounts(records);
  const flagged = predictionsQuery.data?.items.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical") ?? [];
  const participantColumns: ColumnDef<Student>[] = [
    { id: "name", header: "Student name", cell: ({ row }) => studentName(row.original) },
    { accessorKey: "studentNumber", header: "Student number" },
    {
      accessorKey: "programId",
      header: "Program",
      cell: ({ row }) => programById.get(row.original.programId) ?? row.original.programId ?? "Unknown program"
    },
    { accessorKey: "yearLevel", header: "Year level" },
    { accessorKey: "section", header: "Section" },
    { accessorKey: "status", header: "Student status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "rate", header: "Participation rate", cell: () => `${attendanceRate(records)}%` },
    { id: "risk", header: "Risk status", cell: ({ row }) => <StatusBadge label={flagged.some((prediction) => prediction.studentId === row.original.id) ? "flagged" : "normal"} tone={flagged.some((prediction) => prediction.studentId === row.original.id) ? "warning" : "success"} /> },
    {
      id: "action",
      header: "View",
      cell: ({ row }) => (
        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedStudent(row.original)}>
          View details
        </Button>
      )
    }
  ];
  const sessionColumns: ColumnDef<AttendanceSession>[] = [
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { id: "start", header: "Start time", cell: ({ row }) => formatTime(row.original.startsAt) },
    { id: "end", header: "End time", cell: ({ row }) => formatTime(row.original.endsAt) },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "present", header: "Present count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).present },
    { id: "late", header: "Late count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).late },
    { id: "absent", header: "Absent count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).absent },
    { id: "action", header: "View session", cell: ({ row }) => <Button asChild variant="outline" size="sm"><NavLink to={APP_ROUTES.organizerSession(row.original.id)}>View session</NavLink></Button> }
  ];
  return (
    <OrganizerFrame>
      <PageHeader title={eventLabel(event)} description={`${event.category} at ${event.venue}`} />
      
      {/* Event Overview Stats */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total participants" value={String(participants.length)} icon={Users} />
        <StatCard title="Completed sessions" value={String(sessions.filter((session) => session.status === "completed").length)} icon={CalendarCheck} />
        <StatCard title="Average participation" value={`${attendanceRate(records)}%`} icon={BarChart3} />
        <StatCard title="Flagged participants" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
      </section>

      {/* Event Details Card */}
      <section className="rounded-lg border bg-surface p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="font-semibold text-foreground mb-4">Event Information</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">Event Code</dt>
                <dd className="mt-1 text-sm font-semibold">{event.code}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">Category</dt>
                <dd className="mt-1 text-sm font-semibold">{event.category}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">Venue</dt>
                <dd className="mt-1 text-sm font-semibold">{event.venue}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">Status</dt>
                <dd className="mt-1"><StatusBadge label={event.status} tone={statusTone(event.status)} /></dd>
              </div>
            </dl>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Schedule</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">Date</dt>
                <dd className="mt-1 text-sm font-semibold">{formatDate(event.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">Start Time</dt>
                <dd className="mt-1 text-sm font-semibold">{formatTime(event.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">End Time</dt>
                <dd className="mt-1 text-sm font-semibold">{formatTime(event.endsAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground uppercase">Participant Count</dt>
                <dd className="mt-1 text-sm font-semibold">{participants.length}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border bg-surface p-5 shadow-sm">
          <h3 className="font-semibold text-foreground">Classification &amp; Priority</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Institutional category</dt><dd className="mt-1 text-sm font-semibold">{event.institutionalCategory ?? "Not specified"}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Participation status</dt><dd className="mt-1 text-sm font-semibold">{event.participationStatus ?? "Not specified"}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Target group</dt><dd className="mt-1 text-sm font-semibold">{event.targetGroup ?? "Not specified"}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Priority tier</dt><dd className="mt-1 text-sm font-semibold">{event.priorityTier ?? "Not specified"}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Urgency points</dt><dd className="mt-1 text-sm font-semibold">{event.urgencyPoints ?? 0}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Impact points</dt><dd className="mt-1 text-sm font-semibold">{event.impactScore ?? 0}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Priority score</dt><dd className="mt-1 text-sm font-semibold">{event.priorityScore ?? 0}/9</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Fixed priority</dt><dd className="mt-1 text-sm font-semibold">{event.fixedPriority ? "Yes" : "No"}</dd></div>
          </dl>
        </section>
        <section className="rounded-lg border bg-surface p-5 shadow-sm">
          <h3 className="font-semibold text-foreground">Organizational Information</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">Requested by</dt><dd className="mt-1 text-sm font-semibold">{event.requestedBy ?? "Not specified"}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">College/Office</dt><dd className="mt-1 text-sm font-semibold">{event.collegeOffice ?? "Not specified"}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted-foreground">No. of Pax</dt><dd className="mt-1 text-sm font-semibold">{event.numberOfPax ?? participants.length}</dd></div>
          </dl>
        </section>
      </section>

      {(event.description || resources.length > 0) ? (
        <section className="rounded-lg border bg-surface p-5 shadow-sm">
          <h3 className="font-semibold text-foreground">Event Description</h3>
          {event.description ? <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{event.description}</p> : null}
          {resources.length > 0 ? <div className="mt-4 space-y-2">{resources.map((resource) => <a key={resource.id} href={resource.externalUrl} target="_blank" rel="noreferrer" className="block rounded-md border bg-background p-3 text-sm font-medium text-primary hover:underline">{resource.title}</a>)}</div> : null}
        </section>
      ) : null}

      <section className="rounded-lg border bg-surface p-5 shadow-sm">
        <h3 className="font-semibold text-foreground">Event objectives</h3>
        <div className="mt-3 space-y-2">
          {objectives.length > 0 ? (
            objectives.map((objective, index) => (
              <p key={objective.id} className="text-sm text-muted-foreground">
                {index + 1}. {objective.text}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No objectives defined for this event yet.</p>
          )}
        </div>
      </section>

      {/* Tabs Navigation */}
      <section className="space-y-4">
        {/* Only show tabs that have data */}
        {(participantList.length > 0 || (records.length > 0 && sessions.length > 0)) && (
          <div className="flex flex-wrap gap-2 border-b">
            {participantList.length > 0 && (
              <button
                type="button"
                onClick={() => setTab("participants")}
                className={`px-4 py-2 font-medium text-sm capitalize border-b-2 transition-colors ${
                  tab === "participants"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Participants ({participantList.length})
              </button>
            )}

            {records.length > 0 && sessions.length > 0 && (
              <button
                type="button"
                onClick={() => setTab("summary")}
                className={`px-4 py-2 font-medium text-sm capitalize border-b-2 transition-colors ${
                  tab === "summary"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Summary
              </button>
            )}
          </div>
        )}

        <div className="rounded-lg border bg-surface p-5">
          {tab === "participants" ? <PLPassDataGrid label="Event participants" data={participantList} columns={participantColumns} emptyTitle="No participants" /> : null}
          {tab === "summary" ? <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={records.length} /> : null}
        </div>
      </section>

      <ModalShell
        open={Boolean(selectedStudent)}
        title={selectedStudent ? studentName(selectedStudent) : "Student details"}
        description={selectedStudent ? `${selectedStudent.studentNumber} • Year ${selectedStudent.yearLevel} • Section ${selectedStudent.section}` : undefined}
        size="md"
        onClose={() => setSelectedStudent(null)}
      >
        {selectedStudent ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Student number</p>
                <p className="mt-2 text-base font-semibold text-foreground">{selectedStudent.studentNumber}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Status</p>
                <p className="mt-2 text-base font-semibold text-foreground">{selectedStudent.status}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Program</p>
                <p className="mt-2 text-base font-semibold text-foreground">{programById.get(selectedStudent.programId) ?? selectedStudent.programId ?? "Unknown program"}</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">Section</p>
                <p className="mt-2 text-base font-semibold text-foreground">{selectedStudent.section}</p>
              </div>
            </div>

            <div className="rounded-lg border bg-background p-4">
              <p className="text-sm font-medium text-foreground">Participation summary</p>
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <span>Attendance rate</span>
                <span className="font-semibold text-foreground">{attendanceRate(records)}%</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>Risk status</span>
                <span className="font-semibold text-foreground">
                  {flagged.some((prediction) => prediction.studentId === selectedStudent.id) ? "Flagged" : "Normal"}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </ModalShell>
    </OrganizerFrame>
  );
}
