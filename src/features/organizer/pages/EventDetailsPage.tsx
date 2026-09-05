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
  useStudents,
  useStudentCredentialStatuses
} from "@/hooks/useRepositoryQueries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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

type ParticipantInvitationStatus = {
  id: string;
  recipientProfileId: string;
  deliveryStatus: "pending" | "sent" | "failed" | "skipped";
  errorMessage?: string | null;
  sentAt?: string | null;
  createdAt: string;
};

export function EventDetailsPage() {
  const { eventId } = useParams();
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const { setHeaderOverride } = useHeader();
  const [tab, setTab] = useState("participants");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [participantStudentNumber, setParticipantStudentNumber] = useState("");
  const [participantPendingAddition, setParticipantPendingAddition] = useState<Student | null>(null);
  const [participantPendingRemoval, setParticipantPendingRemoval] = useState<string | null>(null);
  const [isUpdatingParticipants, setIsUpdatingParticipants] = useState(false);
  const [invitationStatuses, setInvitationStatuses] = useState<ParticipantInvitationStatus[]>([]);
  const [isRetryingInvitationId, setIsRetryingInvitationId] = useState<string | null>(null);
  const [invitationStatusRefreshKey, setInvitationStatusRefreshKey] = useState(0);
  const eventQuery = useEvent(eventId, scope.context);
  const participantsQuery = useEventParticipants(eventId ?? "", { pageSize: 500 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, eventId }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500, eventId }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const credentialStatusesQuery = useStudentCredentialStatuses(scope.context);
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

  useEffect(() => {
    if (!selectedEvent || !eventId || !scope.organizerId) {
      setInvitationStatuses([]);
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      const { data, error } = await getSupabaseBrowserClient().functions.invoke("send-event-emails", {
        body: { eventId, action: "status" }
      });
      if (cancelled || error) return;
      const statuses = data && typeof data === "object" && "statuses" in data && Array.isArray(data.statuses)
        ? data.statuses as ParticipantInvitationStatus[]
        : [];
      setInvitationStatuses(statuses);
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, invitationStatusRefreshKey, scope.organizerId, selectedEvent]);

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
  const participantPendingRemovalStudent = participantPendingRemoval
    ? participantList.find((student) => student.id === participantPendingRemoval)
    : undefined;
  const invitationStatusByProfileId = new Map(invitationStatuses.map((status) => [status.recipientProfileId, status]));
  const participantStudentIds = new Set(participantList.map((student) => student.id));
  const studentNumberForAddition = participantStudentNumber.trim().toLowerCase();
  const matchedStudentForAddition = studentNumberForAddition
    ? students.find((student) => student.studentNumber.trim().toLowerCase() === studentNumberForAddition)
    : undefined;
  const credentialStatusByStudentId = new Map((credentialStatusesQuery.data ?? []).map((status) => [status.studentId, status]));
  const now = Date.now();
  // A legacy in-progress session must not lock participant management. Under
  // the current lifecycle, an event is finalized only after End Session.
  const hasCompletedSession = sessions.some((session) => session.status === "completed");
  const canManageParticipants = !hasCompletedSession && event.status !== "completed" && event.status !== "cancelled";
  const counts = attendanceCounts(records);
  const flagged = predictionsQuery.data?.items.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical") ?? [];

  async function addParticipant(student: Student) {
    if (participantStudentIds.has(student.id)) {
      toast.warning("This student is already a participant in the event.");
      return;
    }

    setIsUpdatingParticipants(true);
    try {
      const client = getSupabaseBrowserClient();
      const { error } = await client
        .from("event_participants")
        .upsert(
          { event_id: event.id, student_id: student.id, participant_status: "confirmed" },
          { onConflict: "event_id,student_id" }
        );
      if (error) throw error;

      const { data: emailResult, error: emailError } = await client.functions.invoke("send-event-emails", {
        body: { eventId: event.id }
      });
      await participantsQuery.refetch();
      setParticipantStudentNumber("");
      setParticipantPendingAddition(null);
      setInvitationStatusRefreshKey((current) => current + 1);

      const failedEmails = typeof emailResult === "object" && emailResult && "failed" in emailResult
        ? Number(emailResult.failed)
        : 0;
      const processedEmails = typeof emailResult === "object" && emailResult && "processed" in emailResult
        ? Number(emailResult.processed)
        : 0;
      if (emailError || failedEmails > 0 || processedEmails < 1) {
        toast.warning(`${studentName(student)} was added. The invitation email is queued for retry.`);
      } else {
        toast.success(`${studentName(student)} was added and the event invitation email was sent.`);
      }
    } catch (error) {
      console.error("Failed to add event participant:", error);
      toast.error("Could not add this participant. Please try again.");
    } finally {
      setIsUpdatingParticipants(false);
    }
  }

  async function removeParticipant(studentId: string) {
    setIsUpdatingParticipants(true);
    try {
      const { error } = await getSupabaseBrowserClient()
        .from("event_participants")
        .update({ participant_status: "removed" })
        .eq("event_id", event.id)
        .eq("student_id", studentId);
      if (error) throw error;

      const student = students.find((item) => item.id === studentId);
      setParticipantPendingRemoval(null);
      await participantsQuery.refetch();
      toast.success(`${student ? studentName(student) : "Student"} removed from this event.`);
    } catch (error) {
      console.error("Failed to remove event participant:", error);
      toast.error("Could not remove this participant. Please try again.");
    } finally {
      setIsUpdatingParticipants(false);
    }
  }

  async function retryParticipantInvitation(outboxId: string) {
    setIsRetryingInvitationId(outboxId);
    try {
      const { data, error } = await getSupabaseBrowserClient().functions.invoke("send-event-emails", {
        body: { eventId: event.id, action: "retry", outboxId }
      });
      const failed = data && typeof data === "object" && "failed" in data ? Number(data.failed) : 0;
      if (error || failed > 0) {
        toast.error("The invitation could not be resent. Please try again.");
      } else {
        toast.success("Invitation email sent.");
      }
    } catch (error) {
      console.error("Failed to retry participant invitation:", error);
      toast.error("The invitation could not be resent. Please try again.");
    } finally {
      setIsRetryingInvitationId(null);
      setInvitationStatusRefreshKey((current) => current + 1);
    }
  }

  const participantColumns: ColumnDef<Student>[] = [
    { id: "name", header: "Student name", cell: ({ row }) => studentName(row.original) },
    { accessorKey: "studentNumber", header: "Student number" },
    {
      id: "qrCredential",
      header: "QR credential",
      cell: ({ row }) => {
        if (credentialStatusesQuery.isLoading) return <span className="text-sm text-muted-foreground">Checking...</span>;
        const credential = credentialStatusByStudentId.get(row.original.id)?.qrCredential;
        const ready = credential?.status === "activated" && !credential.revokedAt && (!credential.expiresAt || new Date(credential.expiresAt).getTime() > now);
        return <StatusBadge label={ready ? "Ready" : "Needs QR"} tone={ready ? "success" : "warning"} />;
      }
    },
    {
      id: "facialBackup",
      header: "Facial backup",
      cell: ({ row }) => {
        if (credentialStatusesQuery.isLoading) return <span className="text-sm text-muted-foreground">Checking...</span>;
        const ready = credentialStatusByStudentId.get(row.original.id)?.facialProfile?.status === "activated";
        return <StatusBadge label={ready ? "Ready" : "Not enrolled"} tone={ready ? "success" : "muted"} />;
      }
    },
    {
      id: "invitation",
      header: "Invitation",
      cell: ({ row }) => {
        const invitation = invitationStatusByProfileId.get(row.original.userId);
        if (!invitation) return <StatusBadge label="Not sent" tone="muted" />;

        const statusPresentation = {
          pending: { label: "Email queued", tone: "warning" as const },
          sent: { label: "Email sent", tone: "success" as const },
          failed: { label: "Email failed", tone: "danger" as const },
          skipped: { label: "Email skipped", tone: "muted" as const }
        }[invitation.deliveryStatus];

        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <StatusBadge label={statusPresentation.label} tone={statusPresentation.tone} />
            {invitation.deliveryStatus === "failed" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary"
                onClick={() => void retryParticipantInvitation(invitation.id)}
                disabled={isRetryingInvitationId === invitation.id}
              >
                {isRetryingInvitationId === invitation.id ? "Retrying..." : "Retry"}
              </Button>
            ) : null}
          </div>
        );
      }
    },
    {
      id: "action",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedStudent(row.original)}>View</Button>
          {canManageParticipants ? (
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setParticipantPendingRemoval(row.original.id)} disabled={isUpdatingParticipants}>Remove</Button>
          ) : null}
        </div>
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
        <div className="flex flex-wrap gap-2 border-b">
          <button
            type="button"
            onClick={() => setTab("participants")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === "participants"
                ? "border-b-2 border-primary text-primary"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Participants ({participantList.length})
          </button>
          {records.length > 0 && hasCompletedSession && (
            <button
              type="button"
              onClick={() => setTab("summary")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === "summary"
                  ? "border-b-2 border-primary text-primary"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Summary
            </button>
          )}
        </div>

        <div className="rounded-lg border bg-surface p-5">
          {tab === "participants" ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Participant management</h3>
                  <p className="mt-1 text-sm text-muted-foreground">QR is the primary attendance method. Facial recognition is an optional backup.</p>
                </div>
                {!canManageParticipants ? <span className="w-fit rounded-full border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">Changes locked</span> : null}
              </div>
              {canManageParticipants ? (
                <form
                  className="rounded-lg border bg-muted/20 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (matchedStudentForAddition && !participantStudentIds.has(matchedStudentForAddition.id) && !isUpdatingParticipants) {
                      setParticipantPendingAddition(matchedStudentForAddition);
                    }
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1 space-y-1 text-xs font-medium text-muted-foreground">
                      <span>Student ID</span>
                      <input
                        className="plpass-field h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"
                        value={participantStudentNumber}
                        onChange={(event) => setParticipantStudentNumber(event.target.value)}
                        placeholder="Enter student ID, e.g. 23-00265"
                        disabled={isUpdatingParticipants}
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={!matchedStudentForAddition || participantStudentIds.has(matchedStudentForAddition.id) || isUpdatingParticipants}
                    >
                      Add participant
                    </Button>
                  </div>
                  {participantStudentNumber.trim() ? (
                    matchedStudentForAddition ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{studentName(matchedStudentForAddition)}</span>
                        <span className="mx-1">·</span>{matchedStudentForAddition.studentNumber}
                        {participantStudentIds.has(matchedStudentForAddition.id) ? <span className="ml-2 text-amber-700">Already added</span> : <span className="ml-2 text-emerald-700">Ready to add</span>}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-destructive">No student matches that Student ID.</p>
                    )
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">Enter a Student ID to verify the student before adding them.</p>
                  )}
                </form>
              ) : (
                <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">Participant changes are locked after a session is completed or when the event is completed.</p>
              )}
              <PLPassDataGrid label="Event participants" data={participantList} columns={participantColumns} emptyTitle="No participants" emptyDescription="Add students here before the event session is completed." />
            </div>
          ) : null}
          {tab === "summary" ? <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={records.length} /> : null}
        </div>
      </section>

      <ConfirmModal
        open={Boolean(participantPendingAddition)}
        title="Add event participant?"
        description={participantPendingAddition ? `${studentName(participantPendingAddition)} (${participantPendingAddition.studentNumber}) will be added to this event and sent an invitation email.` : undefined}
        confirmLabel={isUpdatingParticipants ? "Adding..." : "Add participant"}
        cancelLabel="Cancel"
        onCancel={() => !isUpdatingParticipants && setParticipantPendingAddition(null)}
        onConfirm={() => participantPendingAddition && void addParticipant(participantPendingAddition)}
      />

      <ConfirmModal
        open={Boolean(participantPendingRemoval)}
        title="Remove event participant?"
        description={participantPendingRemovalStudent ? `${studentName(participantPendingRemovalStudent)} (${participantPendingRemovalStudent.studentNumber}) will no longer be able to check in for this event.` : undefined}
        confirmLabel={isUpdatingParticipants ? "Removing..." : "Remove participant"}
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => !isUpdatingParticipants && setParticipantPendingRemoval(null)}
        onConfirm={() => participantPendingRemoval && void removeParticipant(participantPendingRemoval)}
      />

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
