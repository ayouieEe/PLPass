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

export function EventDetailsPage() {
  const { eventId } = useParams();
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const [tab, setTab] = useState("participants");
  const eventQuery = useEvent(eventId, scope.context);
  const participantsQuery = useEventParticipants(eventId ?? "", { pageSize: 500 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, eventId }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500, eventId }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const predictionsQuery = useMlPredictions({ pageSize: 100, eventId }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    values: {
      venue: eventQuery.data?.venue ?? "",
      date: eventQuery.data?.startsAt.slice(0, 10) ?? "",
      startTime: eventQuery.data?.startsAt.slice(11, 16) ?? "",
      expectedEndTime: eventQuery.data?.endsAt.slice(11, 16) ?? "",
      attendanceMode: "face-to-face"
    }
  });
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
  if (participantsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading) {
    return <LoadingState label="Loading event workspace" />;
  }
  const event = eventQuery.data;
  const participants = participantsQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const students = studentsQuery.data?.items ?? [];
  const participantList = participantStudents(participants, students);
  const counts = attendanceCounts(records);
  const flagged = predictionsQuery.data?.items.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical") ?? [];
  const participantColumns: ColumnDef<Student>[] = [
    { id: "name", header: "Student name", cell: ({ row }) => studentName(row.original) },
    { accessorKey: "studentNumber", header: "Student number" },
    { accessorKey: "programId", header: "Program" },
    { accessorKey: "yearLevel", header: "Year level" },
    { accessorKey: "section", header: "Section" },
    { accessorKey: "status", header: "Student status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "rate", header: "Participation rate", cell: () => `${attendanceRate(records)}%` },
    { id: "risk", header: "Risk status", cell: ({ row }) => <StatusBadge label={flagged.some((prediction) => prediction.studentId === row.original.id) ? "flagged" : "normal"} tone={flagged.some((prediction) => prediction.studentId === row.original.id) ? "warning" : "success"} /> },
    { id: "action", header: "View", cell: () => <Button variant="outline" size="sm" disabled>View details</Button> }
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
  async function startSession(values: SessionFormValues) {
    const created = await mutations.createEventSessionMutation.mutateAsync({ eventId: event.id, ...values });
    navigate(APP_ROUTES.organizerSession(created.id));
  }
  const canStart = event.status === "approved" || event.status === "pending";
  return (
    <OrganizerFrame>
      <PageHeader eyebrow="Event Details" title={eventLabel(event)} description={`${event.category} at ${event.venue}`} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total participants" value={String(participants.length)} icon={Users} />
        <StatCard title="Completed sessions" value={String(sessions.filter((session) => session.status === "completed").length)} icon={CalendarCheck} />
        <StatCard title="Average participation" value={`${attendanceRate(records)}%`} icon={BarChart3} />
        <StatCard title="Flagged participants" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
      </section>
      <section className="rounded-lg border bg-surface p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <StatusBadge label={`Approval: ${event.status}`} tone={statusTone(event.status)} />
          <StatusBadge label={`Event: ${event.status}`} tone={statusTone(event.status)} />
          <span className="text-sm text-muted-foreground">{formatDate(event.startsAt)} {formatTime(event.startsAt)} - {formatTime(event.endsAt)}</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Attendance mode is selected when a mock session is started. Face-to-face uses NFC as planned primary method with QR and manual fallback placeholders. Online mode shows an online verification placeholder.</p>
      </section>
      {canStart ? (
        <form className="space-y-4 rounded-lg border bg-surface p-5" onSubmit={form.handleSubmit(startSession)}>
          <h2 className="font-semibold">Start event session</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <TextField control={form.control} name="venue" label="Venue" />
            <DatePickerField control={form.control} name="date" label="Date" />
            <TimePickerField control={form.control} name="startTime" label="Start time" />
            <TimePickerField control={form.control} name="expectedEndTime" label="Expected end time" />
            <SelectField control={form.control} name="attendanceMode" label="Attendance mode" options={[{ label: "Face-to-face", value: "face-to-face" }, { label: "Online", value: "online" }]} />
          </div>
          <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">Face-to-face: NFC planned primary method; QR and manual are planned fallback methods. Online: online verification placeholder only.</div>
          <SubmitButton isSubmitting={mutations.createEventSessionMutation.isPending}>Start mock event session</SubmitButton>
        </form>
      ) : (
        <EmptyState title="Start Session unavailable" description="This event status does not allow starting a mock attendance session." />
      )}
      <div className="flex flex-wrap gap-2 rounded-lg border bg-surface p-3">
        {["participants", "sessions", "summary", "information"].map((item) => <Button key={item} type="button" variant={tab === item ? "default" : "outline"} onClick={() => setTab(item)}>{item}</Button>)}
      </div>
      {tab === "participants" ? <PLPassDataGrid label="Event participants" data={participantList} columns={participantColumns} emptyTitle="No participants" /> : null}
      {tab === "sessions" ? <PLPassDataGrid label="Event sessions" data={sessions} columns={sessionColumns} emptyTitle="No event sessions" /> : null}
      {tab === "summary" ? <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={records.length} /> : null}
      {tab === "information" ? (
        <section className="rounded-lg border bg-surface p-5">
          <dl className="grid gap-3 md:grid-cols-2">
            {[
              ["Event code", event.code],
              ["Event name", event.title],
              ["Category", event.category],
              ["Description", "Development mock event details"],
              ["Venue", event.venue],
              ["Date", formatDate(event.startsAt)],
              ["Start time", formatTime(event.startsAt)],
              ["End time", formatTime(event.endsAt)],
              ["Approval status", event.status],
              ["Event status", event.status],
              ["Participant count", participants.length]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border bg-background p-3">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </OrganizerFrame>
  );
}
