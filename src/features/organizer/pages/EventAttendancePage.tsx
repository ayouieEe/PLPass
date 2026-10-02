/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, CalendarCheck, ClipboardList, Plus, Search, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { getErrorMessage } from "@/lib/utils/errors";
import { useHeader } from "@/app/providers/HeaderContext";
import { queryClient } from "@/app/providers/queryClient";
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
import { SearchInput } from "@/components/shared/SearchInput";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import { useWalkInWarning } from "@/features/attendance/walkInWarning";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { summarizeUniqueAttendance } from "@/features/organizer/utils/attendanceSummary";
import { extractMirroredFaceDescriptor, faceSimilarity } from "@/lib/biometrics/humanFace";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { withRequestTimeout } from "@/lib/async/requestTimeout";
import { isPageVisible, onPageVisibilityChange } from "@/lib/browser/visibilityControls";
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
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useStudents
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { OfflineStatusPanel } from "@/features/offline/OfflineStatusPanel";
import { useOfflineEvent } from "@/features/offline/useOfflineEvent";
import { desktopApi, endOfflineEvent, identifyOfflineStudent, recordOfflineAttendance } from "@/features/offline/offlineService";
import { extractSchoolStudentNumber } from "@/lib/credentials/qrCredential";
import type { AttendanceCapturePhase, PendingWalkInScan } from "@/features/offline/types";
import { readAttendancePhase, writeAttendancePhase } from "@/features/organizer/attendancePhaseStorage";
import { coordinateAttendancePhase, resolveForwardOnlyAttendancePhase } from "@/features/organizer/attendancePhaseAuthority";
import { advanceServerAttendanceCapturePhase, getServerAttendanceCapturePhase } from "@/features/organizer/attendancePhaseRepository";
import { resolveRecordedOrganizerAttendanceStatus, useAttendanceSummaries } from "@/features/organizer/hooks/useEventAttendance";
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

function isConnectivityFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return !navigator.onLine || /(?:failed to fetch|network|offline|timeout|connection)/i.test(message);
}
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

const LATE_REASON_OPTIONS = [
  "Traffic / Commute",
  "Class or Academic Conflict",
  "Personal / Health",
  "Weather / Force Majeure",
  "Other"
] as const;

type LateReason = (typeof LATE_REASON_OPTIONS)[number];

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
  const isAdmin = session?.role === "admin";
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" },
    organizerId: organizerQuery.data?.items[0]?.id ?? (isAdmin ? "admin-global" : undefined),
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: !isAdmin && organizerQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return formatDisplayDate(value, "Not scheduled");
}

function formatTime(value: string | undefined) {
  return formatDisplayTime(value, "Not set");
}

async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    throw new Error("Camera is still preparing. Keep one face centered and try again.");
  }
  const maximumWidth = 720;
  const scale = Math.min(1, maximumWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("The camera frame could not be captured.");
  return blob;
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
  const summary = summarizeUniqueAttendance(records.map((record) => ({ identity: record.studentId, attendanceStatus: record.status })), 0);
  return {
    present: summary.present,
    late: summary.late,
    absent: summary.absent
  };
}

function attendanceRate(records: AttendanceRecord[]) {
  return summarizeUniqueAttendance(records.map((record) => ({ identity: record.studentId, attendanceStatus: record.status })), 0).attendanceRate;
}

function eventLabel(event: Event | undefined) {
  return event ? `${event.code} - ${event.title}` : "Unknown event";
}

function studentName(student: Student | undefined) {
  if (!student) return "Unknown student";
  const profileName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
  return student.formattedName || student.fullName || profileName || student.studentNumber;
}

function ShellState({ scope }: { scope: OrganizerScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading organizer workspace" />;
  }
  if (scope.isError || (!scope.organizerId && scope.context.actorRole !== "admin")) {
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

type LiveRecordDisplayOverride = {
  studentName: string;
  identifier: string;
};

function buildLiveRecords(
  records: AttendanceRecord[],
  students: Student[],
  displayOverrides = new Map<string, LiveRecordDisplayOverride>()
): LiveAttendanceRecord[] {
  return records.map((record) => ({
    id: record.id,
    studentName: displayOverrides.get(record.id)?.studentName ?? studentName(students.find((student) => student.id === record.studentId)),
    identifier: displayOverrides.get(record.id)?.identifier ?? students.find((student) => student.id === record.studentId)?.studentNumber ?? record.studentId,
    status: record.status,
    timestamp: record.recordedAt,
    timeIn: record.timeIn ?? record.recordedAt,
    timeOut: record.checkedOutAt
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
          <NavLink to={APP_ROUTES.organizerLiveSession(session.id)}>View session</NavLink>
        </Button>
      </div>
    </article>
  );

}

export function EventAttendancePage() {
  const { sessionId } = useParams();
  const scope = useOrganizerScope();
  const { session:authSession } = useDevelopmentSession();
  const navigate = useNavigate();
  const { setHeaderOverride } = useHeader();
  const sessionQuery = useAttendanceSession(sessionId, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500, sessionId }, scope.context);
  const organizerSummaryQuery = useAttendanceSummaries(sessionQuery.data?.eventId ? [sessionQuery.data.eventId] : []);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const participantQuery = useEventParticipants(sessionQuery.data?.eventId ?? "", { pageSize: 500 }, scope.context);
  const tapsQuery = useNfcTapAttempts({ pageSize: 500 }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const attendanceMutations = useAttendanceSubmissionMutations(scope.context);
  const offline = useOfflineEvent(sessionQuery.data?.eventId, sessionId);
  const [latestResult, setLatestResult] = useState<AttendanceSubmissionResult | null>(null);
  const [offlineCapturePhase,setOfflineCapturePhase]=useState<AttendanceCapturePhase>("time_in");
  const [manualStudentId, setManualStudentId] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualRemarks, setManualRemarks] = useState("");
  const [manualStatus, setManualStatus] = useState<"present" | "late">("present");
  const [manualLateReason, setManualLateReason] = useState<LateReason | "">("");
  // remove allowManualJoin checkbox — manual tab provides manual input
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [endOpen, setEndOpen] = useState(false);
  const [endReason, setEndReason] = useState("");
  const [facialCameraOpen, setFacialCameraOpen] = useState(false);
  const [facialActionMode, setFacialActionMode] = useState<"check_in" | "check_out">("check_in");
  const [facialStatus, setFacialStatus] = useState("");
  const [facialVerifying, setFacialVerifying] = useState(false);
  const [offlineContinuityWarningShown, setOfflineContinuityWarningShown] = useState(false);
  const walkInWarning = useWalkInWarning();
  const facialVideoRef = useRef<HTMLVideoElement | null>(null);
  const facialStreamRef = useRef<MediaStream | null>(null);
  const endingSessionRef = useRef(false);

  const selectedSession = sessionQuery.data;
  const selectedEvent = eventsQuery.data?.items.find((item) => item.id === selectedSession?.eventId);

  async function cacheOnlineAttendanceForOffline(input: {
    studentId: string;
    studentNumber?: string;
    displayName?: string;
    participantStatus?: "invited" | "confirmed" | "walk_in";
    attendanceStatus: "present" | "late";
    timeIn: string;
    timeOut?: string | null;
  }) {
    const api = desktopApi();
    if (!api || !authSession?.userId || !selectedEvent?.id || !sessionId) return;
    try {
      await api.cacheOnlineAttendance({
        eventId: selectedEvent.id,
        sessionId,
        organizerProfileId: authSession.userId,
        ...input,
      });
    } catch {
      // Online Supabase attendance remains authoritative if this package is
      // unavailable; the cache is only a continuity aid for Wi-Fi loss.
      if (!offlineContinuityWarningShown) {
        setOfflineContinuityWarningShown(true);
        toast.warning("Online attendance was recorded, but offline continuity is unavailable for this session.");
      }
    }
  }

  useEffect(()=>{
    const api=desktopApi();
    if(!sessionId)return;
    const hasRecordedTimeOut=(recordsQuery.data?.items??[]).some((record)=>Boolean(record.checkedOutAt));
    const applyPhase=(phase:AttendanceCapturePhase)=>{const resolved=resolveForwardOnlyAttendancePhase(hasRecordedTimeOut?"time_out":undefined,readAttendancePhase(window.sessionStorage,sessionId),phase);setOfflineCapturePhase(resolved);setFacialActionMode(resolved==="time_out"?"check_out":"check_in");writeAttendancePhase(window.sessionStorage,sessionId,resolved);};
    void (async()=>{
      let localPhase: AttendanceCapturePhase | undefined;
      if(api&&authSession?.userId){
        try{localPhase=await api.getAttendanceCapturePhase(sessionId,authSession.userId);}catch{/* Fall back to session storage and server state. */}
      }
      try{
        const result=await coordinateAttendancePhase({
          localPhase,
          storedPhase: readAttendancePhase(window.sessionStorage,sessionId),
          currentPhase: hasRecordedTimeOut?"time_out":offlineCapturePhase,
          online: navigator.onLine && offline.status.connectivity !== "offline",
          readServerPhase: ()=>getServerAttendanceCapturePhase(sessionId),
          advanceServerPhase: ()=>advanceServerAttendanceCapturePhase(sessionId),
        });
        applyPhase(result.phase);
        if(result.phase==="time_out"&&localPhase!=="time_out"&&api&&authSession?.userId&&await api.getPreparedEvent(selectedEvent?.id??"",authSession.userId)) await api.advanceAttendanceCapturePhase(sessionId,authSession.userId);
      }catch{/* The next capture performs the same bounded reconciliation. */}
    })();
  },[authSession?.userId,offline.status.connectivity,offlineCapturePhase,recordsQuery.data?.items,selectedEvent?.id,sessionId]);

  async function advanceOfflineCapturePhase(){
    if(!sessionId||offlineCapturePhase==="time_out")return;
    try{
      const api=desktopApi();
      const packageReady=Boolean(api&&authSession?.userId&&selectedEvent&&await api.getPreparedEvent(selectedEvent.id,authSession.userId));
      const result=await coordinateAttendancePhase({
        localPhase: packageReady&&api&&authSession?.userId?await api.getAttendanceCapturePhase(sessionId,authSession.userId):undefined,
        storedPhase:readAttendancePhase(window.sessionStorage,sessionId),
        currentPhase:offlineCapturePhase,
        online:navigator.onLine&&offline.status.connectivity!=="offline",
        readServerPhase:()=>getServerAttendanceCapturePhase(sessionId),
        advanceServerPhase:()=>advanceServerAttendanceCapturePhase(sessionId),
      });
      if(result.phase!=="time_out") throw new Error("Time Out could not be opened.");
      if(api&&authSession?.userId&&packageReady&&await api.getAttendanceCapturePhase(sessionId,authSession.userId)!=="time_out") await api.advanceAttendanceCapturePhase(sessionId,authSession.userId);
      setOfflineCapturePhase("time_out");setFacialActionMode("check_out");writeAttendancePhase(window.sessionStorage,sessionId,"time_out");
    }catch(error){toast.error(getErrorMessage(error) || "Could not advance to Time Out.");}
  }

  // The local desktop session is authoritative for offline writes. A page
  // reload can leave this renderer one step ahead of that cache, so reconcile
  // only forward to Time Out immediately before saving a scan.
  async function reconcileOfflineCapturePhase(): Promise<AttendanceCapturePhase> {
    const api = desktopApi();
    if (!api || !authSession?.userId || !sessionId) return offlineCapturePhase;
    const localPhase = await api.getAttendanceCapturePhase(sessionId, authSession.userId);
    const resolved = offlineCapturePhase === "time_out" && localPhase === "time_in"
      ? await api.advanceAttendanceCapturePhase(sessionId, authSession.userId)
      : localPhase;
    if (resolved !== offlineCapturePhase) {
      setOfflineCapturePhase(resolved);
      setFacialActionMode(resolved === "time_out" ? "check_out" : "check_in");
      writeAttendancePhase(window.sessionStorage, sessionId, resolved);
    }
    return resolved;
  }

  async function reconcileOnlineCapturePhase(): Promise<AttendanceCapturePhase> {
    if(!sessionId)return offlineCapturePhase;
    const api=desktopApi();
    const localPhase=api&&authSession?.userId?await api.getAttendanceCapturePhase(sessionId,authSession.userId):undefined;
    const result=await coordinateAttendancePhase({
      localPhase,
      storedPhase:readAttendancePhase(window.sessionStorage,sessionId),
      currentPhase:offlineCapturePhase,
      online:navigator.onLine&&offline.status.connectivity!=="offline",
      readServerPhase:()=>getServerAttendanceCapturePhase(sessionId),
      advanceServerPhase:()=>advanceServerAttendanceCapturePhase(sessionId),
    });
    if(result.phase!==offlineCapturePhase){setOfflineCapturePhase(result.phase);setFacialActionMode(result.phase==="time_out"?"check_out":"check_in");writeAttendancePhase(window.sessionStorage,sessionId,result.phase);}
    if(result.phase==="time_out"&&localPhase!=="time_out"&&api&&authSession?.userId&&event&&await api.getPreparedEvent(event.id,authSession.userId)) await api.advanceAttendanceCapturePhase(sessionId,authSession.userId);
    return result.phase;
  }

  useEffect(() => {
    if (selectedSession) {
      setHeaderOverride({
        title: `${selectedEvent?.code ?? selectedSession.title} - Attendance`,
        breadcrumbs: ["Organizer", "Sessions", "Attendance"],
        description: `Live attendance session at ${selectedEvent?.venue ?? "Event venue"}`
      });
    }
  }, [selectedSession, selectedEvent, setHeaderOverride]);

  useEffect(() => {
    if (!sessionId || import.meta.env.MODE === "test") return;
    const supabase = getSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: number | undefined;
    let retryAttempt = 0;
    let disposed = false;
    let refetchTimer: number | undefined;
    const invalidateAttendance = () => {
      if (refetchTimer !== undefined) return;
      refetchTimer = window.setTimeout(() => {
        refetchTimer = undefined;
        void queryClient.invalidateQueries({ queryKey: ["attendanceRecords"] });
        void queryClient.invalidateQueries({ queryKey: ["attendanceSession", sessionId] });
      }, 250);
    };
    const subscribe = () => {
      if (disposed || !isPageVisible()) return;
      channel = supabase.channel(`plpass-attendance-${sessionId}-${retryAttempt}`);
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_records", filter: `event_session_id=eq.${sessionId}` }, invalidateAttendance)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "attendance_records", filter: `event_session_id=eq.${sessionId}` }, invalidateAttendance)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            retryAttempt = 0;
            return;
          }
          if (!disposed && ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            const delay = Math.min(60_000, 1_000 * 2 ** retryAttempt);
            retryAttempt = Math.min(retryAttempt + 1, 6);
            retryTimer = window.setTimeout(() => {
              if (!isPageVisible()) return;
              if (channel) void supabase.removeChannel(channel);
              channel = null;
              subscribe();
            }, delay);
          }
        });
    };
    subscribe();
    const removeVisibilityListener = onPageVisibilityChange((visible) => {
      if (!visible) {
        if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        retryTimer = undefined;
        if (channel) void supabase.removeChannel(channel);
        channel = null;
      } else if (!channel) {
        subscribe();
        invalidateAttendance();
      }
    });
    return () => {
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (refetchTimer !== undefined) window.clearTimeout(refetchTimer);
      if (channel) void supabase.removeChannel(channel);
      removeVisibilityListener();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!facialCameraOpen) return;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        facialStreamRef.current = stream;
        if (facialVideoRef.current) facialVideoRef.current.srcObject = stream;
      })
      .catch(() => setFacialStatus("Camera access was not granted. Use QR or manual attendance instead."));
    return () => {
      cancelled = true;
      facialStreamRef.current?.getTracks().forEach((track) => track.stop());
      facialStreamRef.current = null;
    };
  }, [facialCameraOpen]);

  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || (!scope.organizerId && scope.context.actorRole !== "admin")) {
    return shellState;
  }
  const cachedSession = offline.preparedEvent?.sessions.find((item) => item.id === sessionId);
  const canUsePreparedCache = offline.status.packageStatus === "READY" && Boolean(cachedSession);
  if (!canUsePreparedCache && (sessionQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || eventsQuery.isLoading || participantQuery.isLoading || tapsQuery.isLoading)) {
    return <LoadingState label="Loading active event session" />;
  }
  if ((sessionQuery.isError || !sessionQuery.data) && !cachedSession) {
    return <ErrorState title="Session unavailable" message="This event session was not found or is outside the signed-in organizer scope." />;
  }
  const session = sessionQuery.data ?? (cachedSession ? ({ id: cachedSession.id, type: "event", eventId: cachedSession.eventId, title: cachedSession.title, mode: "required", status: cachedSession.status === "ongoing" ? "active" : cachedSession.status, startsAt: cachedSession.startsAt, endsAt: cachedSession.endsAt, lateCutoffAt: cachedSession.lateCutoffAt, attendanceWindowStartAt: cachedSession.attendanceWindowStartAt, attendanceWindowEndAt: cachedSession.attendanceWindowEndAt, createdByUserId: "offline-cache" } as AttendanceSession) : undefined);
  if(!session)return <ErrorState title="Session unavailable" message="No online or prepared local session is available." />;
  const activeSession: AttendanceSession = session;
  const resolveOfflineWalkInStatus = (timeIn: string, timeOut: string | null | undefined) =>
    resolveRecordedOrganizerAttendanceStatus({
      timeIn,
      timeOut,
      attendanceSessionStatus: activeSession.status,
      lateCutoffAt: activeSession.lateCutoffAt
    });
  const preparedEvent=offline.preparedEvent;
  const cachedEvent=preparedEvent?.event;
  const event = eventsQuery.data?.items.find((item) => item.id === session.eventId) ?? (cachedEvent ? ({id:cachedEvent.id,code:cachedEvent.code,title:cachedEvent.title,status:"approved",startsAt:cachedEvent.startsAt,endsAt:cachedEvent.endsAt,venue:cachedSession?.venue??"Event venue",organizerId:"offline-cache",category:"Event",priorityLevel:"Flexible",impactScore:null,predictedTurnout:null} as Event) : undefined);
  const cachedRecords: AttendanceRecord[]=(preparedEvent?.attendance??[]).filter((item)=>item.sessionId===session.id).map((item)=>({id:`cached-${item.sessionId}-${item.studentId}`,sessionId:item.sessionId,studentId:item.studentId,status:item.attendanceStatus as AttendanceRecord["status"],verificationMethod:"manual",recordedAt:item.timeIn??preparedEvent?.preparedAt??new Date().toISOString(),timeIn:item.timeIn,checkedOutAt:item.timeOut}));
  const onlineRecords = recordsQuery.data?.items?.filter((record) => record.sessionId === session.id) ?? [];
  const recordsByStudent = new Map<string, AttendanceRecord>(cachedRecords.map((record) => [record.studentId, record]));
  onlineRecords.forEach((record) => {
    const cached = recordsByStudent.get(record.studentId);
    recordsByStudent.set(record.studentId, cached
      ? {
          ...cached,
          ...record,
          timeIn: record.timeIn ?? cached.timeIn,
          checkedOutAt: record.checkedOutAt ?? cached.checkedOutAt,
          finalizedAt: record.finalizedAt ?? cached.finalizedAt,
          lateReason: record.lateReason ?? cached.lateReason,
          lateReasonSubmittedAt: record.lateReasonSubmittedAt ?? cached.lateReasonSubmittedAt
        }
      : record);
  });
  const walkInRows = (organizerSummaryQuery.data?.[session.eventId ?? ""]?.rows ?? [])
    .filter((row) => row.sessionId === session.id && row.verificationLabel === "Walk-in")
  const records = [...recordsByStudent.values()];
  const cachedStudents: Student[]=(preparedEvent?.participants??[]).map((item)=>({id:item.studentId,userId:"offline-cache",studentNumber:item.studentNumber,status:"enrolled",programId:"offline-cache",departmentId:"offline-cache",yearLevel:1,section:"",fullName:item.displayName,formattedName:item.displayName,createdAt:preparedEvent?.preparedAt??new Date().toISOString()}));
  const students = studentsQuery.data?.items ?? cachedStudents;
  const participants = participantQuery.data?.items ?? (preparedEvent?.participants??[]).map((item)=>({id:`cached-${item.studentId}`,eventId:preparedEvent?.event.id??"",studentId:item.studentId,registeredAt:preparedEvent?.preparedAt??new Date().toISOString()}));
  const participantStudents = participants
    .map((participant) => students.find((student) => student.id === participant.studentId))
    .filter((student): student is Student => Boolean(student));

  const attempts = (tapsQuery.data?.items ?? []).filter((attempt) => attempt.sessionId === session.id);
  const counts = attendanceCounts(records);
  const duplicateAttempts = attempts.filter((attempt) => attempt.message === "Already recorded").length;
  const failedAttempts = attempts.filter((attempt) => !attempt.accepted).length;
  const recordedStudentIds = new Set(records.map((record) => record.studentId));
  const missingParticipants = participantStudents.filter((student) => !recordedStudentIds.has(student.id));
  const incompleteCheckouts = records.filter((record) => record.timeIn && !record.checkedOutAt && record.status !== "absent");
  const manualOverrides = records.filter((record) => record.verificationMethod === "manual");
  const liveRecordDisplayOverrides = new Map(
    walkInRows.map((row) => [row.id, {
      studentName: row.studentName,
      identifier: row.studentName.replace(/^Walk-in\s*·\s*/, "")
    }])
  );
  const liveRecords = buildLiveRecords(
    records.filter(
      (record) =>
        (statusFilter === "all" || record.status === statusFilter) &&
        (methodFilter === "all" || record.verificationMethod === (methodFilter as VerificationMethod))
    ),
    students,
    liveRecordDisplayOverrides
  ).filter(
    (record) =>
      !search || `${record.studentName} ${record.identifier}`.toLowerCase().includes(search.toLowerCase())
  );
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
          status: records[0].status,
          message: "Most recent attendance record.",
          timestamp: formatTime(records[0].recordedAt),
          resultLabel: records[0].status,
          method: records[0].verificationMethod
        }
      : undefined;
  function simulatedTime(outcome?: string) {
    if (outcome === "late") {
      return activeSession.lateCutoffAt ? new Date(new Date(activeSession.lateCutoffAt).getTime() + 60_000).toISOString() : undefined;
    }
    if (outcome === "outside-window") {
      return activeSession.attendanceWindowEndAt ? new Date(new Date(activeSession.attendanceWindowEndAt).getTime() + 60_000).toISOString() : undefined;
    }
    return activeSession.startsAt ? new Date(new Date(activeSession.startsAt).getTime() + 120_000).toISOString() : undefined;
  }

  function showWalkInResult(queued: PendingWalkInScan, displayName: string, phase: AttendanceCapturePhase, method: "qr" | "manual", description: string) {
    const duplicate = queued.action === "already_recorded";
    const walkInStatus = resolveOfflineWalkInStatus(queued.timeIn, queued.timeOut);
    setLatestResult({
      resultStatus: duplicate ? "Already Recorded" : phase === "time_in" ? "Time In Recorded" : "Time Out Recorded",
      studentDisplayName: displayName,
      studentNumber: queued.studentNumber,
      attendanceStatus: walkInStatus,
      verificationMethod: method,
      recordedAt: duplicate ? queued.timeIn : queued.timeIn,
      safeMessage: duplicate ? "This walk-in already has Time In recorded." : description,
      summary: { present: walkInStatus === "present" ? 1 : 0, late: walkInStatus === "late" ? 1 : 0, absent: walkInStatus === "absent" ? 1 : 0, duplicateAttempts: duplicate ? 1 : 0, failedAttempts: 0 }
    });
    if (duplicate) toast.warning(`${displayName}: Already Time In`, { description: "This walk-in was already recorded for the current attendance step." });
    else toast.success(`${displayName}: ${phase === "time_in" ? "Time In" : "Time Out"} recorded`, { description });
  }

  async function admitOnlineWalkIn(studentNumber: string, method: "qr" | "manual", occurredAt: string, localScanUuid = crypto.randomUUID()): Promise<boolean> {
    if (!event) throw new Error("The event could not be found.");
    const knownStudent = (studentsQuery.data?.items ?? []).find((student) => student.studentNumber === studentNumber);
    if (!knownStudent) {
      toast.error("No active enrolled student matches this number. No Walk-in attendance was recorded.");
      return true;
    }
    const client = getSupabaseBrowserClient();
    const isCheckingOut = offlineCapturePhase === "time_out";
    const { data: existing, error: existingError } = knownStudent && isCheckingOut
      ? await withRequestTimeout(client.from("attendance_records").select("local_attendance_uuid, time_in, time_out").eq("event_session_id", activeSession.id).eq("student_id", knownStudent.id).eq("attendance_origin", "walk_in").maybeSingle(), 30_000, "Checking existing walk-in attendance took too long. Check the connection and try again.")
      : { data: null, error: null };
    if (existingError) throw new Error(existingError.message);
    if (isCheckingOut && (!existing?.time_in || existing.time_out)) {
      toast.error(existing?.time_out ? "This Walk-in already has Time Out." : "No Walk-in Time In is recorded for this student.");
      return true;
    }
    if (!isCheckingOut && !await walkInWarning.confirm({ studentNumber, displayName: knownStudent.fullName })) return true;
    const { data, error } = await withRequestTimeout(client.rpc("record_approved_event_walkin", {
      p_local_scan_uuid: existing?.local_attendance_uuid ?? localScanUuid, p_event_id: event.id, p_session_id: activeSession.id,
      p_student_number: studentNumber, p_identification_method: method, p_time_in: existing?.time_in ?? occurredAt,
      ...(isCheckingOut ? { p_time_out: occurredAt, p_checkout_identification_method: method } : {})
    }), 30_000, "Recording walk-in attendance took too long. Check the connection and try again.");
    if (error) throw new Error(error.message);
    const result = data as { disposition?: string; attendance?: { student_id?: string; attendance_status?: AttendanceStatus; time_in?: string; time_out?: string | null }; student?: { id?: string; studentNumber?: string; displayName?: string } } | null;
    if (result?.disposition !== "confirmed_walk_in" || !result.attendance?.time_in) {
      toast.error("This student could not be admitted as a Walk-in.");
      return true;
    }
    await cacheOnlineAttendanceForOffline({
      studentId: result.attendance.student_id ?? result.student?.id ?? knownStudent.id,
      studentNumber: result.student?.studentNumber ?? studentNumber,
      displayName: result.student?.displayName ?? knownStudent?.fullName ?? studentNumber,
      participantStatus: "walk_in",
      attendanceStatus: result.attendance.attendance_status === "late" ? "late" : "present",
      timeIn: result.attendance.time_in,
      timeOut: result.attendance.time_out,
    });
    setLatestResult({ resultStatus: isCheckingOut ? "Time Out Recorded" : "Time In Recorded", studentDisplayName: `Walk-in · ${result.student?.displayName ?? knownStudent?.fullName ?? studentNumber}`, studentNumber, attendanceStatus: result.attendance.attendance_status ?? "present", verificationMethod: method, recordedAt: isCheckingOut ? occurredAt : result.attendance.time_in, safeMessage: isCheckingOut ? "Walk-in Time Out recorded." : "Walk-in admitted and recorded.", summary: { present: result.attendance.attendance_status === "present" ? 1 : 0, late: result.attendance.attendance_status === "late" ? 1 : 0, absent: 0, duplicateAttempts: 0, failedAttempts: 0 } });
    await Promise.all([recordsQuery.refetch(), participantQuery.refetch(), organizerSummaryQuery.refetch()]);
    toast.success(`Walk-in ${studentNumber}: ${isCheckingOut ? "Time Out" : "Time In"} recorded`);
    return true;
  }

  async function submitCredentialScan(code: string, method: "qr" | "facial", outcome?: string, similarity?: number) {
    const walkInScanUuid = crypto.randomUUID();
    let effectiveCapturePhase = offlineCapturePhase;
    try {
      if (offline.status.connectivity === "offline" && canUsePreparedCache && event) {
        const recordedAt=simulatedTime(outcome)??new Date().toISOString();
        const student=await identifyOfflineStudent(event.id,method,code);
        if(student?.isParticipant===false){if(!await walkInWarning.confirm({studentNumber:student.studentNumber,displayName:student.displayName}))return;const phase=await reconcileOfflineCapturePhase();const queued=await desktopApi()?.queueWalkInScan({eventId:event.id,sessionId:activeSession.id,studentNumber:student.studentNumber,identificationMethod:"qr",capturePhase:phase,attendanceTimestamp:recordedAt,organizerProfileId:authSession?.userId??"",localScanUuid:walkInScanUuid});if(!queued)throw new Error("The verified walk-in could not be securely saved.");showWalkInResult(queued,`Walk-in · ${student.displayName}`,phase,"qr","Saved on this device and will be reconciled after reconnecting.");await offline.refresh();return;}
        if(!student){const studentNumber=method==="qr"?extractSchoolStudentNumber(code):"";if(!studentNumber||!await walkInWarning.confirm({studentNumber,offline:true}))throw new Error("No attendance was saved.");const phase=await reconcileOfflineCapturePhase();const queued=await desktopApi()?.queueWalkInScan({eventId:event.id,sessionId:activeSession.id,studentNumber,identificationMethod:"qr",capturePhase:phase,attendanceTimestamp:recordedAt,organizerProfileId:authSession?.userId??"",localScanUuid:walkInScanUuid});if(!queued)throw new Error("The walk-in scan could not be securely saved.");showWalkInResult(queued,`Walk-in · ${queued.studentNumber}`,phase,"qr","Saved on this device and will be reconciled after reconnecting.");await offline.refresh();return;}
        const phase=await reconcileOfflineCapturePhase();
        const local=await recordOfflineAttendance({eventId:event.id,sessionId:activeSession.id,studentId:student.studentId,identificationMethod:method,attendanceTimestamp:recordedAt},phase);
        setLatestResult({resultStatus:local.action==="already_recorded"?"Already Recorded":local.record.attendanceStatus==="late"?"Late":"Present",studentDisplayName:student.displayName,studentNumber:student.studentNumber,attendanceStatus:local.record.attendanceStatus,verificationMethod:method,recordedAt:local.record.attendanceTimestamp,safeMessage:local.safeMessage,summary:{present:local.record.attendanceStatus==="present"?1:0,late:local.record.attendanceStatus==="late"?1:0,absent:0,duplicateAttempts:local.action==="already_recorded"?1:0,failedAttempts:0}});
        if (local.action === "already_recorded") toast.warning("Attendance already recorded",{description:local.safeMessage});
        else toast.success("Attendance recorded locally",{description:local.safeMessage});
        await offline.refresh(); return;
      }
      effectiveCapturePhase = await reconcileOnlineCapturePhase();
      const walkInNumber = method === "qr" ? extractSchoolStudentNumber(code) : "";
      if (walkInNumber) {
        const { data: existingWalkIn, error: existingWalkInError } = await withRequestTimeout(getSupabaseBrowserClient()
          .from("attendance_records")
          .select("id, students!inner(student_id)")
          .eq("event_session_id", activeSession.id)
          .eq("attendance_origin", "walk_in")
          .eq("students.student_id", walkInNumber)
          .maybeSingle(), 30_000, "Checking existing walk-in attendance took too long. Check the connection and try again.");
        if (existingWalkInError) throw new Error(existingWalkInError.message);
        if (existingWalkIn || !participantStudents.some((student) => student.studentNumber === walkInNumber)) {
          await admitOnlineWalkIn(walkInNumber, "qr", simulatedTime(outcome) ?? new Date().toISOString(), walkInScanUuid);
          return;
        }
      }
      const result = await attendanceMutations.credentialScanMutation.mutateAsync({
        sessionId: activeSession.id,
        credentialCode: code,
        method,
        faceSimilarity: similarity,
        occurredAt: simulatedTime(outcome)
      });
      setLatestResult(result);
      if (result.attendanceRecord?.timeIn) {
        await cacheOnlineAttendanceForOffline({
          studentId: result.attendanceRecord.studentId,
          studentNumber: result.studentNumber,
          displayName: result.studentDisplayName,
          participantStatus: "invited",
          attendanceStatus: result.attendanceRecord.status === "late" ? "late" : "present",
          timeIn: result.attendanceRecord.timeIn,
          timeOut: result.attendanceRecord.checkedOutAt,
        });
      }
      toast(result.resultStatus, { description: result.safeMessage });
    } catch (error) {
      if(isConnectivityFailure(error)&&canUsePreparedCache&&event){try{const student=await identifyOfflineStudent(event.id,method,code);if(student&&student.isParticipant!==false){const at=simulatedTime(outcome)??new Date().toISOString();const local=await recordOfflineAttendance({eventId:event.id,sessionId:activeSession.id,studentId:student.studentId,identificationMethod:method,attendanceTimestamp:at},effectiveCapturePhase);setLatestResult({resultStatus:effectiveCapturePhase==="time_in"?"Time In Recorded":"Time Out Recorded",studentDisplayName:student.displayName,studentNumber:student.studentNumber,attendanceStatus:local.record.attendanceStatus,verificationMethod:method,recordedAt:at,safeMessage:local.safeMessage,summary:{present:0,late:0,absent:0,duplicateAttempts:0,failedAttempts:0}});toast.success(`${student.displayName}: saved at ${new Date(at).toLocaleTimeString()}`,{description:"Saved on this device; not synced."});await offline.refresh();return;}}catch{/* Show safe failure below. */}}
      toast.error("Attendance was not saved", { description: "Neither the central service nor the prepared local package could confirm this scan." });
    }
  }
  async function verifyFacialAttendance() {
    const video = facialVideoRef.current;
    if (!video) {
      setFacialStatus("Start the camera and keep one student centered.");
      return;
    }
    if (facialVerifying || attendanceMutations.credentialScanMutation.isPending) return;
    setFacialVerifying(true);
    setFacialStatus("Identifying one live face and searching enrolled event participants…");
    let effectiveCapturePhase = offlineCapturePhase;
    try {
      const { descriptor: liveDescriptor } = await extractMirroredFaceDescriptor(video);
      if(offline.status.connectivity==="offline"&&canUsePreparedCache&&event){
        effectiveCapturePhase = await reconcileOfflineCapturePhase();
        const student=await identifyOfflineStudent(event.id,"facial",video);
        if(!student)throw new Error("No enrolled participant matched the saved offline face package.");
        const at=new Date().toISOString();const local=await recordOfflineAttendance({eventId:event.id,sessionId:activeSession.id,studentId:student.studentId,identificationMethod:"facial",attendanceTimestamp:at},effectiveCapturePhase);
        setFacialStatus(`${student.displayName} (${student.studentNumber}) — ${effectiveCapturePhase==="time_in"?"Time In":"Time Out"} saved locally at ${new Date(at).toLocaleTimeString()}; not synced.`);toast.success(`${student.displayName} saved at ${new Date(at).toLocaleTimeString()}`,{description:"Saved on this device; not synced."});await offline.refresh();setFacialCameraOpen(false);return;
      }
      effectiveCapturePhase = await reconcileOnlineCapturePhase();
      const client = getSupabaseBrowserClient();
      const { data: candidates, error: candidatesError } = await withRequestTimeout(client.rpc("get_live_facial_candidates", {
        p_event_session_id: activeSession.id
      }), 30_000, "Facial attendance lookup took too long. Use QR or manual attendance and try again.");
      if (candidatesError) throw new Error(candidatesError.message);

      const matches = (await Promise.all((candidates ?? []).map(async (candidate) => {
        const { data: descriptor, error } = await withRequestTimeout(client.rpc("get_facial_descriptor_for_organizer", {
          p_event_session_id: activeSession.id,
          p_student_id: candidate.student_id
        }), 30_000, "Facial attendance lookup took too long. Use QR or manual attendance and try again.");
        if (error || !Array.isArray(descriptor) || !descriptor.every((value) => typeof value === "number")) return null;
        return { candidate, similarity: faceSimilarity(descriptor, liveDescriptor) };
      }))).filter((match): match is NonNullable<typeof match> => Boolean(match));

      matches.sort((left, right) => right.similarity - left.similarity);
      const bestMatch = matches[0];
      if (!bestMatch || bestMatch.similarity < 0.82) {
        throw new Error("No enrolled participant matched this face. Use QR or manual attendance.");
      }
      if (matches[1] && bestMatch.similarity - matches[1].similarity < 0.04) {
        throw new Error("Face match is ambiguous. Keep only one participant in view or use QR.");
      }

      const { data: attendance, error: attendanceError } = await withRequestTimeout(client.rpc("record_live_facial_attendance", {
        p_event_session_id: activeSession.id,
        p_student_id: bestMatch.candidate.student_id,
        p_similarity: bestMatch.similarity,
        p_action: effectiveCapturePhase === "time_out" ? "check_out" : "check_in",
        p_occurred_at: new Date().toISOString()
      }), 30_000, "Facial attendance took too long. Use QR or manual attendance and try again.");
      if (attendanceError) throw new Error(attendanceError.message);
      const action = attendance && typeof attendance === "object" && "action" in attendance ? attendance.action : "checked_in";
      const actionLabel = action === "checked_out" ? "checked out" : action === "already_recorded" ? "already recorded" : "checked in";
      const facialAttendance = attendance && typeof attendance === "object" ? attendance as { attendance_status?: "present" | "late"; time_in?: string; time_out?: string | null } : null;
      await cacheOnlineAttendanceForOffline({
        studentId: bestMatch.candidate.student_id,
        studentNumber: bestMatch.candidate.student_number,
        displayName: bestMatch.candidate.display_name,
        participantStatus: "invited",
        attendanceStatus: facialAttendance?.attendance_status === "late" ? "late" : "present",
        timeIn: facialAttendance?.time_in ?? new Date().toISOString(),
        timeOut: facialAttendance?.time_out ?? (action === "checked_out" ? new Date().toISOString() : null),
      });
      setFacialStatus(`${bestMatch.candidate.display_name} (${bestMatch.candidate.student_number}) — ${actionLabel}. Match confidence: ${(bestMatch.similarity * 100).toFixed(1)}%. Returning to QR for the next student.`);
      toast.success(`${bestMatch.candidate.display_name}: ${actionLabel}`);
      await Promise.all([recordsQuery.refetch(), tapsQuery.refetch()]);
      setFacialCameraOpen(false);
    } catch (error) {
      const errorMessage = getErrorMessage(error) || "Face verification could not be completed.";
      if(isConnectivityFailure(error)&&canUsePreparedCache&&event&&facialVideoRef.current){try{const student=await identifyOfflineStudent(event.id,"facial",facialVideoRef.current);if(student&&student.isParticipant!==false){const at=new Date().toISOString();const local=await recordOfflineAttendance({eventId:event.id,sessionId:activeSession.id,studentId:student.studentId,identificationMethod:"facial",attendanceTimestamp:at},effectiveCapturePhase);setFacialStatus(`${student.displayName} (${student.studentNumber}) — ${effectiveCapturePhase==="time_in"?"Time In":"Time Out"} saved locally at ${new Date(at).toLocaleTimeString()}; not synced.`);toast.success(`${student.displayName} saved locally`,{description:"Saved on this device; not synced."});await offline.refresh();setFacialCameraOpen(false);return;}}catch{/* Preserve original online failure below. */}}
      setFacialStatus(!navigator.onLine || /failed to fetch|network|offline/i.test(errorMessage)
        ? "Facial recognition requires an internet connection. Reconnect and try again, or use QR attendance."
        : errorMessage);
    } finally {
      setFacialVerifying(false);
    }
  }
  async function submitManualAttendance() {
    const walkInScanUuid = crypto.randomUUID();
    let effectiveCapturePhase = offlineCapturePhase;
    try {
      if(offline.status.connectivity!=="offline"&&navigator.onLine) effectiveCapturePhase = await reconcileOnlineCapturePhase();
      const lookup = manualStudentId.trim().toLowerCase();
      const selectedStudent = participantStudents.find((student) =>
        student.id === manualStudentId || student.studentNumber.toLowerCase() === lookup || studentName(student).toLowerCase() === lookup
      );
      if (!selectedStudent) {
        const studentNumber=extractSchoolStudentNumber(manualStudentId);
        if(offline.status.connectivity==="offline"&&canUsePreparedCache&&event&&studentNumber&&await walkInWarning.confirm({studentNumber,offline:true})){
          const at=new Date().toISOString();const phase=await reconcileOfflineCapturePhase();const queued=await desktopApi()?.queueWalkInScan({eventId:event.id,sessionId:activeSession.id,studentNumber,identificationMethod:"manual",capturePhase:phase,attendanceTimestamp:at,organizerProfileId:authSession?.userId??"",localScanUuid:walkInScanUuid});
          if(!queued)throw new Error("The walk-in scan could not be securely saved.");
          const walkInStatus=resolveOfflineWalkInStatus(queued.timeIn,queued.timeOut);
          setLatestResult({resultStatus:queued.action==="already_recorded"?"Already Recorded":phase==="time_in"?"Time In Recorded":"Time Out Recorded",studentDisplayName:`Walk-in · ${queued.studentNumber}`,studentNumber:queued.studentNumber,attendanceStatus:walkInStatus,verificationMethod:"manual",recordedAt:queued.timeIn,safeMessage:queued.action==="already_recorded"?"This walk-in already has Time In recorded.":"Saved on this device and will be reconciled after reconnecting.",summary:{present:walkInStatus==="present"?1:0,late:walkInStatus==="late"?1:0,absent:walkInStatus==="absent"?1:0,duplicateAttempts:queued.action==="already_recorded"?1:0,failedAttempts:0}});
          if (queued.action === "already_recorded") toast.warning(`${queued.studentNumber}: Already recorded`,{description:"This walk-in already has Time In recorded."});
          else toast.success(`${queued.studentNumber} saved at ${new Date(at).toLocaleTimeString()}`,{description:"Walk-in saved on this device and will be reconciled after reconnecting."});
          await offline.refresh();return;
        }
        if (studentNumber) { await admitOnlineWalkIn(studentNumber, "manual", new Date().toISOString(), walkInScanUuid); return; }
        toast.error("Enter an assigned participant by student ID or exact name, or a valid student number for a Walk-in.");
        return;
      }
      if (manualReason.trim().length < 5) {
        toast.error("Provide a manual attendance reason of at least 5 characters.");
        return;
      }
      if(offline.status.connectivity==="offline"&&canUsePreparedCache&&event){
        effectiveCapturePhase = await reconcileOfflineCapturePhase();
        const local=await recordOfflineAttendance({eventId:event.id,sessionId:activeSession.id,studentId:selectedStudent.id,identificationMethod:"manual",attendanceTimestamp:new Date().toISOString(),remarks:[manualReason,manualRemarks].filter(Boolean).join(": ")},effectiveCapturePhase);
        setLatestResult({resultStatus:local.record.attendanceStatus==="late"?"Late":"Present",studentDisplayName:studentName(selectedStudent),studentNumber:selectedStudent.studentNumber,attendanceStatus:local.record.attendanceStatus,verificationMethod:"manual",recordedAt:local.record.attendanceTimestamp,safeMessage:local.safeMessage,summary:{present:local.record.attendanceStatus==="present"?1:0,late:local.record.attendanceStatus==="late"?1:0,absent:0,duplicateAttempts:local.action==="already_recorded"?1:0,failedAttempts:0}});
        setManualStudentId("");setManualReason("");setManualRemarks("");setManualStatus("present");setManualLateReason("");toast.success("Attendance recorded locally",{description:local.safeMessage});await offline.refresh();return;
      }
      const result = await attendanceMutations.manualAttendanceMutation.mutateAsync({
        sessionId: activeSession.id,
        studentId: selectedStudent.id,
        reason: manualReason,
        remarks: manualRemarks,
        statusOverride: manualStatus,
        lateReason: manualLateReason === "" ? undefined : manualLateReason,
        occurredAt: simulatedTime()
      });
      setLatestResult(result);
      if (result.attendanceRecord?.timeIn) {
        await cacheOnlineAttendanceForOffline({
          studentId: result.attendanceRecord.studentId,
          studentNumber: result.studentNumber,
          displayName: result.studentDisplayName,
          participantStatus: "invited",
          attendanceStatus: result.attendanceRecord.status === "late" ? "late" : "present",
          timeIn: result.attendanceRecord.timeIn,
          timeOut: result.attendanceRecord.checkedOutAt,
        });
      }
      setManualStudentId("");
      setManualReason("");
      setManualRemarks("");
      setManualStatus("present");
      setManualLateReason("");
      toast(result.resultStatus, { description: result.safeMessage });
    } catch (error) {
      if(isConnectivityFailure(error)&&canUsePreparedCache&&event){try{const selectedStudent=await identifyOfflineStudent(event.id,"manual",manualStudentId);if(selectedStudent&&selectedStudent.isParticipant!==false){const at=new Date().toISOString();const local=await recordOfflineAttendance({eventId:event.id,sessionId:activeSession.id,studentId:selectedStudent.studentId,identificationMethod:"manual",attendanceTimestamp:at,remarks:[manualReason,manualRemarks].filter(Boolean).join(": ")},effectiveCapturePhase);toast.success(`Attendance saved at ${new Date(at).toLocaleTimeString()}`,{description:"Saved on this device; not synced."});await offline.refresh();return;}}catch{/* Show safe failure below. */}}
      toast.error("Manual attendance was not saved", { description: "Neither the central service nor the prepared local package confirmed the record." });
    }
  }
  async function confirmEnd() {
    if (endReason.trim().length < 5) {
      toast.error("Select a reason before ending the session.");
      return;
    }
    if (endingSessionRef.current) return;
    endingSessionRef.current = true;
    const reason = endReason.trim();
    const endLocally = async () => {
      if (!event || !authSession?.userId || !canUsePreparedCache) {
        throw new Error("This session has no verified prepared local package. Reconnect before ending it.");
      }
      await endOfflineEvent(event.id, activeSession.id, authSession.userId, reason);
      await offline.refresh();
      toast.success("Session ended on this device. Attendance will synchronize after reconnecting.");
    };
    try {
      if (offline.status.connectivity === "offline" || !navigator.onLine) {
        await endLocally();
      } else {
        await mutations.endSessionMutation.mutateAsync({ sessionId: activeSession.id, reason });
      }
      setEndOpen(false);
      navigate(APP_ROUTES.organizerEvents, { replace: true });
    } catch (error) {
      if (isConnectivityFailure(error) && canUsePreparedCache) {
        try {
          await endLocally();
          setEndOpen(false);
          navigate(APP_ROUTES.organizerEvents, { replace: true });
          return;
        } catch (localError) {
          toast.error(getErrorMessage(localError) || "The session could not be ended safely on this device.");
          return;
        }
      }
      toast.error(getErrorMessage(error) || "The session could not be ended.");
    } finally {
      endingSessionRef.current = false;
    }
  }
  return (
    <OrganizerFrame>
      <PageHeader title="Event Attendance" description="Monitor live check-ins, record manual attendance, and view session statistics." />
      <div className="rounded-lg border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-foreground">{event?.title ?? session.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="destructive" size="sm" className="h-8" onClick={() => setEndOpen(true)}>
              End Session
            </Button>
          </div>
        </div>
      </div>
      <ActiveSessionHeader title={eventLabel(event)} venue={event?.venue ?? "Event venue"} startedAt={`${formatDate(session.startsAt)} ${formatTime(session.startsAt)}`} statusLabel={session.status} />
      <OfflineStatusPanel status={offline.status} busy={offline.busy} onPrepare={()=>void offline.prepare().then(()=>toast.success("Event is ready for offline use.")).catch((error)=>toast.error(getErrorMessage(error) || "Offline preparation failed."))} onRetry={()=>void offline.sync(true).then(()=>toast.success("Synchronization attempt completed."))} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-4"><p className="text-sm font-medium">Capture step: {offlineCapturePhase==="time_in"?"Time In":"Time Out"}</p>{offlineCapturePhase==="time_in"?<Button type="button" variant="outline" onClick={()=>void advanceOfflineCapturePhase()}>Advance to Time Out</Button>:<p className="text-sm text-muted-foreground">Time In is closed for this session.</p>}</div>
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border bg-highlight-soft p-4 text-sm text-foreground">
            <p className="font-semibold">Active attendance window</p>
            <p className="mt-1">Late cutoff: {formatTime(session.lateCutoffAt ?? session.startsAt)}. Window ends: {formatTime(session.attendanceWindowEndAt ?? session.endsAt ?? session.startsAt)}.</p>
          </div>
          <QRFallbackPanel disabled={attendanceMutations.credentialScanMutation.isPending} onScan={(code) => void submitCredentialScan(code, "qr")} />
          <section className="rounded-lg border bg-surface p-4" aria-label="Facial verification">
            <p className="font-semibold">Live facial recognition</p>
            <p id="organizer-face-camera-instructions" className="mt-1 text-sm text-muted-foreground">Organizer fallback station. Open this only after QR cannot be read, then scan one enrolled participant at a time. Use manual ID if face verification is unavailable.</p>
            <label className="mt-3 block text-sm font-medium">
              Attendance action
              <span className="mt-1 block rounded-md border px-3 py-2 text-sm">{facialActionMode==="check_in"?"Time In":"Time Out"} — one-way session step</span>
            </label>
            {facialCameraOpen ? <video ref={facialVideoRef} aria-label="Live facial verification camera preview" aria-describedby="organizer-face-camera-instructions" autoPlay muted playsInline className="mt-3 aspect-video w-full rounded-md bg-black object-cover scale-x-[-1]" /> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setFacialCameraOpen((open) => !open)}>{facialCameraOpen ? "Stop camera" : "Start camera"}</Button>
              <Button type="button" size="sm" disabled={!facialCameraOpen || facialVerifying} onClick={() => void verifyFacialAttendance()}>{facialVerifying ? "Identifying…" : "Scan now"}</Button>
            </div>
            {facialStatus ? <p className="mt-3 text-sm text-muted-foreground" role="status">{facialStatus}</p> : null}
          </section>
          <section className="rounded-lg border bg-surface p-4" aria-label="Manual attendance entry">
            <h2 className="font-semibold">Manual entry</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enter student ID or name for quick manual attendance.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Student (ID or name)
                <input className="plpass-field mt-1 h-10 w-full rounded-md border px-3 text-sm" value={manualStudentId} onChange={(e) => setManualStudentId(e.target.value)} />
              </label>
              <label className="block text-sm font-medium">
                Manual entry reason
                <input className="plpass-field mt-1 h-10 w-full rounded-md border px-3 text-sm" value={manualReason} onChange={(e) => setManualReason(e.target.value)} placeholder="Required reason" />
              </label>
              <label className="block text-sm font-medium">
                Remarks
                <input className="plpass-field mt-1 h-10 w-full rounded-md border px-3 text-sm" value={manualRemarks} onChange={(e) => setManualRemarks(e.target.value)} />
              </label>
              <div className="space-y-3">
                <p className="text-sm font-medium">Attendance status</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={manualStatus === "present" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setManualStatus("present")}
                  >
                    Present
                  </Button>
                  <Button
                    type="button"
                    variant={manualStatus === "late" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setManualStatus("late")}
                  >
                    Late
                  </Button>
                </div>
              </div>
              {manualStatus === "late" ? (
                <label className="block text-sm font-medium">
                  Late reason
                  <select
                    className="plpass-field mt-1 h-10 w-full rounded-md border px-3 text-sm"
                    value={manualLateReason}
                    onChange={(e) => setManualLateReason(e.target.value as LateReason | "")}
                  >
                    <option value="">No reason specified</option>
                    {LATE_REASON_OPTIONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div>
                <Button type="button" disabled={attendanceMutations.manualAttendanceMutation.isPending} onClick={submitManualAttendance}>
                  Save manual attendance
                </Button>
              </div>
            </div>
          </section>
        </div>
        <div className="min-w-0 space-y-4">
          <LatestTapResultCard result={latestTapResult} />
          <div className="rounded-lg border bg-surface p-4">
            <h2 className="font-semibold">Recent activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest accepted, duplicate, and failed attendance attempts refresh from PLPass data.</p>
          </div>
          <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={organizerSummaryQuery.data?.[session.eventId ?? ""]?.attendancePopulation ?? participantStudents.length} walkIns={walkInRows.length} />
          <div className="grid gap-3 md:grid-cols-2">
            <StatCard title="Failed taps" value={String(failedAttempts)} tone="warning" />
            <StatCard title="Duplicate taps" value={String(duplicateAttempts)} />
          </div>
          <section className="rounded-lg border bg-surface p-4" aria-label="Attendance reconciliation">
            <h2 className="font-semibold">Reconciliation</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review exceptions before ending the session.</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-background p-3"><dt className="text-muted-foreground">No attendance</dt><dd className="text-lg font-semibold">{missingParticipants.length}</dd></div>
              <div className="rounded-md bg-background p-3"><dt className="text-muted-foreground">No checkout</dt><dd className="text-lg font-semibold">{incompleteCheckouts.length}</dd></div>
              <div className="rounded-md bg-background p-3"><dt className="text-muted-foreground">Failed attempts</dt><dd className="text-lg font-semibold">{failedAttempts}</dd></div>
              <div className="rounded-md bg-background p-3"><dt className="text-muted-foreground">Manual records</dt><dd className="text-lg font-semibold">{manualOverrides.length}</dd></div>
            </dl>
          </section>
        </div>
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <div className="rounded-lg border bg-surface p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-semibold">Live attendance records</h2>
                <p className="mt-1 text-sm text-muted-foreground">Search and filter students recorded during this session.</p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-3 lg:max-w-3xl">
                <SearchInput value={search} placeholder="Search student or ID" onChange={setSearch} />
                <select aria-label="Filter by attendance status" className="plpass-field h-10 rounded-md border px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
                <select aria-label="Filter by verification method" className="plpass-field h-10 rounded-md border px-3 text-sm" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                  <option value="all">All methods</option>
                  <option value="qr">QR</option>
                  <option value="facial">Facial</option>
                  <option value="manual">Manual</option>
                  <option value="online">Online</option>
                </select>
              </div>
            </div>
          </div>
          <LiveAttendanceList records={liveRecords} />
        </div>
      </section>
      <ConfirmModal open={endOpen} title="End event session" description="A reason is required when ending early or overtime." confirmLabel="End session" tone="danger" onCancel={() => setEndOpen(false)} onConfirm={confirmEnd}>
        <select className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={endReason} onChange={(event) => setEndReason(event.target.value)}>
          <option value="">Select reason</option>
          {["Event ended early", "Event extended overtime", "Venue issue", "Schedule adjustment", "Emergency", "Other"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </select>
        {mutations.endSessionMutation.isError ? <p className="mt-2 text-sm text-danger">A reason is required.</p> : null}
      </ConfirmModal>
      {walkInWarning.dialog}
    </OrganizerFrame>
  );
}
