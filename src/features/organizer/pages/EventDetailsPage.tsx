/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, CalendarCheck, ChevronDown, ClipboardList, Download, FileText, FileUp, Link2, Play, Plus, Search, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
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
  useAuditLogMutations,
  useAttendanceSubmissionMutations,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useCorrectionRequests,
  useEvent,
  useEventMutations,
  useEventObjectives,
  useEventResources,
  useEventRescheduleMutation,
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
import {
  createEventLinkResource,
  eventResourceErrorMessage,
  getEventResourceDownloadUrl,
  isSecureResourceUrl,
  MAX_EVENT_RESOURCES,
  MAX_EVENT_RESOURCE_BYTES,
  removeEventResource,
  uploadEventFileResource
} from "@/features/organizer/lib/eventResources";
import { APP_ROUTES } from "@/lib/constants/routes";
import { compareDateValues, dateKey, formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import type { AttendanceSubmissionResult } from "@/services/contracts";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
  CorrectionRequest,
  Event,
  EventParticipant,
  EventResource,
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
import { useOfflineEvent } from "@/features/offline/useOfflineEvent";
import { OfflineStatusPanel } from "@/features/offline/OfflineStatusPanel";
import { desktopApi } from "@/features/offline/offlineService";

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

function timeInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function sharesSchedule(event: Event, other: Event) {
  if (event.id === other.id || other.status === "cancelled" || other.status === "completed") return false;
  if (event.venue.trim().toLowerCase() !== other.venue.trim().toLowerCase()) return false;
  if (dateKey(event.startsAt) !== dateKey(other.startsAt)) return false;
  return new Date(event.startsAt).getTime() < new Date(other.endsAt).getTime()
    && new Date(other.startsAt).getTime() < new Date(event.endsAt).getTime();
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
  const [isSendingQueuedInvitations, setIsSendingQueuedInvitations] = useState(false);
  const [invitationStatusRefreshKey, setInvitationStatusRefreshKey] = useState(0);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isStartSessionOpen, setIsStartSessionOpen] = useState(false);
  const [sessionModalMode, setSessionModalMode] = useState<"start" | "existing">("start");
  const [isDiscardSessionOpen, setIsDiscardSessionOpen] = useState(false);
  const [lateCutoffMinutes, setLateCutoffMinutes] = useState(15);
  const [rescheduleValues, setRescheduleValues] = useState({ venue: "", date: "", startTime: "", endTime: "", reason: "" });
  const [cancellationReason, setCancellationReason] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [resourcePendingRemoval, setResourcePendingRemoval] = useState<EventResource | null>(null);
  const resourceFileInputRef = useRef<HTMLInputElement>(null);
  const eventQuery = useEvent(eventId, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const participantsQuery = useEventParticipants(eventId ?? "", { pageSize: 500 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, eventId, sortBy: "actual_start", sortDirection: "desc" }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500, eventId }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const credentialStatusesQuery = useStudentCredentialStatuses(scope.context);
  const catalog = useAcademicCatalog({ pageSize: 200 }, scope.context);
  const objectivesQuery = useEventObjectives(eventId, scope.context);
  const resourcesQuery = useEventResources(eventId ?? "", { pageSize: 20 }, scope.context);
  const predictionsQuery = useMlPredictions({ pageSize: 100, eventId }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const { cancelEventMutation } = useEventMutations(scope.context);
  const auditLogMutations = useAuditLogMutations(scope.context);
  const rescheduleEventMutation = useEventRescheduleMutation(scope.context);
  const offline = useOfflineEvent(eventId);
  const [cleanupMessage,setCleanupMessage]=useState("");
  
  const selectedEvent = eventQuery.data;

  useEffect(() => {
    if (!selectedEvent) return;
    setRescheduleValues({
      venue: selectedEvent.venue,
      date: dateKey(selectedEvent.startsAt),
      startTime: timeInputValue(selectedEvent.startsAt),
      endTime: timeInputValue(selectedEvent.endsAt),
      reason: ""
    });
  }, [selectedEvent]);

  useEffect(() => {
    setIsStartSessionOpen(false);
    setSessionModalMode("start");
    setLateCutoffMinutes(15);
  }, [eventId]);

  useEffect(() => {
    if (selectedEvent) {
      setHeaderOverride({
        title: "Event details",
        breadcrumbs: ["Organizer", "Events", selectedEvent.code],
        description: undefined
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
  const activeSession = sessions.find((session) => session.eventId === event.id && session.status === "active");
  const activeSessionRecordCount = activeSession ? recordsForSession(records, activeSession.id).length : 0;
  const existingSessionForDialog = sessionModalMode === "existing" ? activeSession : undefined;
  const canManageParticipants = !hasCompletedSession && event.status !== "completed" && event.status !== "cancelled";
  const canChangeEvent = event.status !== "completed" && event.status !== "cancelled";
  const earliestRescheduleDate = dateKey(new Date());
  const scheduleConflicts = (eventsQuery.data?.items ?? []).filter((otherEvent) => sharesSchedule(event, otherEvent));
  const counts = attendanceCounts(records);
  const flagged = predictionsQuery.data?.items.filter((prediction) => prediction.riskLevel === "high" || prediction.riskLevel === "critical") ?? [];

  async function rescheduleEvent() {
    if (!rescheduleValues.reason.trim() || rescheduleValues.reason.trim().length < 5) {
      toast.error("Add a short reason for changing this event's schedule.");
      return;
    }
    if (!rescheduleValues.venue || !rescheduleValues.date || !rescheduleValues.startTime || !rescheduleValues.endTime) {
      toast.error("Complete the venue, date, start time, and end time.");
      return;
    }
    if (rescheduleValues.date < earliestRescheduleDate) {
      toast.error("Choose today or a future date for the new schedule.");
      return;
    }
    if (rescheduleValues.endTime <= rescheduleValues.startTime) {
      toast.error("End time must be after start time.");
      return;
    }

    try {
      await rescheduleEventMutation.mutateAsync({ eventId: event.id, ...rescheduleValues });
      await eventQuery.refetch();
      setIsRescheduleOpen(false);
    } catch {
      // The mutation displays the repository error in a toast.
    }
  }

  async function cancelEvent() {
    if (cancellationReason.trim().length < 5) {
      toast.error("Add a short reason for cancelling this event.");
      return;
    }

    try {
      await cancelEventMutation.mutateAsync({ eventId: event.id, reason: cancellationReason.trim() });
      await eventQuery.refetch();
      setIsCancelOpen(false);
      setCancellationReason("");
      toast.success("Event cancelled.");
    } catch {
      // The mutation displays the repository error in a toast.
    }
  }

  async function startAttendanceSession() {
    try {
      const session = await mutations.createEventSessionMutation.mutateAsync({
        eventId: event.id,
        venue: event.venue,
        date: dateKey(event.startsAt),
        startTime: timeInputValue(event.startsAt),
        expectedEndTime: timeInputValue(event.endsAt),
        attendanceMode: "face-to-face",
        lateCutoffMinutes
      });
      setIsStartSessionOpen(false);
      toast.success("Attendance session started.");
      navigate(`${APP_ROUTES.organizerEvents}?session=${encodeURIComponent(session.id)}`);
    } catch {
      // The mutation displays the repository error in a toast.
    }
  }

  async function discardEmptySession() {
    if (!activeSession) return;

    try {
      const { error } = await getSupabaseBrowserClient().rpc("discard_empty_event_session" as never, {
        p_session_id: activeSession.id
      } as never);
      if (error) throw error;

      setIsDiscardSessionOpen(false);
      setIsStartSessionOpen(false);
      await Promise.all([eventQuery.refetch(), sessionsQuery.refetch()]);
      toast.success("Session discarded. The event is ready to start again.");
    } catch (error) {
      console.error("Failed to discard the session:", error);
      const message = error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "";
      toast.error(
        /discard_empty_event_session|PGRST202/i.test(message)
          ? "Discard session needs the latest database update. Apply migrations, then try again."
          : "This session could not be discarded."
      );
    }
  }

  async function addResourceLink() {
    if (!eventId) return;
    if ((resourcesQuery.data?.items.length ?? 0) >= MAX_EVENT_RESOURCES) {
      toast.error(`You can add up to ${MAX_EVENT_RESOURCES} resources to an event.`);
      return;
    }
    if (!resourceTitle.trim() || !isSecureResourceUrl(resourceUrl)) {
      toast.error("Enter a resource title and an HTTPS link.");
      return;
    }
    setIsSavingResource(true);
    try {
      await createEventLinkResource(eventId, resourceTitle, resourceUrl);
      await resourcesQuery.refetch();
      void auditLogMutations.logActionMutation.mutateAsync({ action: "Added Event Resource", targetType: "event_resource", targetId: eventId, metadata: { title: resourceTitle.trim(), type: "link" } });
      setResourceTitle("");
      setResourceUrl("");
      toast.success("Resource link added.");
    } catch (error) {
      toast.error(eventResourceErrorMessage(error, "Unable to add the resource link."));
    } finally {
      setIsSavingResource(false);
    }
  }

  async function addResourceFile(file: File | null) {
    if (!eventId || !file) return;
    if ((resourcesQuery.data?.items.length ?? 0) >= MAX_EVENT_RESOURCES) {
      toast.error(`You can add up to ${MAX_EVENT_RESOURCES} resources to an event.`);
      return;
    }
    if (file.size > MAX_EVENT_RESOURCE_BYTES) {
      toast.error("Each attached file must be 25 MB or smaller.");
      return;
    }
    setIsSavingResource(true);
    try {
      await uploadEventFileResource(eventId, resourceTitle, file);
      await resourcesQuery.refetch();
      void auditLogMutations.logActionMutation.mutateAsync({ action: "Added Event Resource", targetType: "event_resource", targetId: eventId, metadata: { title: resourceTitle.trim() || file.name, type: "file" } });
      setResourceTitle("");
      toast.success("File attached.");
    } catch (error) {
      toast.error(eventResourceErrorMessage(error, "Unable to attach the file."));
    } finally {
      setIsSavingResource(false);
    }
  }

  async function confirmResourceRemoval() {
    if (!resourcePendingRemoval) return;
    try {
      await removeEventResource(resourcePendingRemoval);
      await resourcesQuery.refetch();
      void auditLogMutations.logActionMutation.mutateAsync({ action: "Removed Event Resource", targetType: "event_resource", targetId: resourcePendingRemoval.id, metadata: { title: resourcePendingRemoval.title } });
      toast.success("Resource removed.");
      setResourcePendingRemoval(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function openResource(resource: EventResource) {
    try {
      window.open(await getEventResourceDownloadUrl(resource), "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

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

      await participantsQuery.refetch();
      setParticipantStudentNumber("");
      setParticipantPendingAddition(null);
      setInvitationStatusRefreshKey((current) => current + 1);
      toast.success(`${studentName(student)} was added. The invitation email is queued for delivery.`);
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
      if (error) {
        toast.error("The invitation could not be queued for resend. Please try again.");
      } else {
        toast.success("Invitation email queued for resend.");
      }
    } catch (error) {
      console.error("Failed to retry participant invitation:", error);
      toast.error("The invitation could not be resent. Please try again.");
    } finally {
      setIsRetryingInvitationId(null);
      setInvitationStatusRefreshKey((current) => current + 1);
    }
  }

  async function sendQueuedInvitations() {
    setIsSendingQueuedInvitations(true);
    try {
      const { data, error } = await getSupabaseBrowserClient().functions.invoke("send-event-emails", {
        body: { eventId: event.id }
      });
      const processed = data && typeof data === "object" && "processed" in data ? Number(data.processed) : 0;
      const failed = data && typeof data === "object" && "failed" in data ? Number(data.failed) : 0;
      if (error || failed > 0) {
        toast.error("Some invitation emails could not be sent. Please try again.");
      } else if (processed === 0) {
        toast.info("There are no invitation emails waiting to send.");
      } else {
        toast.success("Queued invitation emails sent.");
      }
    } catch (error) {
      console.error("Failed to send queued invitations:", error);
      toast.error("The invitation emails could not be sent. Please try again.");
    } finally {
      setIsSendingQueuedInvitations(false);
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
        if (!invitation) return <StatusBadge label="No email queued" tone="muted" />;

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
      <PageHeader
        title={eventLabel(event)}
        description="Review event details, participants, and attendance sessions."
        actions={canChangeEvent ? (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={mutations.createEventSessionMutation.isPending} onClick={() => {
              setSessionModalMode(activeSession ? "existing" : "start");
              if (!activeSession) setLateCutoffMinutes(15);
              setIsStartSessionOpen(true);
            }}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Start session
            </Button>
            <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1 rounded-md border border-input bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                More actions
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border bg-surface p-1 shadow-lg">
                <button type="button" className="w-full rounded-sm px-3 py-2 text-left text-sm font-medium hover:bg-muted" onClick={() => setIsRescheduleOpen(true)}>Reschedule event</button>
                <button type="button" className="w-full rounded-sm px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive/10" onClick={() => setIsCancelOpen(true)}>Cancel event</button>
              </div>
            </details>
          </div>
        ) : undefined}
      />

      <OfflineStatusPanel status={offline.status} busy={offline.busy} onPrepare={()=>void offline.prepare().then(()=>toast.success("Event is ready for offline use.")).catch((error)=>toast.error(error instanceof Error?error.message:"Offline preparation failed."))} onRetry={()=>void offline.sync()} />
      {offline.status.runtimeAvailable&&offline.status.packageStatus==="READY"?<section className="rounded-lg border bg-surface p-4" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Post-event local cleanup</p><p className="text-sm text-muted-foreground">Available only after the event is completed, all local records are confirmed, and Supabase is reachable.</p>{cleanupMessage?<p className="mt-2 text-sm">{cleanupMessage}</p>:null}</div><Button type="button" variant="outline" disabled={offline.busy} onClick={()=>void (async()=>{const api=desktopApi();if(!api)return;const result=await api.cleanupEvent(event.id,offline.status.connectivity==="online"&&offline.status.pendingCount===0,event.status==="completed");setCleanupMessage(result.message);if(result.cleaned)await offline.refresh();})()}>Clean up offline package</Button></div></section>:null}
      
      {/* Event Overview Stats */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total participants" value={String(participants.length)} icon={Users} />
        <StatCard title="Completed sessions" value={String(sessions.filter((session) => session.status === "completed").length)} icon={CalendarCheck} />
        <StatCard title="Average participation" value={hasCompletedSession ? `${attendanceRate(records)}%` : "N/A"} icon={BarChart3} />
        <StatCard title="Flagged participants" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} />
      </section>

      {/* Event Details Card */}
      <section className="rounded-lg border bg-surface p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold text-foreground">Event Information</h3>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
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
            <h3 className="font-semibold text-foreground">Schedule</h3>
            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
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

      {scheduleConflicts.length > 0 ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-foreground">Schedule Conflict</h2>
                <span className="rounded-full border border-amber-200 bg-background px-2.5 py-1 text-xs font-medium text-amber-800">
                  {scheduleConflicts.length} overlapping {scheduleConflicts.length === 1 ? "event" : "events"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">The following event overlaps with this event at {event.venue}. Reschedule one of the events before attendance starts.</p>
              <div className="mt-4 space-y-2">
                {scheduleConflicts.map((conflict) => (
                  <div key={conflict.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-background px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conflicting event</p>
                      <p className="font-medium text-foreground">{eventLabel(conflict)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(conflict.startsAt)} · {formatTime(conflict.startsAt)} – {formatTime(conflict.endsAt)}</p>
                    </div>
                    <Button asChild type="button" variant="outline" size="sm">
                      <NavLink to={APP_ROUTES.organizerEvent(conflict.id)}>Review event</NavLink>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

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

      {event.description ? (
        <section className="rounded-lg border bg-surface p-5 shadow-sm">
          <h3 className="font-semibold text-foreground">Event Description</h3>
          {event.description ? <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{event.description}</p> : null}
        </section>
      ) : null}

      <section className="rounded-lg border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">Event Resources</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{resources.length} of {MAX_EVENT_RESOURCES}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Share files or HTTPS links with assigned participants. Files can be up to 25 MB.</p>
          </div>
          <input ref={resourceFileInputRef} type="file" className="sr-only" onChange={(inputEvent) => { void addResourceFile(inputEvent.target.files?.[0] ?? null); inputEvent.currentTarget.value = ""; }} />
        </div>

        <div className="mt-5 border-t pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a resource</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.25fr)_auto_auto]">
            <input className="plpass-field h-10 rounded-md border bg-background px-3 text-sm" value={resourceTitle} onChange={(inputEvent) => setResourceTitle(inputEvent.target.value)} placeholder="Link title" aria-label="Link title" />
            <input className="plpass-field h-10 rounded-md border bg-background px-3 text-sm" value={resourceUrl} onChange={(inputEvent) => setResourceUrl(inputEvent.target.value)} placeholder="https://..." aria-label="HTTPS link" />
            <Button type="button" variant="outline" size="sm" onClick={() => void addResourceLink()} disabled={isSavingResource || resources.length >= MAX_EVENT_RESOURCES}>
              <Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Add link
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => resourceFileInputRef.current?.click()} disabled={isSavingResource || resources.length >= MAX_EVENT_RESOURCES}>
              <FileUp className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Attach file
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Added resources</p>
            {isSavingResource ? <span className="text-xs text-muted-foreground">Saving…</span> : null}
          </div>
          {resources.length ? (
            <div className="divide-y overflow-hidden rounded-md border bg-background">
              {resources.map((resource) => (
                <div key={resource.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      {resource.externalUrl ? <Link2 className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{resource.title}</p>
                      <p className="text-xs text-muted-foreground">{resource.externalUrl ? "External link" : "Attached file"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => void openResource(resource)}>
                      <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {resource.externalUrl ? "Open" : "Download"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setResourcePendingRemoval(resource)}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">No resources added yet. Attach a file or add a link above.</p>
          )}
        </div>
      </section>

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
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-foreground">Participant management</h3>
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
              <PLPassDataGrid
                label="Event participants"
                data={participantList}
                columns={participantColumns}
                emptyTitle="No participants"
                emptyDescription="Add students here before the event session is completed."
                toolbarActions={
                  <Button type="button" variant="outline" size="sm" onClick={() => void sendQueuedInvitations()} disabled={isSendingQueuedInvitations || !canManageParticipants}>
                    {isSendingQueuedInvitations ? "Sending..." : "Send pending emails"}
                  </Button>
                }
              />
            </div>
          ) : null}
          {tab === "summary" ? <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={records.length} /> : null}
        </div>
      </section>

      <ModalShell
        open={isStartSessionOpen}
        title={existingSessionForDialog ? "Live session already started" : "Start attendance"}
        description={existingSessionForDialog ? "Continue this event's attendance, or discard it if it was started by mistake." : "Attendance starts now. The planned schedule stays unchanged."}
        size="sm"
        onClose={() => !mutations.createEventSessionMutation.isPending && setIsStartSessionOpen(false)}
        footer={existingSessionForDialog ? <>{activeSessionRecordCount === 0 ? <Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setIsDiscardSessionOpen(true)}>Discard session</Button> : null}<Button asChild type="button"><NavLink to={`${APP_ROUTES.organizerEvents}?session=${encodeURIComponent(existingSessionForDialog.id)}`}>Open live session</NavLink></Button></> : <><Button type="button" variant="outline" onClick={() => setIsStartSessionOpen(false)} disabled={mutations.createEventSessionMutation.isPending}>Cancel</Button><Button type="button" onClick={() => void startAttendanceSession()} disabled={mutations.createEventSessionMutation.isPending}>{mutations.createEventSessionMutation.isPending ? "Starting..." : "Start session"}</Button></>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Venue</p><p className="mt-1 font-semibold">{event.venue}</p></div>
            <div><p className="text-xs font-medium uppercase text-muted-foreground">Planned time</p><p className="mt-1 font-semibold">{formatTime(event.startsAt)} - {formatTime(event.endsAt)}</p></div>
          </div>
          {existingSessionForDialog ? (
            <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
              <div>
                <p className="font-semibold text-emerald-950">{activeSessionRecordCount === 0 ? "No attendance recorded yet" : "Attendance is being recorded"}</p>
                <p className="mt-1 text-sm leading-5 text-emerald-900/80">{activeSessionRecordCount === 0 ? "You can safely discard this session if it was started by mistake." : "The session must be ended normally because attendance has already been recorded."}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-lg border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Late arrival rule</p>
                  <p className="mt-1 text-sm text-muted-foreground">Students checking in after this time are marked Late.</p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-foreground">
                  <span className="sr-only">Minutes before a student is marked late</span>
                  <input type="number" min="0" max="240" className="plpass-field h-10 w-20 rounded-md border bg-background px-2 text-center text-sm font-semibold" value={lateCutoffMinutes} onChange={(inputEvent) => setLateCutoffMinutes(Math.max(0, Number(inputEvent.target.value) || 0))} />
                  <span>min</span>
                </label>
              </div>
              <p className="text-sm text-muted-foreground">The actual start time is saved when you start the session.</p>
            </>
          )}
        </div>
      </ModalShell>

      <ConfirmModal
        open={isDiscardSessionOpen}
        title="Discard this session?"
        description="No attendance has been recorded. The event will return to its scheduled state and can be started again later."
        confirmLabel="Discard session"
        cancelLabel="Keep session"
        tone="danger"
        onCancel={() => setIsDiscardSessionOpen(false)}
        onConfirm={() => void discardEmptySession()}
      />

      <ConfirmModal
        open={Boolean(resourcePendingRemoval)}
        title="Remove this resource?"
        description={resourcePendingRemoval ? `${resourcePendingRemoval.title} will no longer be available to event participants.` : undefined}
        confirmLabel="Remove resource"
        cancelLabel="Keep resource"
        tone="danger"
        onCancel={() => setResourcePendingRemoval(null)}
        onConfirm={() => void confirmResourceRemoval()}
      />

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

      <ModalShell
        open={isRescheduleOpen}
        title="Reschedule event"
        description="Update the schedule and let participants know why it changed."
        size="md"
        onClose={() => !rescheduleEventMutation.isPending && setIsRescheduleOpen(false)}
        footer={<><Button type="button" variant="outline" onClick={() => setIsRescheduleOpen(false)} disabled={rescheduleEventMutation.isPending}>Cancel</Button><Button type="submit" form="reschedule-event-form" disabled={rescheduleEventMutation.isPending}>{rescheduleEventMutation.isPending ? "Saving..." : "Save new schedule"}</Button></>}
      >
        <form id="reschedule-event-form" className="space-y-4" onSubmit={(submitEvent) => { submitEvent.preventDefault(); void rescheduleEvent(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>Venue</span>
              <input className="plpass-field h-10 w-full rounded-md border bg-background px-3 text-sm" value={rescheduleValues.venue} onChange={(inputEvent) => setRescheduleValues((current) => ({ ...current, venue: inputEvent.target.value }))} />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>Date</span>
              <input type="date" min={earliestRescheduleDate} className="plpass-field h-10 w-full rounded-md border bg-background px-3 text-sm" value={rescheduleValues.date} onChange={(inputEvent) => setRescheduleValues((current) => ({ ...current, date: inputEvent.target.value }))} />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>Start time</span>
              <input type="time" className="plpass-field h-10 w-full rounded-md border bg-background px-3 text-sm" value={rescheduleValues.startTime} onChange={(inputEvent) => setRescheduleValues((current) => ({ ...current, startTime: inputEvent.target.value }))} />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-foreground">
              <span>End time</span>
              <input type="time" className="plpass-field h-10 w-full rounded-md border bg-background px-3 text-sm" value={rescheduleValues.endTime} onChange={(inputEvent) => setRescheduleValues((current) => ({ ...current, endTime: inputEvent.target.value }))} />
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium text-foreground">
            <span>Reason for the change</span>
            <textarea className="plpass-field min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="For example: Venue is unavailable at the original time." value={rescheduleValues.reason} onChange={(inputEvent) => setRescheduleValues((current) => ({ ...current, reason: inputEvent.target.value }))} />
          </label>
          <p className="rounded-md border border-primary/15 bg-primary/5 p-3 text-sm text-muted-foreground">Participants will receive an updated event email after you save the new schedule.</p>
        </form>
      </ModalShell>

      <ModalShell
        open={isCancelOpen}
        title="Cancel event?"
        description="Participants will no longer be able to attend this event."
        size="sm"
        onClose={() => !cancelEventMutation.isPending && setIsCancelOpen(false)}
        footer={<><Button type="button" variant="outline" onClick={() => setIsCancelOpen(false)} disabled={cancelEventMutation.isPending}>Keep event</Button><Button type="button" variant="destructive" onClick={() => void cancelEvent()} disabled={cancelEventMutation.isPending || cancellationReason.trim().length < 5}>{cancelEventMutation.isPending ? "Cancelling..." : "Cancel event"}</Button></>}
      >
        <label className="block space-y-1.5 text-sm font-medium text-foreground">
          <span>Reason for cancelling</span>
          <textarea className="plpass-field min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Explain why this event is being cancelled." value={cancellationReason} onChange={(inputEvent) => setCancellationReason(inputEvent.target.value)} />
          <span className="text-xs font-normal text-muted-foreground">Add at least 5 characters.</span>
        </label>
      </ModalShell>
    </OrganizerFrame>
  );
}
