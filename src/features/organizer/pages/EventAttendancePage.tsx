/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useMemo, useRef, useState } from "react";
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
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents,
  useAuditLogMutations
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { extractFaceDescriptor, faceSimilarity } from "@/lib/biometrics/humanFace";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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
  return student ? student.studentNumber : "Unknown student";
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

export function EventAttendancePage() {
  const { sessionId } = useParams();
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const { setHeaderOverride } = useHeader();
  const sessionQuery = useAttendanceSession(sessionId, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const participantQuery = useEventParticipants(sessionQuery.data?.eventId ?? "", { pageSize: 500 }, scope.context);
  const tapsQuery = useNfcTapAttempts({ pageSize: 500 }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);
  const attendanceMutations = useAttendanceSubmissionMutations(scope.context);
  const auditLogMutations = useAuditLogMutations(scope.context);
  const [qrEnabled, setQrEnabled] = useState(false);
  const [latestResult, setLatestResult] = useState<AttendanceSubmissionResult | null>(null);
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
  const [facialStudentId, setFacialStudentId] = useState("");
  const [facialCameraOpen, setFacialCameraOpen] = useState(false);
  const [facialStatus, setFacialStatus] = useState("");
  const [facialVerifying, setFacialVerifying] = useState(false);
  const facialVideoRef = useRef<HTMLVideoElement | null>(null);
  const facialStreamRef = useRef<MediaStream | null>(null);

  const selectedSession = sessionQuery.data;
  const selectedEvent = eventsQuery.data?.items.find((item) => item.id === selectedSession?.eventId);

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
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (sessionQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || eventsQuery.isLoading || participantQuery.isLoading || tapsQuery.isLoading) {
    return <LoadingState label="Loading active event session" />;
  }
  if (sessionQuery.isError || !sessionQuery.data) {
    return <ErrorState title="Session unavailable" message="This event session was not found or is outside the signed-in organizer scope." />;
  }
  const session = sessionQuery.data;
  const event = eventsQuery.data?.items.find((item) => item.id === session.eventId);
  const records = (recordsQuery.data?.items ?? []).filter((record) => record.sessionId === session.id);
  const students = studentsQuery.data?.items ?? [];
  const participants = participantQuery.data?.items ?? [];
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
  const liveRecords = buildLiveRecords(
    records.filter(
      (record) =>
        (statusFilter === "all" || record.status === statusFilter) &&
        (methodFilter === "all" || record.verificationMethod === (methodFilter as VerificationMethod))
    ),
    students
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
          status: records[0].status === "excused" ? "manual" as const : records[0].status,
          message: "Most recent attendance record.",
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
  async function submitCredentialScan(code: string, method: "qr" | "facial", outcome?: string, similarity?: number) {
    try {
      const result = await attendanceMutations.credentialScanMutation.mutateAsync({
        sessionId: session.id,
        credentialCode: code,
        method,
        faceSimilarity: similarity,
        occurredAt: simulatedTime(outcome)
      });
      setLatestResult(result);
      toast(result.resultStatus, { description: result.safeMessage });
    } catch {
      toast.error("Attendance simulation failed", { description: "The attendance service rejected the scan." });
    }
  }
  async function verifyFacialAttendance() {
    const video = facialVideoRef.current;
    if (!facialStudentId || !video) {
      setFacialStatus("Choose an enrolled student and start the camera first.");
      return;
    }
    setFacialVerifying(true);
    setFacialStatus("Checking the live face…");
    try {
      const client = getSupabaseBrowserClient();
      const { data, error } = await client
        .rpc("get_facial_descriptor_for_organizer", {
          p_student_id: facialStudentId,
          p_event_session_id: session.id
        });
      if (error) throw error;
      const reference = Array.isArray(data) ? data.filter((value): value is number => typeof value === "number") : [];
      if (reference.length < 32) {
        throw new Error("This student does not have an active live facial enrollment.");
      }
      const capture = await extractFaceDescriptor(video);
      const similarity = faceSimilarity(reference, capture.descriptor);
      if (similarity < 0.82) {
        setFacialStatus("Face was not a close enough match. Ask the student to face the camera clearly, or use QR/manual attendance.");
        return;
      }
      await submitCredentialScan(facialStudentId, "facial", undefined, similarity);
      setFacialStatus(`Face verified (${Math.round(similarity * 100)}% match).`);
    } catch (error) {
      setFacialStatus(error instanceof Error ? error.message : "Face verification could not be completed.");
    } finally {
      setFacialVerifying(false);
    }
  }
  async function submitManualAttendance() {
    try {
      const lookup = manualStudentId.trim().toLowerCase();
      const selectedStudent = participantStudents.find((student) =>
        student.id === manualStudentId || student.studentNumber.toLowerCase() === lookup || studentName(student).toLowerCase() === lookup
      );
      if (!selectedStudent) {
        toast.error("Select an assigned participant by student ID or exact name.");
        return;
      }
      if (manualReason.trim().length < 5) {
        toast.error("Provide a manual attendance reason of at least 5 characters.");
        return;
      }
      const result = await attendanceMutations.manualAttendanceMutation.mutateAsync({
        sessionId: session.id,
        studentId: selectedStudent.id,
        reason: manualReason,
        remarks: manualRemarks,
        statusOverride: manualStatus,
        lateReason: manualLateReason === "" ? undefined : manualLateReason,
        occurredAt: simulatedTime()
      });
      setLatestResult(result);
      setManualStudentId("");
      setManualReason("");
      setManualRemarks("");
      setManualStatus("present");
      setManualLateReason("");
      toast(result.resultStatus, { description: result.safeMessage });
      
      void auditLogMutations.logActionMutation.mutateAsync({
        action: "Submitted Manual Attendance",
        targetType: "attendance_record",
        targetId: result.attendanceRecord?.id,
        metadata: { studentId: selectedStudent.id, sessionId: session.id, status: manualStatus }
      });
    } catch {
      toast.error("Manual attendance was not saved", { description: "Select a participant, reason, and remarks." });
    }
  }
  async function confirmEnd() {
    if (endReason.trim().length < 5) {
      toast.error("Select a reason before ending the session.");
      return;
    }
    await mutations.endSessionMutation.mutateAsync({ sessionId: session.id, reason: endReason });
    setEndOpen(false);
    
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Ended Live Session",
      targetType: "attendance_session",
      targetId: session.id,
      metadata: { sessionId: session.id, reason: endReason }
    });
    
    navigate(APP_ROUTES.organizerRecords);
  }
  return (
    <OrganizerFrame>
      <PageHeader
        title={event?.title ?? session.title}
        description="Record live QR check-ins, organizer manual attendance, and attendance session activity."
        actions={<Button type="button" variant="destructive" onClick={() => setEndOpen(true)}>End Session</Button>}
      />
      <ActiveSessionHeader title={eventLabel(event)} venue={event?.venue ?? "Event venue"} startedAt={`${formatDate(session.startsAt)} ${formatTime(session.startsAt)}`} statusLabel={session.status} />
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-lg border bg-highlight-soft p-4 text-sm text-foreground">
            <p className="font-semibold">Active attendance window</p>
            <p className="mt-1">Late cutoff: {formatTime(session.lateCutoffAt ?? session.startsAt)}. Window ends: {formatTime(session.attendanceWindowEndAt ?? session.endsAt ?? session.startsAt)}.</p>
          </div>
          <QRFallbackPanel enabled={qrEnabled} disabled={attendanceMutations.credentialScanMutation.isPending} onToggle={() => setQrEnabled((value) => !value)} onSimulate={(code) => submitCredentialScan(code, "qr")} />
          <section className="rounded-lg border bg-surface p-4" aria-label="Facial verification">
            <p className="font-semibold">Facial verification</p>
            <p id="organizer-face-camera-instructions" className="mt-1 text-sm text-muted-foreground">Organizer backup only. Select an enrolled student, start the camera, center one face clearly, and choose Verify face. Use QR or manual attendance if camera verification is unavailable.</p>
            <label className="mt-3 block text-sm font-medium">
              Enrolled student
              <select className="plpass-field mt-1 h-10 w-full rounded-md border px-3 text-sm" value={facialStudentId} onChange={(event) => setFacialStudentId(event.target.value)}>
                <option value="">Choose a participant</option>
                {participantStudents.map((student) => <option key={student.id} value={student.id}>{studentName(student)} ({student.studentNumber})</option>)}
              </select>
            </label>
            {facialCameraOpen ? <video ref={facialVideoRef} aria-label="Live facial verification camera preview" aria-describedby="organizer-face-camera-instructions" autoPlay muted playsInline className="mt-3 aspect-video w-full rounded-md bg-black object-cover" /> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setFacialCameraOpen((open) => !open)}>{facialCameraOpen ? "Stop camera" : "Start camera"}</Button>
              <Button type="button" size="sm" disabled={!facialCameraOpen || facialVerifying || attendanceMutations.credentialScanMutation.isPending} onClick={() => void verifyFacialAttendance()}>{facialVerifying ? "Verifying…" : "Verify face"}</Button>
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
          <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={participantStudents.length} />
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
    </OrganizerFrame>
  );
}
