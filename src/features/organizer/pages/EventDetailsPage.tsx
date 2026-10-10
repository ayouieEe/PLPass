/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, ArrowLeft, BarChart3, CalendarCheck, CalendarDays, ChevronDown, ClipboardList, Clock3, Download, FileText, FileUp, Link2, MapPin, Play, Plus, Search, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
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
import { hasCapability } from "@/lib/auth/permissions";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { summarizeFinalizedAttendance, summarizeUniqueAttendance } from "@/features/organizer/utils/attendanceSummary";
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
  useStudents,
  useStudentCredentialStatuses
} from "@/hooks/useRepositoryQueries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cleanupExpiredReconciledEvents, refreshPreparedEventAfterChange } from "@/features/offline/offlineService";
import {
  createEventLinkResource,
  eventResourceErrorMessage,
  downloadEventResource,
  isSecureResourceUrl,
  MAX_EVENT_RESOURCES,
  MAX_EVENT_RESOURCE_BYTES,
  removeEventResource,
  uploadEventFileResource
} from "@/features/organizer/lib/eventResources";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getWorkspaceRoute } from "@/lib/utils/workspaceRoutes";
import { compareDateValues, dateKey, formatDisplayDate, formatDisplayTime, manilaDateTimeToIso } from "@/lib/utils/date";
import type { AttendanceSubmissionResult } from "@/services/contracts";
import { repositories } from "@/services/repositories";
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
import { confirmSupabaseConnectivity, desktopApi, startOfflineEvent } from "@/features/offline/offlineService";
import type { PreparedEventPackage } from "@/features/offline/types";
import { useAttendanceSummaries } from "@/features/organizer/hooks/useEventAttendance";

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
  const { session, isOfflineMode } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined),
    [session]
  );
  const canUseOrganizerScope = session?.role === "organizer" || session?.role === "admin";
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context, !isOfflineMode && canUseOrganizerScope);
  const isAdmin = session?.role === "admin";
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" },
    organizerId: organizerQuery.data?.items[0]?.id ?? (isAdmin ? "admin-global" : isOfflineMode ? session?.userId : undefined),
    organizerName: session?.displayName ?? "Organizer",
    isLoading: !isOfflineMode && canUseOrganizerScope && organizerQuery.isLoading,
    isError: !isOfflineMode && canUseOrganizerScope && !isAdmin && organizerQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return formatDisplayDate(value, "Not scheduled");
}

function formatTime(value: string | undefined) {
  return formatDisplayTime(value, "Not set");
}

function statusTone(status: AttendanceStatus | "pending" | SessionStatus | CorrectionRequestStatus | StudentStatus | RiskLevel | EventStatus) {
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
  const summary = summarizeUniqueAttendance(records.map((record) => ({ identity: record.studentId, attendanceStatus: record.status })), 0);
  return {
    present: summary.present,
    late: summary.late,
    absent: summary.absent
  };
}

function attendanceRate(records: AttendanceRecord[]) {
  return summarizeFinalizedAttendance(records.map((record) => ({
    identity: record.studentId,
    attendanceStatus: record.status,
    finalizedAt: record.finalizedAt
  }))).attendanceRate;
}

function eventLabel(event: Event | undefined) {
  return event ? `${event.code} - ${formatEventTitle(event.title)}` : "Unknown event";
}

function formatEventTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function studentName(student: Student | undefined) {
  return student ? student.fullName ?? student.formattedName ?? student.studentNumber : "Unknown student";
}

function offlineEventFromPackage(pkg: PreparedEventPackage, organizerId?: string): Event {
  const knownStatuses: EventStatus[] = ["pending", "approved", "rejected", "ongoing", "completed", "cancelled"];
  const localSession = pkg.sessions[0];
  return {
    id: pkg.event.id,
    code: pkg.event.code,
    organizerId: organizerId ?? pkg.organizerProfileId ?? "offline-organizer",
    category: "Offline package",
    title: pkg.event.title,
    venue: localSession?.venue ?? "Prepared offline event",
    startsAt: pkg.event.startsAt,
    endsAt: pkg.event.endsAt,
    status: knownStatuses.includes(pkg.event.status as EventStatus) ? pkg.event.status as EventStatus : "approved",
    priorityLevel: "Flexible",
    impactScore: null,
    predictedTurnout: pkg.participants.filter((participant) => participant.isParticipant !== false).length
  };
}

function offlineParticipantsFromPackage(pkg: PreparedEventPackage): EventParticipant[] {
  return pkg.participants
    .filter((participant) => participant.isParticipant !== false)
    .map((participant) => ({
      id: `${pkg.event.id}:${participant.studentId}`,
      eventId: pkg.event.id,
      studentId: participant.studentId,
      registeredAt: pkg.preparedAt
    }));
}

function offlineStudentsFromPackage(pkg: PreparedEventPackage): Student[] {
  return pkg.participants
    .filter((participant) => participant.isParticipant !== false)
    .map((participant) => ({
      id: participant.studentId,
      userId: participant.studentId,
      studentNumber: participant.studentNumber,
      status: "enrolled",
      programId: "offline-program",
      departmentId: "offline-department",
      yearLevel: 0,
      section: "",
      fullName: participant.displayName,
      formattedName: participant.displayName,
      createdAt: pkg.preparedAt
    }));
}

function offlineSessionsFromPackage(pkg: PreparedEventPackage, organizerId?: string): AttendanceSession[] {
  return pkg.sessions.map((session) => ({
    id: session.id,
    type: "event",
    eventId: session.eventId,
    title: session.title,
    mode: "required",
    status: session.status === "ongoing" ? "active" : session.status === "completed" ? "completed" : "draft",
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    lateCutoffAt: session.lateCutoffAt,
    attendanceWindowStartAt: session.attendanceWindowStartAt,
    attendanceWindowEndAt: session.attendanceWindowEndAt,
    createdAt: pkg.preparedAt,
    createdByUserId: organizerId ?? pkg.organizerProfileId ?? "offline-organizer"
  }));
}

function offlineRecordsFromPackage(pkg: PreparedEventPackage): AttendanceRecord[] {
  return pkg.attendance
    .filter((record) => record.attendanceStatus === "present" || record.attendanceStatus === "late" || record.attendanceStatus === "absent")
    .map((record) => ({
      id: `${record.sessionId}:${record.studentId}`,
      sessionId: record.sessionId,
      studentId: record.studentId,
      status: record.attendanceStatus as AttendanceStatus,
      verificationMethod: "manual",
      recordedAt: record.timeIn ?? pkg.preparedAt,
      timeIn: record.timeIn,
      checkedOutAt: record.timeOut
    }));
}

function ShellState({ scope }: { scope: OrganizerScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading organizer workspace" />;
  }
  if (scope.isError || (!scope.organizerId && !["admin", "department_admin"].includes(scope.context.actorRole))) {
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
    status: record.status,
    timestamp: formatTime(record.recordedAt)
  }));
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
  const { session, isOfflineMode } = useDevelopmentSession();
  const isAdmin = session?.role === "admin";
  const canManageOwnedEvents = session ? hasCapability(session.role, "events.manage.owned") : false;
  const location = useLocation();
  const workspaceRoute = (organizerRoute: string, adminRoute: string) => getWorkspaceRoute(location.pathname, organizerRoute, adminRoute);
  const navigate = useNavigate();
  const { setHeaderOverride } = useHeader();
  const [tab, setTab] = useState("participants");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [participantStudentNumber, setParticipantStudentNumber] = useState("");
  const [isParticipantPickerOpen, setIsParticipantPickerOpen] = useState(false);
  const [participantPickerSelectedIds, setParticipantPickerSelectedIds] = useState<string[]>([]);
  const [participantPickerConflicts, setParticipantPickerConflicts] = useState<Record<string, { eventCode: string; eventTitle: string }>>({});
  const [participantPickerSearch, setParticipantPickerSearch] = useState("");
  const [participantPickerProgramId, setParticipantPickerProgramId] = useState("");
  const [participantPickerYearLevel, setParticipantPickerYearLevel] = useState("");
  const [participantPickerSection, setParticipantPickerSection] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantProgramId, setParticipantProgramId] = useState("");
  const [participantYearLevel, setParticipantYearLevel] = useState("");
  const [participantSection, setParticipantSection] = useState("");
  const [participantPendingAddition, setParticipantPendingAddition] = useState<Student | null>(null);
  const [participantPendingRemoval, setParticipantPendingRemoval] = useState<string | null>(null);
  const [isUpdatingParticipants, setIsUpdatingParticipants] = useState(false);
  const [invitationStatuses, setInvitationStatuses] = useState<ParticipantInvitationStatus[]>([]);
  const [isRetryingInvitationId, setIsRetryingInvitationId] = useState<string | null>(null);
  const [isSendingQueuedInvitations, setIsSendingQueuedInvitations] = useState(false);
  const [invitationStatusRefreshKey, setInvitationStatusRefreshKey] = useState(0);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleToStart, setRescheduleToStart] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isStartSessionOpen, setIsStartSessionOpen] = useState(false);
  const [lateCutoffMinutes, setLateCutoffMinutes] = useState(15);
  const [isOfflinePreparationOpen, setIsOfflinePreparationOpen] = useState(false);
  const [isDownloadingOfflineResources, setIsDownloadingOfflineResources] = useState(false);
  const [offlinePreparationError, setOfflinePreparationError] = useState("");
  const [pendingStartedSession, setPendingStartedSession] = useState<{ id: string; startedAt: string; lateCutoffAt?: string } | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isOpeningLiveSession, setIsOpeningLiveSession] = useState(false);
  const [liveSessionRedirectError, setLiveSessionRedirectError] = useState("");
  const [sessionModalMode, setSessionModalMode] = useState<"start" | "existing">("start");
  const [isDiscardSessionOpen, setIsDiscardSessionOpen] = useState(false);
  const [rescheduleValues, setRescheduleValues] = useState({ venue: "", date: "", startTime: "", endTime: "", reason: "" });
  const [cancellationReason, setCancellationReason] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceFileTitle, setResourceFileTitle] = useState("");
  const [isSavingResource, setIsSavingResource] = useState(false);
  const [resourcePendingRemoval, setResourcePendingRemoval] = useState<EventResource | null>(null);
  const resourceFileInputRef = useRef<HTMLInputElement>(null);
  const liveSessionRedirectRef = useRef<{ sessionId: string; target: string; fallbackAttempted: boolean } | null>(null);
  // A prepared package is complete enough to render this same event workspace.
  // Never issue remote queries while offline: an expected network failure must
  // not replace a valid downloaded event with an error screen.
  const useRemoteData = !isOfflineMode;
  const eventQuery = useEvent(eventId, scope.context, useRemoteData);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context, useRemoteData);
  const participantsQuery = useEventParticipants(eventId ?? "", { pageSize: 500 }, scope.context, useRemoteData);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100, eventId, sortBy: "actual_start", sortDirection: "desc" }, scope.context, useRemoteData);
  const recordsQuery = useAttendanceRecords({ pageSize: 500, eventId }, scope.context, useRemoteData);
  const studentAttendanceRecordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context, useRemoteData);
  const attendanceSummaryQuery = useAttendanceSummaries(eventId ? [eventId] : [], useRemoteData);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context, useRemoteData);
  const participantCredentialIds = [...new Set((participantsQuery.data?.items ?? []).map((participant) => participant.studentId))].sort();
  const credentialStatusesQuery = useStudentCredentialStatuses(scope.context, participantCredentialIds, useRemoteData);
  const catalog = useAcademicCatalog({ pageSize: 200 }, scope.context, useRemoteData);
  const objectivesQuery = useEventObjectives(eventId, scope.context, useRemoteData);
  const resourcesQuery = useEventResources(eventId ?? "", { pageSize: 20 }, scope.context, useRemoteData);
  const predictionsQuery = useMlPredictions({ pageSize: 100, eventId }, scope.context, useRemoteData);
  const mutations = useAttendanceSessionMutations(scope.context);
  const { cancelEventMutation } = useEventMutations(scope.context);
  const auditLogMutations = useAuditLogMutations(scope.context);
  const rescheduleEventMutation = useEventRescheduleMutation(scope.context);
  const offline = useOfflineEvent(eventId);
  const isDesktopRuntimeAvailable = Boolean(desktopApi());
  const [cleanupMessage,setCleanupMessage]=useState("");
  const offlinePackage = isOfflineMode ? offline.preparedEvent : null;
  const selectedEvent = offlinePackage ? offlineEventFromPackage(offlinePackage, scope.organizerId) : eventQuery.data;

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
    let active = true;
    const currentParticipantIds = new Set((participantsQuery.data?.items ?? []).map((participant) => participant.studentId));
    const candidateIds = (studentsQuery.data?.items ?? [])
      .filter((student) => student.status === "enrolled" && !currentParticipantIds.has(student.id))
      .map((student) => student.id);
    if (isOfflineMode || !selectedEvent || !canManageOwnedEvents || !candidateIds.length) {
      setParticipantPickerConflicts({});
      return () => { active = false; };
    }
    void repositories.eventManagement.findEventParticipantScheduleConflicts({
      startsAt: selectedEvent.startsAt,
      endsAt: selectedEvent.endsAt,
      studentIds: candidateIds
    }, scope.context).then((conflicts) => {
      if (!active) return;
      const next = Object.fromEntries(conflicts.map((conflict) => [conflict.studentId, conflict]));
      setParticipantPickerConflicts(next);
      setParticipantPickerSelectedIds((current) => current.filter((studentId) => !next[studentId]));
    }).catch(() => {
      if (active) setParticipantPickerConflicts({});
    });
    return () => { active = false; };
  }, [canManageOwnedEvents, isOfflineMode, participantsQuery.data?.items, scope.context, selectedEvent, studentsQuery.data?.items]);

  useEffect(() => {
    if (isOfflineMode || !selectedEvent || !canManageOwnedEvents || ["completed", "cancelled"].includes(selectedEvent.status)) return;
    const lifecycleAction = new URLSearchParams(location.search).get("lifecycleAction");
    if (lifecycleAction === "reschedule") setIsRescheduleOpen(true);
    if (lifecycleAction === "cancel") setIsCancelOpen(true);
    if (lifecycleAction) navigate(location.pathname, { replace: true });
  }, [canManageOwnedEvents, isOfflineMode, location.pathname, location.search, navigate, selectedEvent]);

  useEffect(() => {
    setIsStartSessionOpen(false);
    setIsOfflinePreparationOpen(false);
    setOfflinePreparationError("");
    setPendingStartedSession(null);
    liveSessionRedirectRef.current = null;
    setIsOpeningLiveSession(false);
    setLiveSessionRedirectError("");
    setSessionModalMode("start");
    setLateCutoffMinutes(15);
  }, [eventId]);

  useEffect(() => {
    const pending = liveSessionRedirectRef.current;
    if (!pending) return undefined;
    const routedSessionId = new URLSearchParams(location.search).get("session");
    const expectedPath = pending.target.split("?", 1)[0];
    if (location.pathname === expectedPath && routedSessionId === pending.sessionId) {
      liveSessionRedirectRef.current = null;
      setIsOpeningLiveSession(false);
      return undefined;
    }
    const retryTimer = window.setTimeout(() => {
      const current = liveSessionRedirectRef.current;
      const currentSessionId = new URLSearchParams(window.location.search).get("session");
      const currentPath = window.location.pathname;
      const currentExpectedPath = current?.target.split("?", 1)[0];
      if (!current || current.fallbackAttempted || (currentPath === currentExpectedPath && currentSessionId === current.sessionId)) return;
      current.fallbackAttempted = true;
      try {
        // BrowserRouter listens for popstate. This same-document fallback is
        // reliable in Electron's plpass:// protocol where a hard assignment
        // can reload the index document without committing the SPA route.
        window.history.replaceState(null, "", current.target);
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        window.location.assign(current.target);
        return;
      }
      window.setTimeout(() => {
        const latest = liveSessionRedirectRef.current;
        const latestSessionId = new URLSearchParams(window.location.search).get("session");
        const latestPath = window.location.pathname;
        const latestExpectedPath = latest?.target.split("?", 1)[0];
        if (!latest || (latestPath === latestExpectedPath && latestSessionId === latest.sessionId)) return;
        liveSessionRedirectRef.current = null;
        setIsOpeningLiveSession(false);
        setLiveSessionRedirectError("Live attendance could not be opened. Please try starting the session again.");
        toast.error("Live attendance could not be opened", { description: "The session was saved on this device. Try opening it again from Events." });
      }, 750);
    }, 250);
    return () => window.clearTimeout(retryTimer);
  }, [isOpeningLiveSession, location.pathname, location.search]);

  function navigateToLiveSession(sessionId: string, options?: { reload?: boolean }) {
    const target = workspaceRoute(APP_ROUTES.organizerLiveSession(sessionId), APP_ROUTES.adminLiveSession(sessionId));
    liveSessionRedirectRef.current = { sessionId, target, fallbackAttempted: false };
    setLiveSessionRedirectError("");
    setIsOpeningLiveSession(true);
    if (options?.reload) {
      // A fully offline Electron start has no server route to resolve. Reload
      // the exact custom-protocol URL so BrowserRouter boots directly into
      // EventManagementPage, which rehydrates the SQLite session reliably.
      const absoluteTarget = new URL(target, window.location.href).toString();
      window.location.replace(absoluteTarget);
      return;
    }
    navigate(target, { replace: true });
  }

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
    // Invitation delivery status is supplied by a live Edge Function. Mock and
    // unit-test workspaces intentionally run without Supabase credentials.
    if (isOfflineMode || import.meta.env.MODE === "test" || !selectedEvent || !eventId || !scope.organizerId) {
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
  }, [eventId, invitationStatusRefreshKey, isOfflineMode, scope.organizerId, selectedEvent]);

  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || (!scope.organizerId && !["admin", "department_admin"].includes(scope.context.actorRole))) {
    return shellState;
  }
  if ((isOfflineMode && offline.isLoading) || (!isOfflineMode && eventQuery.isLoading)) {
    return <LoadingState label="Loading event details" />;
  }
  if ((!offlinePackage && eventQuery.isError) || !selectedEvent) {
    return <ErrorState title="Event unavailable" message="This event was not found or is outside the signed-in organizer scope." />;
  }
  if (!isOfflineMode && (participantsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || catalog.programs.isLoading || objectivesQuery.isLoading || resourcesQuery.isLoading)) {
    return <LoadingState label="Loading event workspace" />;
  }
  const event = selectedEvent;
  const programById = new Map((catalog.programs.data?.items ?? []).map((program) => [program.id, program.code]));
  const participants = offlinePackage ? offlineParticipantsFromPackage(offlinePackage) : participantsQuery.data?.items ?? [];
  const sessions = offlinePackage ? offlineSessionsFromPackage(offlinePackage, scope.organizerId) : sessionsQuery.data?.items ?? [];
  const records = offlinePackage ? offlineRecordsFromPackage(offlinePackage) : recordsQuery.data?.items ?? [];
  const students = offlinePackage ? offlineStudentsFromPackage(offlinePackage) : studentsQuery.data?.items ?? [];
  const objectives = objectivesQuery.data ?? [];
  const resources = resourcesQuery.data?.items ?? [];
  const participantList = participantStudents(participants, students);
  const participantStudentIds = new Set(participantList.map((student) => student.id));
  const participantPrograms = [...new Set(participantList.map((student) => student.programId).filter(Boolean))]
    .map((id) => ({ id, code: programById.get(id) ?? id }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const participantSections = [...new Set(participantList.map((student) => student.section).filter(Boolean))].sort();
  const normalizedParticipantSearch = participantSearch.trim().toLowerCase();
  const filteredParticipantList = participantList.filter((student) => {
    const searchable = [student.fullName, student.formattedName, student.studentNumber, student.email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!normalizedParticipantSearch || searchable.includes(normalizedParticipantSearch))
      && (!participantProgramId || student.programId === participantProgramId)
      && (!participantYearLevel || student.yearLevel === Number(participantYearLevel))
      && (!participantSection || student.section === participantSection);
  });
  const availableStudents = students.filter((student) => !participantStudentIds.has(student.id) && student.status === "enrolled");
  const availablePrograms = [...new Set(availableStudents.map((student) => student.programId).filter(Boolean))]
    .map((id) => ({ id, code: programById.get(id) ?? id }))
    .sort((left, right) => left.code.localeCompare(right.code));
  const availableSections = [...new Set(availableStudents.map((student) => student.section).filter(Boolean))].sort();
  const normalizedPickerSearch = participantPickerSearch.trim().toLowerCase();
  const filteredAvailableStudents = availableStudents.filter((student) => {
    const searchable = [student.fullName, student.formattedName, student.studentNumber, student.email]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!normalizedPickerSearch || searchable.includes(normalizedPickerSearch))
      && (!participantPickerProgramId || student.programId === participantPickerProgramId)
      && (!participantPickerYearLevel || student.yearLevel === Number(participantPickerYearLevel))
      && (!participantPickerSection || student.section === participantPickerSection);
  });
  const eligibleFilteredAvailableStudents = filteredAvailableStudents.filter((student) => !participantPickerConflicts[student.id]);
  const allFilteredAvailableSelected = eligibleFilteredAvailableStudents.length > 0
    && eligibleFilteredAvailableStudents.every((student) => participantPickerSelectedIds.includes(student.id));
  const participantPendingRemovalStudent = participantPendingRemoval
    ? participantList.find((student) => student.id === participantPendingRemoval)
    : undefined;
  const invitationStatusByProfileId = new Map(invitationStatuses.map((status) => [status.recipientProfileId, status]));
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
  const canManageParticipants = !isOfflineMode && canManageOwnedEvents && !hasCompletedSession && event.status !== "completed" && event.status !== "cancelled";
  const canChangeEvent = !isOfflineMode && canManageOwnedEvents && event.status !== "completed" && event.status !== "cancelled";
  const canStartSession = canManageOwnedEvents && event.status !== "completed" && event.status !== "cancelled";
  const earliestRescheduleDate = dateKey(new Date());
  const scheduleConflicts = (eventsQuery.data?.items ?? []).filter((otherEvent) => sharesSchedule(event, otherEvent));
  const counts = attendanceCounts(records);
  const attendanceSummary = eventId ? attendanceSummaryQuery.data?.[eventId] : undefined;
  const attendanceRowByStudentId = new Map((attendanceSummary?.rows ?? []).map((row) => [row.studentId, row]));
  const effectiveAttendanceRate = attendanceSummary?.attendanceRate ?? attendanceRate(records);
  const selectedStudentAttendanceRate = selectedStudent
    ? summarizeFinalizedAttendance(
      (studentAttendanceRecordsQuery.data?.items ?? [])
        .filter((record) => record.studentId === selectedStudent.id)
        .map((record) => ({ identity: record.sessionId, attendanceStatus: record.status, finalizedAt: record.finalizedAt }))
    ).attendanceRate
    : 0;
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
    if (new Date(manilaDateTimeToIso(rescheduleValues.date, rescheduleValues.startTime)).getTime() <= Date.now()) {
      toast.error("Choose a start time later than the current Manila time.");
      return;
    }
    if (participants.length > 50 && !window.confirm(`This reschedule will queue up to ${participants.length} participant notifications. Continue?`)) {
      return;
    }

    try {
      const rescheduledEvent = await rescheduleEventMutation.mutateAsync({ eventId: event.id, ...rescheduleValues });
      await refreshOfflineResourcesAfterChange();
      await eventQuery.refetch();
      setIsRescheduleOpen(false);
      if (rescheduleToStart) {
        setRescheduleToStart(false);
        void openAttendanceStartFlow(rescheduledEvent);
      }
    } catch (error) {
      toast.error(getErrorMessage(error) || "The attendance session could not be started.");
    }
  }

  async function refreshOfflineResourcesAfterChange() {
    const refreshResult = await refreshPreparedEventAfterChange(event.id, scope.context.actorUserId);
    if (refreshResult === "refreshed") {
      toast.info("The event changed, so its offline resources were updated on this device.");
    } else if (refreshResult === "blocked") {
      toast.warning("The event changed, but offline resources were kept safe because this event has attendance waiting to sync.");
    } else if (refreshResult === "failed") {
      toast.warning("The event changed, but offline resources could not be refreshed. Download them again before the next offline session.");
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

  async function getStartableLocalSession(eventToStart: Event = event, expectedSessionId?: string) {
    const ownerId = session?.userId;
    const api = desktopApi();
    if (!ownerId || !api) return null;
    const localPackage = await api.getPreparedEvent(eventToStart.id, ownerId);
    const localSession = localPackage?.sessions.find((item) => expectedSessionId
      ? item.id === expectedSessionId
      : item.status === "scheduled" && (item.offlineLifecycle ?? "NOT_STARTED") === "NOT_STARTED"
    );
    return localPackage && localSession ? { api, ownerId, localPackage, localSession } : null;
  }

  async function openAttendanceStartFlow(eventToStart: Event = event) {
    if (activeSession) {
      setSessionModalMode("existing");
      setIsStartSessionOpen(true);
      return;
    }
    if (dateKey(eventToStart.startsAt) !== dateKey(new Date())) {
      setRescheduleValues({
        venue: eventToStart.venue,
        date: dateKey(new Date()),
        startTime: timeInputValue(eventToStart.startsAt),
        endTime: timeInputValue(eventToStart.endsAt),
        reason: "Reschedule event to today to start attendance."
      });
      setRescheduleToStart(true);
      setIsRescheduleOpen(true);
      return;
    }
    if (!desktopApi()) {
      setOfflinePreparationError("Attendance resources must be downloaded in the PLPass desktop app before starting this session.");
      setIsOfflinePreparationOpen(true);
      return;
    }
    try {
      if (await getStartableLocalSession(eventToStart)) {
        setSessionModalMode("start");
        setIsStartSessionOpen(true);
        return;
      }
      setOfflinePreparationError("");
      setIsOfflinePreparationOpen(true);
    } catch (error) {
      setOfflinePreparationError(getErrorMessage(error) || "The offline resources could not be checked.");
      setIsOfflinePreparationOpen(true);
    }
  }

  async function downloadOfflineResourcesAndContinue() {
    setIsDownloadingOfflineResources(true);
    setOfflinePreparationError("");
    try {
      if (!desktopApi()) throw new Error("Open this event in the PLPass desktop app to download its offline resources.");
      if (!(await confirmSupabaseConnectivity())) throw new Error("Connect to Wi-Fi to download the offline resources before starting attendance.");
      await offline.prepare();
      if (pendingStartedSession) {
        const localSession = await getStartableLocalSession(event, pendingStartedSession.id);
        if (!localSession) throw new Error("The refreshed package does not contain the active attendance session. Try downloading again.");
        await localSession.api.confirmOnlineStartedSession(
          event.id,
          pendingStartedSession.id,
          localSession.ownerId,
          pendingStartedSession.startedAt,
          pendingStartedSession.lateCutoffAt,
        );
        setPendingStartedSession(null);
        setIsOfflinePreparationOpen(false);
        toast.success("Attendance session started.");
        navigateToLiveSession(pendingStartedSession.id);
        return;
      }
      if (!(await getStartableLocalSession())) {
        throw new Error("The offline package was downloaded, but it does not contain a ready attendance session. Refresh the event and try again.");
      }
      setIsOfflinePreparationOpen(false);
      setSessionModalMode("start");
      setIsStartSessionOpen(true);
    } catch (error) {
      setOfflinePreparationError(getErrorMessage(error) || "Offline resources could not be downloaded.");
    } finally {
      setIsDownloadingOfflineResources(false);
    }
  }

  async function startAttendanceSession() {
    if (dateKey(event.startsAt) !== dateKey(new Date())) {
      toast.error("This event can only start on its scheduled Manila date. Reschedule it to today first.");
      setIsStartSessionOpen(false);
      setRescheduleValues({
        venue: event.venue,
        date: dateKey(new Date()),
        startTime: timeInputValue(event.startsAt),
        endTime: timeInputValue(event.endsAt),
        reason: "Reschedule event to today to start attendance."
      });
      setRescheduleToStart(true);
      setIsRescheduleOpen(true);
      return;
    }
    setIsStartingSession(true);
    let createdSession: { id: string; startsAt: string; attendanceWindowStartAt?: string; lateCutoffAt?: string } | null = null;
    try {
      // A verified package is the local authority while disconnected. Keep
      // the online Supabase start path unchanged for stable connectivity.
      const shouldStartOffline = isOfflineMode || !navigator.onLine;
      if (shouldStartOffline) {
        const localSession = await getStartableLocalSession();
        if (!localSession) {
          throw new Error("This event has no verified prepared local package. Reconnect and download the offline resources first.");
        }
        await startOfflineEvent(event.id, localSession.localSession.id, localSession.ownerId);
        setIsStartSessionOpen(false);
        toast.success("Attendance session started on this device. It will synchronize after reconnecting.");
        navigateToLiveSession(localSession.localSession.id, { reload: true });
        return;
      }
      const created = await mutations.createEventSessionMutation.mutateAsync({
        eventId: event.id,
        venue: event.venue,
        date: dateKey(event.startsAt),
        startTime: timeInputValue(event.startsAt),
        expectedEndTime: timeInputValue(event.endsAt),
        attendanceMode: "face-to-face",
        lateCutoffMinutes
      });
      createdSession = created;
      const startedAt = created.attendanceWindowStartAt ?? created.startsAt;
      const localSession = await getStartableLocalSession();
      if (!localSession) {
        throw new Error("The prepared attendance package is no longer available on this device.");
      }
      await localSession.api.confirmOnlineStartedSession(
        event.id,
        created.id,
        localSession.ownerId,
        startedAt,
        created.lateCutoffAt,
      );
      setIsStartSessionOpen(false);
      toast.success("Attendance session started.");
      navigateToLiveSession(created.id);
    } catch (error) {
      const message = getErrorMessage(error) || "The attendance session could not be started.";
      if (createdSession) {
        setPendingStartedSession({
          id: createdSession.id,
          startedAt: createdSession.attendanceWindowStartAt ?? createdSession.startsAt,
          lateCutoffAt: createdSession.lateCutoffAt,
        });
        setIsStartSessionOpen(false);
        setOfflinePreparationError(`Attendance started on the server, but this device could not verify its offline package. ${message}`);
        setIsOfflinePreparationOpen(true);
      } else {
        const transportFailure = error instanceof TypeError || /failed to fetch|network|offline|timeout|connection/i.test(message);
        if (transportFailure) {
          try {
            const refreshed = await sessionsQuery.refetch();
            const recovered = refreshed.data?.items.find((candidate) => candidate.eventId === event.id && candidate.status === "active");
            if (recovered) {
              const localSession = await getStartableLocalSession(event, recovered.id);
              if (!localSession) throw new Error("The server started attendance, but the prepared package is unavailable on this device.");
              await localSession.api.confirmOnlineStartedSession(
                event.id,
                recovered.id,
                localSession.ownerId,
                recovered.attendanceWindowStartAt ?? recovered.startsAt,
                recovered.lateCutoffAt,
              );
              setIsStartSessionOpen(false);
              toast.success("Attendance session started.");
              navigateToLiveSession(recovered.id);
              return;
            }
          } catch (recoveryError) {
            toast.error(getErrorMessage(recoveryError) || message);
            return;
          }
        }
        toast.error(message);
      }
    } finally {
      setIsStartingSession(false);
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
      await uploadEventFileResource(eventId, resourceFileTitle, file);
      await resourcesQuery.refetch();
      void auditLogMutations.logActionMutation.mutateAsync({ action: "Added Event Resource", targetType: "event_resource", targetId: eventId, metadata: { title: resourceFileTitle.trim() || file.name, type: "file" } });
      setResourceFileTitle("");
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
      await downloadEventResource(resource);
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
      await repositories.eventManagement.addEventParticipants({ eventId: event.id, studentIds: [student.id] }, scope.context);

      await participantsQuery.refetch();
      await refreshOfflineResourcesAfterChange();
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

  async function addSelectedParticipants() {
    if (!participantPickerSelectedIds.length) return;
    if (participantPickerSelectedIds.length > 50 && !window.confirm(`This will queue ${participantPickerSelectedIds.length} participant invitation emails. Continue?`)) {
      return;
    }
    setIsUpdatingParticipants(true);
    try {
      await repositories.eventManagement.addEventParticipants({ eventId: event.id, studentIds: participantPickerSelectedIds }, scope.context);

      const addedCount = participantPickerSelectedIds.length;
      await participantsQuery.refetch();
      await refreshOfflineResourcesAfterChange();
      setParticipantPickerSelectedIds([]);
      setIsParticipantPickerOpen(false);
      setInvitationStatusRefreshKey((current) => current + 1);
      toast.success(`${addedCount} participant${addedCount === 1 ? "" : "s"} added. Invitation emails are queued for delivery.`);
    } catch (error) {
      console.error("Failed to add selected participants:", error);
      toast.error("Could not add the selected participants. Please try again.");
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
      await refreshOfflineResourcesAfterChange();
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
        if (credentialStatusesQuery.isError) return <StatusBadge label="Unavailable" tone="muted" />;
        const credential = credentialStatusByStudentId.get(row.original.id)?.qrCredential;
        const ready = credential?.status === "activated" && !credential.revokedAt && (!credential.expiresAt || new Date(credential.expiresAt).getTime() > now);
        return <StatusBadge label={ready ? "Ready" : "Needs QR"} tone={ready ? "success" : "warning"} />;
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
      id: "attendance",
      header: "Attendance",
      cell: ({ row }) => {
        const attendance = attendanceRowByStudentId.get(row.original.id);
        if (!attendance) return <span className="text-sm text-muted-foreground">—</span>;
        const attendanceStatus = attendance.attendanceStatus;
        return <StatusBadge label={attendanceStatus} tone={statusTone(attendanceStatus)} />;
      }
    },
    {
      id: "action",
      header: "Actions",
      meta: { agGrid: { width: 240, minWidth: 240, maxWidth: 240, flex: 0, resizable: false, sortable: false, filter: false } },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedStudent(row.original)}>View details</Button>
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
    { id: "action", header: "View session", cell: ({ row }) => <Button asChild variant="outline" size="sm"><NavLink to={workspaceRoute(APP_ROUTES.organizerLiveSession(row.original.id), APP_ROUTES.adminLiveSession(row.original.id))}>View session</NavLink></Button> }
  ];
  return (
    <OrganizerFrame>
      <PageHeader
        eyebrow={
          isOfflineMode ? (
            <a
              href={APP_ROUTES.organizerEvents}
              className="inline-flex items-center gap-1 normal-case text-sm font-medium tracking-normal text-primary transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to events
            </a>
          ) : (
            <NavLink
              to={workspaceRoute(APP_ROUTES.organizerEvents, APP_ROUTES.adminEvents)}
              className="inline-flex items-center gap-1 normal-case text-sm font-medium tracking-normal text-primary transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to events
            </NavLink>
          )
        }
        title={formatEventTitle(event.title)}
        description={isAdmin ? "View event details, owner, schedule, attendance summary, and audit context." : "Manage this event, prepare attendance, and review participation."}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {liveSessionRedirectError ? <p className="basis-full text-right text-sm text-destructive" role="alert">{liveSessionRedirectError}</p> : null}
            {canStartSession ? (
            <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={isStartingSession || isDownloadingOfflineResources || isOpeningLiveSession} onClick={() => void openAttendanceStartFlow()}>
              <Play className="h-4 w-4" aria-hidden="true" />
              {isOpeningLiveSession ? "Opening live attendance…" : "Start session"}
            </Button>
            {canChangeEvent ? <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1 rounded-md border border-input bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                More actions
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border bg-surface p-1 shadow-lg">
                <button type="button" className="w-full rounded-sm px-3 py-2 text-left text-sm font-medium hover:bg-muted" onClick={() => setIsRescheduleOpen(true)}>Reschedule event</button>
                <button type="button" className="w-full rounded-sm px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive/10" onClick={() => setIsCancelOpen(true)}>Cancel event</button>
              </div>
            </details> : null}
            </div>
            ) : canManageOwnedEvents && event.status === "cancelled" ? (
            <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => setIsRescheduleOpen(true)}>
              Reschedule event
            </Button>
            </div>
            ) : null}
          </div>
        }
      />

      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-surface to-surface p-5 shadow-sm md:p-6" aria-label="Event at a glance">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-primary">{event.code}</span>
              <StatusBadge label={event.status} tone={statusTone(event.status)} />
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">{isAdmin ? "Event operational overview" : "Ready to manage your event"}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{isAdmin ? "Review ownership, schedule, participation, attendance status, and audit context for this event." : "Use the controls below to prepare attendees, share resources, and start attendance when the event begins."}</p>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 lg:min-w-[34rem]">
            <div className="rounded-xl border border-primary/10 bg-surface/80 p-3">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />Date</dt>
              <dd className="mt-2 font-semibold text-foreground">{formatDate(event.startsAt)}</dd>
            </div>
            <div className="rounded-xl border border-primary/10 bg-surface/80 p-3">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />Time</dt>
              <dd className="mt-2 font-semibold text-foreground">{formatTime(event.startsAt)} – {formatTime(event.endsAt)}</dd>
            </div>
            <div className="rounded-xl border border-primary/10 bg-surface/80 p-3">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><MapPin className="h-4 w-4 text-primary" aria-hidden="true" />Venue</dt>
              <dd className="mt-2 truncate font-semibold text-foreground" title={event.venue}>{event.venue}</dd>
            </div>
          </dl>
        </div>
      </section>

      {canManageOwnedEvents ? <>
        <OfflineStatusPanel status={offline.status} busy={offline.busy} onPrepare={()=>void offline.prepare().then(()=>toast.success("Event is ready for offline use.")).catch((error)=>toast.error(getErrorMessage(error) || "Offline preparation failed."))} onRetry={()=>void offline.sync(true)} />
        {offline.status.runtimeAvailable&&offline.status.packageStatus==="READY"?<section className="rounded-lg border bg-surface p-4" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">Post-event local cleanup</p><p className="text-sm text-muted-foreground">Completed packages are removed automatically after server confirmation and a 24-hour safety period.</p>{cleanupMessage?<p className="mt-2 text-sm">{cleanupMessage}</p>:null}</div><Button type="button" variant="outline" disabled={offline.busy} onClick={()=>void (async()=>{const cleaned=await cleanupExpiredReconciledEvents(scope.context.actorUserId);setCleanupMessage(cleaned?"Cleanup completed. Temporary event cache data were removed.":"Cleanup is not ready yet. PLPass will keep this package until reconciliation and the 24-hour safety period are complete.");if(cleaned)await offline.refresh();})()}>Check cleanup status</Button></div></section>:null}
      </> : null}
      
      {/* Event Overview Stats */}
      <section aria-labelledby="event-summary-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="event-summary-heading" className="text-base font-semibold text-foreground">Event summary</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">A quick view of attendance readiness and participation.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total participants" value={String(participants.length)} icon={Users} className="rounded-xl" />
          <StatCard title="Completed sessions" value={String(sessions.filter((session) => session.status === "completed").length)} icon={CalendarCheck} className="rounded-xl" />
          <StatCard title="Average participation" value={hasCompletedSession ? `${effectiveAttendanceRate}%` : "N/A"} icon={BarChart3} className="rounded-xl" />
          <StatCard title="Flagged participants" value={String(flagged.length)} icon={AlertTriangle} tone={flagged.length ? "warning" : "success"} className="rounded-xl" />
        </div>
      </section>

      {/* Event Details Card */}
      <section className="rounded-xl border bg-surface p-5 shadow-sm md:p-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-foreground">Event information</h3>
            <p className="mt-1 text-sm text-muted-foreground">The details participants will use to identify this event.</p>
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
            <h3 className="text-base font-semibold text-foreground">Schedule</h3>
            <p className="mt-1 text-sm text-muted-foreground">The planned time and expected attendance size.</p>
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
                      <NavLink to={workspaceRoute(APP_ROUTES.organizerEvent(conflict.id), APP_ROUTES.adminEvent(conflict.id))}>Review event</NavLink>
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

      <section className="rounded-xl border border-primary/15 bg-surface p-5 shadow-sm">
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
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a resource</p><p className="mt-1 text-xs text-muted-foreground">Choose the resource type first, then complete only the fields in that section.</p></div>
          {canChangeEvent ? <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <section className="flex min-h-52 flex-col rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-md bg-primary/5 text-primary"><Link2 className="h-4 w-4" aria-hidden="true" /></span><div><h4 className="text-sm font-semibold text-foreground">Add link</h4><p className="text-xs text-muted-foreground">Share a secure web resource.</p></div></div>
              <div className="mt-4 grid gap-3"><label className="grid gap-1.5 text-sm font-medium text-foreground">Link title<input className="plpass-field h-10 rounded-md border bg-background px-3 text-sm font-normal" value={resourceTitle} onChange={(inputEvent) => setResourceTitle(inputEvent.target.value)} placeholder="e.g. Workshop slides" aria-label="Link title" /></label><label className="grid gap-1.5 text-sm font-medium text-foreground">HTTPS link<input className="plpass-field h-10 rounded-md border bg-background px-3 text-sm font-normal" value={resourceUrl} onChange={(inputEvent) => setResourceUrl(inputEvent.target.value)} placeholder="https://..." aria-label="HTTPS link" /></label></div>
              <Button type="button" variant="outline" size="sm" className="mt-auto w-full" onClick={() => void addResourceLink()} disabled={isSavingResource || resources.length >= MAX_EVENT_RESOURCES}><Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Add link</Button>
            </section>
            <section className="flex min-h-52 flex-col rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-md bg-primary/5 text-primary"><FileUp className="h-4 w-4" aria-hidden="true" /></span><div><h4 className="text-sm font-semibold text-foreground">Attach file</h4><p className="text-xs text-muted-foreground">Upload a file up to 25 MB.</p></div></div>
              <label className="mt-4 grid gap-1.5 text-sm font-medium text-foreground">File title <span className="font-normal text-muted-foreground">(optional)</span><input className="plpass-field h-10 rounded-md border bg-background px-3 text-sm font-normal" value={resourceFileTitle} onChange={(inputEvent) => setResourceFileTitle(inputEvent.target.value)} placeholder="e.g. Event programme" aria-label="File title" /></label>
              <p className="mt-2 text-xs text-muted-foreground">If blank, the uploaded filename is used.</p>
              <Button type="button" variant="outline" size="sm" className="mt-auto w-full" onClick={() => resourceFileInputRef.current?.click()} disabled={isSavingResource || resources.length >= MAX_EVENT_RESOURCES}><FileUp className="mr-1.5 h-4 w-4" aria-hidden="true" />Choose file</Button>
            </section>
          </div> : <p className="mt-4 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">Administrators can view event resources but cannot modify them from the event workspace.</p>}
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
                    {canChangeEvent ? <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setResourcePendingRemoval(resource)}>Remove</Button> : null}
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
          {hasCompletedSession && (
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
                <div>
                  <h3 className="font-semibold text-foreground">Participant management</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{event.targetGroup ?? "Selected participants"} · {filteredParticipantList.length} of {participantList.length} shown</p>
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
                    <Button type="button" variant="outline" onClick={() => { setParticipantPickerSelectedIds([]); setIsParticipantPickerOpen(true); }}>
                      Browse students
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
              <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="sm:col-span-2 xl:col-span-1">
                  <span className="sr-only">Search participants</span>
                  <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={participantSearch} onChange={(inputEvent) => setParticipantSearch(inputEvent.target.value)} placeholder="Search name or student number" />
                </label>
                <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={participantProgramId} onChange={(inputEvent) => setParticipantProgramId(inputEvent.target.value)} aria-label="Filter participants by program">
                  <option value="">All programs</option>
                  {participantPrograms.map((program) => <option key={program.id} value={program.id}>{program.code}</option>)}
                </select>
                <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={participantYearLevel} onChange={(inputEvent) => setParticipantYearLevel(inputEvent.target.value)} aria-label="Filter participants by year level">
                  <option value="">All year levels</option>
                  {[1, 2, 3, 4].map((level) => <option key={level} value={String(level)}>Year {level}</option>)}
                </select>
                <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={participantSection} onChange={(inputEvent) => setParticipantSection(inputEvent.target.value)} aria-label="Filter participants by section">
                  <option value="">All sections</option>
                  {participantSections.map((sectionName) => <option key={sectionName} value={sectionName}>Section {sectionName}</option>)}
                </select>
                {(participantSearch || participantProgramId || participantYearLevel || participantSection) ? <Button type="button" variant="ghost" size="sm" className="justify-self-start text-muted-foreground hover:text-foreground sm:col-span-2 xl:col-span-4" onClick={() => { setParticipantSearch(""); setParticipantProgramId(""); setParticipantYearLevel(""); setParticipantSection(""); }}>Clear participant filters</Button> : null}
              </div>
              <PLPassDataGrid
                label="Event participants"
                data={filteredParticipantList}
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
          {tab === "summary" ? <SessionSummaryCards present={attendanceSummary?.present ?? counts.present} late={attendanceSummary?.late ?? counts.late} absent={attendanceSummary?.absent ?? counts.absent} total={attendanceSummary?.attendancePopulation ?? participants.length} walkIns={attendanceSummary?.walkIns} /> : null}
        </div>
      </section>

      <ModalShell
        open={isOfflinePreparationOpen}
        title={pendingStartedSession ? "Repair attendance resources" : isDesktopRuntimeAvailable ? "Download attendance resources first" : "Start attendance in PLPass desktop"}
        description={pendingStartedSession
          ? "The server session has started. Repair and verify this device's local attendance package before opening live attendance."
          : isDesktopRuntimeAvailable
          ? "Download this event's roster and scheduled attendance session before starting."
          : "Attendance resources are downloaded and verified in the PLPass desktop app before a session can start."}
        size="sm"
        onClose={isDownloadingOfflineResources || pendingStartedSession ? undefined : () => { setIsOfflinePreparationOpen(false); setOfflinePreparationError(""); }}
        footer={isDesktopRuntimeAvailable ? <>
          {!pendingStartedSession ? <Button type="button" variant="outline" disabled={isDownloadingOfflineResources} onClick={() => { setIsOfflinePreparationOpen(false); setOfflinePreparationError(""); }}>Cancel</Button> : null}
          <Button type="button" disabled={isDownloadingOfflineResources} onClick={() => void downloadOfflineResourcesAndContinue()}>{isDownloadingOfflineResources ? "Downloading offline resources..." : pendingStartedSession ? "Repair & continue" : "Download & continue"}</Button>
        </> : <Button type="button" onClick={() => { setIsOfflinePreparationOpen(false); setOfflinePreparationError(""); }}>Close</Button>}
      >
        <div className="space-y-3" aria-live="polite">
          {isDesktopRuntimeAvailable ? <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">The download includes the approved student roster, QR/manual lookup data, and the scheduled attendance session. It does not start attendance yet.</div> : null}
          {isDownloadingOfflineResources ? <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm font-medium text-primary">Downloading and verifying the offline event package…</div> : null}
          {offlinePreparationError ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{offlinePreparationError}</p> : null}
        </div>
      </ModalShell>

      <ModalShell
        open={isStartSessionOpen}
        title={existingSessionForDialog ? "Live session already started" : "Start attendance"}
        description={existingSessionForDialog ? "Continue this event's attendance, or discard it if it was started by mistake." : "Attendance starts now. The planned schedule stays unchanged."}
        size="sm"
        onClose={() => !isStartingSession && setIsStartSessionOpen(false)}
        footer={existingSessionForDialog ? <>{activeSessionRecordCount === 0 ? <Button type="button" variant="outline" className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setIsDiscardSessionOpen(true)}>Discard session</Button> : null}<Button asChild type="button"><NavLink to={workspaceRoute(APP_ROUTES.organizerLiveSession(existingSessionForDialog.id), APP_ROUTES.adminLiveSession(existingSessionForDialog.id))}>Open live session</NavLink></Button></> : <><Button type="button" variant="outline" onClick={() => setIsStartSessionOpen(false)} disabled={isStartingSession}>Cancel</Button><Button type="button" onClick={() => void startAttendanceSession()} disabled={isStartingSession || mutations.createEventSessionMutation.isPending}>{isStartingSession || mutations.createEventSessionMutation.isPending ? "Starting..." : "Start session"}</Button></>}
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

      <ModalShell
        open={isParticipantPickerOpen}
        title="Browse students to add"
        description="Filter the enrolled student list, select one or more students, then add them to this event."
        size="xl"
        onClose={() => !isUpdatingParticipants && setIsParticipantPickerOpen(false)}
        footer={<><Button type="button" variant="outline" onClick={() => setIsParticipantPickerOpen(false)} disabled={isUpdatingParticipants}>Cancel</Button><Button type="button" onClick={() => void addSelectedParticipants()} disabled={!participantPickerSelectedIds.length || isUpdatingParticipants}>{isUpdatingParticipants ? "Adding…" : `Add ${participantPickerSelectedIds.length || "selected"} student${participantPickerSelectedIds.length === 1 ? "" : "s"}`}</Button></>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="sm:col-span-2 lg:col-span-1">
              <span className="sr-only">Search students</span>
              <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={participantPickerSearch} onChange={(inputEvent) => setParticipantPickerSearch(inputEvent.target.value)} placeholder="Search name or student number" />
            </label>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={participantPickerProgramId} onChange={(inputEvent) => setParticipantPickerProgramId(inputEvent.target.value)} aria-label="Filter available students by program">
              <option value="">All programs</option>
              {availablePrograms.map((program) => <option key={program.id} value={program.id}>{program.code}</option>)}
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={participantPickerYearLevel} onChange={(inputEvent) => setParticipantPickerYearLevel(inputEvent.target.value)} aria-label="Filter available students by year level">
              <option value="">All year levels</option>
              {[1, 2, 3, 4].map((level) => <option key={level} value={String(level)}>Year {level}</option>)}
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={participantPickerSection} onChange={(inputEvent) => setParticipantPickerSection(inputEvent.target.value)} aria-label="Filter available students by section">
              <option value="">All sections</option>
              {availableSections.map((sectionName) => <option key={sectionName} value={sectionName}>Section {sectionName}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{eligibleFilteredAvailableStudents.length} eligible student{eligibleFilteredAvailableStudents.length === 1 ? "" : "s"} available{filteredAvailableStudents.length !== eligibleFilteredAvailableStudents.length ? ` · ${filteredAvailableStudents.length - eligibleFilteredAvailableStudents.length} unavailable` : ""} · {participantPickerSelectedIds.length} selected</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setParticipantPickerSelectedIds(allFilteredAvailableSelected ? [] : [...new Set([...participantPickerSelectedIds, ...eligibleFilteredAvailableStudents.map((student) => student.id)])])} disabled={!eligibleFilteredAvailableStudents.length}>
              {allFilteredAvailableSelected ? "Clear visible selection" : "Select all visible"}
            </Button>
          </div>
          {filteredAvailableStudents.length ? (
            <div className="max-h-[52vh] overflow-auto rounded-xl border">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b bg-muted/90 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr><th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th><th className="px-3 py-3">Student</th><th className="px-3 py-3">Student number</th><th className="px-3 py-3">Program</th><th className="px-3 py-3">Year</th><th className="px-3 py-3">Section</th></tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAvailableStudents.map((student) => {
                    const selected = participantPickerSelectedIds.includes(student.id);
                    const conflict = participantPickerConflicts[student.id];
                    return <tr key={student.id} className={conflict ? "bg-muted/30 opacity-70" : selected ? "bg-primary/5" : "hover:bg-muted/30"}>
                      <td className="px-4 py-3"><input type="checkbox" checked={selected} disabled={Boolean(conflict)} onChange={() => setParticipantPickerSelectedIds((current) => selected ? current.filter((id) => id !== student.id) : [...current, student.id])} aria-label={`Select ${studentName(student)}`} className="h-5 w-5 accent-primary disabled:cursor-not-allowed disabled:opacity-50" /></td>
                      <th scope="row" className="px-3 py-3 font-medium text-foreground">{studentName(student)}{conflict ? <span className="ml-2 text-xs font-normal text-danger">Unavailable: already invited to {conflict.eventCode}</span> : null}</th>
                      <td className="px-3 py-3 text-muted-foreground">{student.studentNumber}</td>
                      <td className="px-3 py-3 text-muted-foreground">{programById.get(student.programId) ?? student.programId}</td>
                      <td className="px-3 py-3 text-muted-foreground">Year {student.yearLevel}</td>
                      <td className="px-3 py-3 text-muted-foreground">{student.section || "—"}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No enrolled students match these filters.</div>}
        </div>
      </ModalShell>

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
                <span className="font-semibold text-foreground">{studentAttendanceRecordsQuery.isLoading ? "Loading…" : `${selectedStudentAttendanceRate}%`}</span>
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
        description={rescheduleToStart ? "This event can only be started on its scheduled Manila date. Reschedule it to today to continue, or cancel to leave it unchanged." : "Update the schedule and let participants know why it changed."}
        size="md"
        onClose={() => !rescheduleEventMutation.isPending && (setIsRescheduleOpen(false), setRescheduleToStart(false))}
        footer={<><Button type="button" variant="outline" onClick={() => { setIsRescheduleOpen(false); setRescheduleToStart(false); }} disabled={rescheduleEventMutation.isPending}>Cancel</Button><Button type="button" onClick={() => void rescheduleEvent()} disabled={rescheduleEventMutation.isPending}>{rescheduleEventMutation.isPending ? "Saving..." : rescheduleToStart ? "Reschedule to today" : "Save new schedule"}</Button></>}
      >
        <form id="reschedule-event-form" className="space-y-4" onSubmit={(submitEvent) => { submitEvent.preventDefault(); void rescheduleEvent(); }}>
          {rescheduleToStart ? <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Choose a start time later than the current Manila time and an end time after it. After saving, you must still confirm Start session.</p> : null}
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
