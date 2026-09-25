import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ColDef } from "ag-grid-community";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity, AlertTriangle, ArrowLeft, Camera, Eye, FileDown, Filter, Play, RefreshCw, ScanLine, Search, Square, X } from "lucide-react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractMirroredFaceDescriptor, faceSimilarity } from "@/lib/biometrics/humanFace";
import { extractStudentNumber, studentIdentityMatchesPayload } from "@/lib/credentials/qrCredential";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { useHeader } from "@/app/providers/HeaderContext";

import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useEvents, useAttendanceRecords, useAttendanceSessions, useAttendanceSessionMutations, useAttendanceSubmissionMutations, useStudents, useEventMutations, useAuditLogMutations, useEventRescheduleMutation, useStudentCredentialStatuses, useNotifications } from "@/hooks/useRepositoryQueries";
import { dateKey, formatDisplayTime, formatLocalTime, manilaDateTimeToIso } from "@/lib/utils/date";
import { eventSessionSchema } from "@/lib/validations/events";
import { APP_ROUTES } from "@/lib/constants/routes";
import { hasCapability } from "@/lib/auth/permissions";
import { getWorkspaceRoute } from "@/lib/utils/workspaceRoutes";
import type { FinalizeAttendanceRecordInput } from "@/services/contracts";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type { PriorityLevel } from "@/types/enums";
import type { Event } from "@/types/domain";
import {
  eventScheduleLabel,
  isTodayEvent,
  resolveManualAttendanceLookup,
  shouldDisplayInEventTab,
  type AttendanceStatus,
  type EventRecord,
  type LateReason,
  type ManualAttendanceStatus
} from "@/features/organizer/utils/eventManagement";
import {
  loadOrganizerUiState,
  formatAttendanceMethod,
  type OrganizerCompletedEvent,
  type OrganizerAttendanceRow,
  type OrganizerEvent
} from "@/features/organizer/data/organizerUiStore";
import { exportTabularReport } from "@/features/organizer/utils/exportUtils";
import { ScannerStationsPanel } from "@/features/offline/ScannerStationsPanel";
import { confirmSupabaseConnectivity, desktopApi, endOfflineEvent, getManilaCalendarDate, getOfflineSessionEndState, identifyOfflineStudent, listOfflineEvents, prepareEventForOffline, recordOfflineAttendance, startOfflineEvent } from "@/features/offline/offlineService";
import { clearOfflineLiveSessionHandoff, readOfflineLiveSessionHandoff, rememberOfflineLiveSessionHandoff } from "@/features/offline/offlineLiveSessionHandoff";
import { resolveRecordedOrganizerAttendanceStatus, useAttendanceSummaries } from "@/features/organizer/hooks/useEventAttendance";
import { summarizeUniqueAttendance } from "@/features/organizer/utils/attendanceSummary";
import type { AttendanceCapturePhase, LocalAttendanceResult, OfflineStatus, PreparedEventPackage, PreparedEventParticipant } from "@/features/offline/types";
import { useOfflineEvent } from "@/features/offline/useOfflineEvent";
import { clearAttendancePhase, readAttendancePhase, writeAttendancePhase } from "@/features/organizer/attendancePhaseStorage";
import { advanceServerAttendanceCapturePhase, getServerAttendanceCapturePhase } from "@/features/organizer/attendancePhaseRepository";

// Event Records is organized around Today, Incoming, and Cancelled events.
// A live session is a full-page state entered after Start Session.
type EventTab = "today" | "incoming" | "cancelled";
type AttendanceMethod = "QR Code" | "Facial Recognition" | "Manual";
type EventFilters = {
  dateFrom: string;
  dateTo: string;
  venue: string;
  category: string;
  priority: "all" | PriorityLevel;
};
type EventReadiness = {
  participants: number;
  qrReady: number;
  facialReady: number;
};
type EventParticipantReadiness = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  qrReady: boolean;
  facialReady: boolean;
};
type EventOfflinePreparation = {
  packageStatus: OfflineStatus["packageStatus"];
  preparing?: boolean;
  error?: string;
};
const defaultAttendanceMethod: AttendanceMethod = "QR Code";
const minimumTimeOutIntervalMs = 60_000;
const scannerIdleSubmissionDelayMs = 1_000;
const duplicateQrSuppressionMs = 5_000;
const liveAttendanceDraftStoragePrefix = "plpass:live-attendance-draft:";

function attendanceMethodFromVerification(method?: string | null): AttendanceMethod {
  if (method === "facial") return "Facial Recognition";
  if (method === "manual") return "Manual";
  return "QR Code";
}

function verificationMethodFromAttendance(method: AttendanceMethod): "qr" | "facial" | "manual" {
  if (method === "Facial Recognition") return "facial";
  if (method === "Manual") return "manual";
  return "qr";
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRemoteUnverifiedWalkIn(row: DraftAttendanceRow): boolean {
  return row.studentId.startsWith("walkin:") && uuidPattern.test(row.id);
}

function matchesUnverifiedWalkInNumber(row: DraftAttendanceRow, studentNumber: string): boolean {
  if (!isRemoteUnverifiedWalkIn(row)) return false;
  return row.studentName.match(/(\d{2}-\d{5})\s*$/)?.[1] === studentNumber;
}

function isEditableScanTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable || target.matches("input, textarea, select")
  );
}

type AttendanceRow = OrganizerAttendanceRow & {
  /** Set when the student verifies a second time in the same live session. */
  checkOutTime?: string;
  /** False means the row is still awaiting the completion-gated feedback step. */
  isFinalized?: boolean;
};

type DraftAttendanceRow = AttendanceRow & {
  checkInAt: string;
  checkOutAt?: string;
};

type RemoteUnverifiedWalkIn = {
  id: string;
  studentNumber: string;
  timeIn: string;
  timeOut?: string | null;
  attendanceMethod: AttendanceMethod;
  checkoutAttendanceMethod?: AttendanceMethod;
};

type StoredLiveAttendanceDraft = {
  eventId: string;
  rows: DraftAttendanceRow[];
};

function liveAttendanceDraftStorageKey(sessionId: string) {
  return `${liveAttendanceDraftStoragePrefix}${sessionId}`;
}

function isDraftAttendanceRow(value: unknown): value is DraftAttendanceRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<DraftAttendanceRow>;
  return typeof row.id === "string"
    && typeof row.studentId === "string"
    && typeof row.studentName === "string"
    && typeof row.eventCode === "string"
    && typeof row.attendanceMethod === "string"
    && typeof row.attendanceStatus === "string"
    && typeof row.checkInAt === "string"
    && typeof row.checkInTime === "string";
}

function readLiveAttendanceDraft(sessionId: string, eventId: string): DraftAttendanceRow[] {
  try {
    const rawDraft = window.sessionStorage.getItem(liveAttendanceDraftStorageKey(sessionId));
    if (!rawDraft) return [];
    const draft = JSON.parse(rawDraft) as Partial<StoredLiveAttendanceDraft>;
    if (draft.eventId !== eventId || !Array.isArray(draft.rows)) return [];
    return draft.rows.filter(isDraftAttendanceRow);
  } catch {
    return [];
  }
}

type ActiveParticipantIdentity = {
  studentId: string;
  studentNumber: string;
  fullName: string;
};

type FinalizedSessionSummary = {
  totalParticipants: number;
  present: number;
  late: number;
  absent: number;
  attendanceRate: number;
  mostCommonLateReason: string;
};

type CompletedRecord = EventRecord & {
  present: number;
  late: number;
  absent: number;
  totalRegistered: number;
  attendanceRate: string;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  feedbackComments: string[];
};

const lateReasons: LateReason[] = ["Traffic / Commute", "Class or Academic Conflict", "Personal / Health", "Weather / Force Majeure", "Other"];

// Higher rank = more urgent. Used to sort events and to decide which side
// of a conflict "wins" the recommended slot.
const PRIORITY_RANK: Record<PriorityLevel, number> = {
  "Business-Critical": 3,
  "Time-Sensitive": 2,
  "Flexible": 1
};

function priorityTone(level: PriorityLevel) {
  if (level === "Business-Critical") {
    return "danger" as const;
  }
  if (level === "Time-Sensitive") {
    return "warning" as const;
  }
  return "muted" as const;
}

// Reschedule event form schema
const rescheduleEventSchema = z.object({
  venue: z.string().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().trim().min(5, "Provide a brief reason for rescheduling")
}).refine(
  (data) => !data.startTime || !data.endTime || data.endTime > data.startTime,
  {
    message: "End time must be after start time",
    path: ["endTime"]
  }
);

type RescheduleEventFormValues = z.infer<typeof rescheduleEventSchema>;

// Combined ranking score: priority tier first, impact score as a tiebreaker
// within the same tier. Events without an impact score are treated as 0
// impact for ordering purposes only (does not mutate the underlying data).
function priorityScore(event: EventRecord) {
  const tierScore = PRIORITY_RANK[event.priorityLevel] ?? 1;
  const impact = event.impactScore ?? 0;
  return tierScore * 1000 + impact;
}

function sortByPriority(events: EventRecord[]) {
  return [...events].sort((a, b) => priorityScore(b) - priorityScore(a));
}

function toTimeInputValue(value: string) {
  if (!value) return "";

  const trimmed = value.trim();
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]);
    const minutes = ampmMatch[2];
    const meridiem = ampmMatch[3].toUpperCase();

    if (meridiem === "AM" && hours === 12) hours = 0;
    if (meridiem === "PM" && hours < 12) hours += 12;

    return `${String(hours).padStart(2, "0")}:${minutes}`;
  }

  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const timeDate = new Date(`1970-01-01T${trimmed}`);
  if (!Number.isNaN(timeDate.getTime())) {
    return timeDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  return "";
}

function toMinutes(time: string) {
  // Accepts "HH:MM" (24h) or "hh:MM AM/PM" — falls back to 0 if unparsable
  // so a bad value never throws during conflict detection.
  const ampmMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]) % 12;
    if (ampmMatch[3].toUpperCase() === "PM") {
      hours += 12;
    }
    return hours * 60 + Number(ampmMatch[2]);
  }
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

function timeRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const startAMin = toMinutes(startA);
  const endAMin = toMinutes(endA);
  const startBMin = toMinutes(startB);
  const endBMin = toMinutes(endB);
  return startAMin < endBMin && startBMin < endAMin;
}

// Client-side conflict detection: same venue, same date, overlapping time
// window. This mirrors what get_conflicting_events() will do server-side,
// but runs against already-typed Event data so it works before the
// Supabase types are regenerated.
function findConflicts(event: EventRecord, candidates: EventRecord[]) {
  return candidates.filter((other) => {
    if (other.code === event.code) {
      return false;
    }
    if (other.venue !== event.venue || other.date !== event.date) {
      return false;
    }
    return timeRangesOverlap(event.startTime, event.endTime, other.startTime, other.endTime);
  });
}

function statusTone(status: AttendanceStatus | "Today" | "Incoming" | "Active" | "Completed" | "In progress") {
  if (status === "present" || status === "Active" || status === "Completed") {
    return "success" as const;
  }
  if (status === "late" || status === "Today" || status === "Incoming") {
    return "warning" as const;
  }
  if (status === "absent") {
    return "danger" as const;
  }
  return "muted" as const;
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(event: EventRecord, search: string) {
  const query = normalized(search);
  if (!query) {
    return true;
  }
  return [event.code, event.name, event.venue, event.category].some((item) => normalized(item).includes(query));
}


function countRows(rows: AttendanceRow[], participantCount: number, inferMissingRegisteredAsAbsent = false) {
  const summary = summarizeUniqueAttendance(
    rows.map((row) => ({ identity: row.studentId, attendanceStatus: row.attendanceStatus })),
    participantCount,
    inferMissingRegisteredAsAbsent
  );
  return { present: summary.present, late: summary.late, absent: summary.absent, rate: summary.attendanceRate };
}

function lateBreakdown(rows: AttendanceRow[]) {
  return lateReasons.map((reason) => ({
    reason,
    count: rows.filter((row) => row.lateReason === reason).length
  }));
}

function matchesEventFilters(event: EventRecord, filters: EventFilters) {
  return (
    (!filters.dateFrom || event.date >= filters.dateFrom) &&
    (!filters.dateTo || event.date <= filters.dateTo) &&
    (!filters.venue || event.venue === filters.venue) &&
    (!filters.category || event.category === filters.category) &&
    (filters.priority === "all" || event.priorityLevel === filters.priority)
  );
}

function canRecordTimeOut(timeIn: string, attemptedTimeOut: string) {
  return new Date(attemptedTimeOut).getTime() - new Date(timeIn).getTime() >= minimumTimeOutIntervalMs;
}

function alreadyRecordedAttendanceLabel(timeOut?: string | null) {
  return timeOut ? "Already Time In and Time Out" : "Already Time In";
}

function alreadyRecordedAttendanceDescription(timeOut?: string | null) {
  return timeOut
    ? "This record already has saved Time In and Time Out. Its original timestamps were kept."
    : "This record already has a saved Time In. Its original timestamp was kept.";
}

function summarizeFinalizedSession(rows: Array<{ studentId?: string; attendanceStatus: AttendanceStatus; lateReason?: string; isFinalized?: boolean; checkOutAt?: string }>, participantCount: number): FinalizedSessionSummary {
  const summary = summarizeUniqueAttendance(
    rows.map((row, index) => ({ identity: row.studentId ?? `row:${index}`, attendanceStatus: row.attendanceStatus })),
    participantCount,
    true
  );
  const present = summary.present;
  const late = summary.late;
  const absent = summary.absent;
  const submittedReasons = rows.filter((row) => row.attendanceStatus === "late" && Boolean(row.lateReason));
  const reasonCounts = new Map<string, number>();
  submittedReasons.forEach((row) => {
    const reason = row.lateReason;
    if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  });
  const [topReason, topCount = 0] = [...reasonCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];

  return {
    totalParticipants: participantCount,
    present,
    late,
    absent,
    attendanceRate: summary.attendanceRate,
    mostCommonLateReason: topCount ? topReason : late ? "Awaiting student submission" : "None"
  };
}

function localAttendanceRow(
  result: LocalAttendanceResult,
  eventCode: string,
  participant: Pick<PreparedEventParticipant, "studentId" | "displayName">
): DraftAttendanceRow {
  return {
    id: `offline-${result.record.localAttendanceUuid}`,
    studentId: participant.studentId,
    studentName: participant.displayName,
    eventCode,
    attendanceMethod: attendanceMethodFromVerification(result.record.identificationMethod),
    ...(result.record.checkoutIdentificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(result.record.checkoutIdentificationMethod) } : {}),
    checkInAt: result.record.timeIn,
    checkInTime: formatLocalTime(result.record.timeIn),
    ...(result.record.timeOut ? { checkOutAt: result.record.timeOut, checkOutTime: formatLocalTime(result.record.timeOut) } : {}),
    attendanceStatus: result.record.attendanceStatus,
    isFinalized: false,
    ...(result.record.lateReason ? { lateReason: result.record.lateReason as LateReason } : {})
  };
}

function upsertAttendanceRow(rows: DraftAttendanceRow[], next: DraftAttendanceRow) {
  const nextIdentity = attendanceRowIdentity(next);
  const existing = rows.find((row) => attendanceRowIdentity(row) === nextIdentity);
  if (!existing) return [...rows, next];
  // A checkout response must never relabel or re-time the existing check-in.
  // This also protects the immediate live table while the authoritative
  // attendance query is refetching in the background.
  const preservesExistingCheckIn = Boolean(existing.checkInAt && next.checkInAt === existing.checkInAt);
  // A pending-query refresh can start just before a QR checkout is stored. In
  // that case the refresh carries the old "no checkout" row and must not erase
  // the checkout which the scanner has just placed in the live table.
  const preservesExistingCheckOut = preservesExistingCheckIn
    && Boolean(existing.checkOutAt)
    && !next.checkOutAt;
  const mergedNext: DraftAttendanceRow = preservesExistingCheckIn
    ? {
      ...next,
      attendanceMethod: existing.attendanceMethod,
      checkInAt: existing.checkInAt,
      checkInTime: existing.checkInTime,
      ...(preservesExistingCheckOut
        ? {
          checkOutAt: existing.checkOutAt,
          checkOutTime: existing.checkOutTime
        }
        : {}),
      checkoutAttendanceMethod: next.checkoutAttendanceMethod ?? existing.checkoutAttendanceMethod
    }
    : next;
  let keptExisting = false;
  return rows
    .filter((row) => {
      if (attendanceRowIdentity(row) !== nextIdentity) return true;
      if (keptExisting) return false;
      keptExisting = true;
      return true;
    })
    .map((row) => attendanceRowIdentity(row) === nextIdentity ? { ...row, ...mergedNext, id: row.id } : row);
}

function attendanceRowIdentity(row: DraftAttendanceRow) {
  if (!row.studentId.startsWith("walkin:")) return row.studentId;
  const studentNumber = row.studentName.match(/(?:·|:)\s*(\d{2}-\d{5})\s*$/)?.[1]?.toUpperCase();
  return studentNumber ? `walkin-number:${studentNumber}` : row.studentId;
}

function ModalFrame({ children, onClose, width = "max-w-3xl" }: { children: ReactNode; onClose: () => void; width?: string }) {
  const modal = (
    <div className="fixed inset-0 z-[9999] flex h-dvh w-screen items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className={`max-h-[90vh] w-full overflow-hidden rounded-lg border bg-surface shadow-xl ${width}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-end border-b px-5 py-3">
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="max-h-[calc(90vh-58px)] overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
}

function eventFromStore(event: OrganizerEvent): EventRecord {
  // OrganizerEvent (the local UI store) predates priorityLevel/impactScore,
  // so events created outside the Supabase-backed Create Event flow default
  // to Flexible/no-impact-score until the store type is extended.
  const storeEvent = event as OrganizerEvent & { priorityLevel?: PriorityLevel; impactScore?: number | null };
  return {
    code: event.code,
    name: event.name,
    category: event.category,
    venue: event.venue,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    predictedTurnout: `${event.predictedTurnout}%`,
    objectives: event.objectives
    ,status: event.status,
    priorityLevel: storeEvent.priorityLevel ?? "Flexible",
    impactScore: storeEvent.impactScore ?? null
  };
}

function eventRecordFromRepository(event: Event, objectives: string[] = []): EventRecord {
  return {
    id: event.id,
    code: event.code,
    name: event.title,
    category: event.category,
    venue: event.venue,
    date: dateKey(event.startsAt),
    startTime: formatDisplayTime(event.startsAt, "08:00 AM"),
    endTime: formatDisplayTime(event.endsAt, "05:00 PM"),
    predictedTurnout: event.predictedTurnout == null ? "N/A" : `${event.predictedTurnout}%`,
    objectives,
    status: event.status,
    cancellationReason: event.cancellationReason,
    priorityLevel: event.priorityLevel,
    impactScore: event.impactScore,
    institutionalCategory: event.institutionalCategory,
    participationStatus: event.participationStatus,
    targetGroup: event.targetGroup,
    urgencyPoints: event.urgencyPoints,
    priorityScore: event.priorityScore,
    priorityTier: event.priorityTier,
    fixedPriority: event.fixedPriority
  };
}

function preferredOfflineSession(pkg: PreparedEventPackage) {
  return pkg.sessions.find((session) => ["START_PENDING", "STARTED", "NOT_STARTED"].includes(session.offlineLifecycle ?? ""))
    ?? pkg.sessions[0];
}

function eventRecordFromOfflinePackage(pkg: PreparedEventPackage): EventRecord {
  const localSession = preferredOfflineSession(pkg);
  return {
    id: pkg.event.id,
    code: pkg.event.code,
    name: pkg.event.title,
    category: "Offline event",
    venue: localSession?.venue ?? "Prepared offline event",
    date: dateKey(pkg.event.startsAt),
    startTime: formatDisplayTime(pkg.event.startsAt, "08:00 AM"),
    endTime: formatDisplayTime(pkg.event.endsAt, "05:00 PM"),
    predictedTurnout: "N/A",
    objectives: [],
    status: "today",
    priorityLevel: "Flexible",
    impactScore: null
  };
}

function completedFromStore(event: OrganizerCompletedEvent): CompletedRecord {
  return {
    ...eventFromStore(event),
    present: event.present,
    late: event.late,
    absent: event.absent,
    totalRegistered: event.totalRegistered,
    attendanceRate: `${event.attendanceRate}%`,
    sentiment: event.sentiment,
    feedbackComments: event.feedbackComments
  };
}

interface EditEventModalComponentProps {
  event: EventRecord;
  onClose: () => void;
  context?: RepositoryContext;
  onRescheduled?: (event: Event) => void;
}

function EditEventModalComponent({ event, onClose, context, onRescheduled }: EditEventModalComponentProps) {
  const rescheduleEventMutation = useEventRescheduleMutation(context);
  const form = useForm<RescheduleEventFormValues>({
    resolver: zodResolver(rescheduleEventSchema),
    defaultValues: {
      venue: event.venue || "",
      date: event.date || "",
      startTime: toTimeInputValue(event.startTime || ""),
      endTime: toTimeInputValue(event.endTime || ""),
      reason: ""
    }
  });

  async function onSubmit(values: RescheduleEventFormValues) {
    let newStart: string;
    try {
      newStart = manilaDateTimeToIso(values.date || event.date, toTimeInputValue(values.startTime || event.startTime));
    } catch {
      toast.error("Enter a valid date and start time.");
      return;
    }
    if (new Date(newStart).getTime() <= Date.now()) {
      toast.error("Choose a start time later than the current time.");
      return;
    }
    try {
      const updatedEvent = await rescheduleEventMutation.mutateAsync({
        eventId: event.id || "",
        venue: values.venue,
        date: values.date,
        startTime: toTimeInputValue(values.startTime || ""),
        endTime: toTimeInputValue(values.endTime || ""),
        reason: values.reason
      });
      onRescheduled?.(updatedEvent);
      onClose();
    } catch {
      // useEventRescheduleMutation reports the failure through its onError
      // handler; avoid showing the same error toast a second time here.
    }
  }

  return (
    <ModalFrame onClose={onClose} width="max-w-2xl">
      <h2 className="text-xl font-semibold">Reschedule Event</h2>
      <p className="mt-1 text-sm text-muted-foreground">{event.code} - {event.name}</p>
      <form className="mt-5 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Venue</label>
            <input 
              type="text"
              className="w-full rounded-lg border bg-background px-3 py-2"
              placeholder={event.venue}
              {...form.register("venue")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Date</label>
            <input 
              type="date"
              min={dateKey(new Date())}
              className="w-full rounded-lg border bg-background px-3 py-2"
              {...form.register("date")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Start Time</label>
            <input 
              type="time"
              className="w-full rounded-lg border bg-background px-3 py-2"
              {...form.register("startTime")}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">End Time</label>
            <input 
              type="time"
              className="w-full rounded-lg border bg-background px-3 py-2"
              {...form.register("endTime")}
            />
            {form.formState.errors.endTime && (
              <p className="text-sm text-danger">{form.formState.errors.endTime.message}</p>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Reschedule Reason</label>
          <textarea 
            className="w-full rounded-lg border bg-background px-3 py-2 min-h-[80px]"
            placeholder="Why is this event being rescheduled?"
            {...form.register("reason")}
          />
        </div>
        <p className="text-xs text-muted-foreground">To reschedule for today, choose a start time later than the current Manila time and an end time after it.</p>
        <div className="rounded-lg border bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-medium">Note:</p>
          <p className="mt-1">Rescheduling will archive all existing sessions for this event. Students will be notified of the change.</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            type="submit" 
            disabled={rescheduleEventMutation.isPending}
          >
            {rescheduleEventMutation.isPending ? "Rescheduling..." : "Reschedule Event"}
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function EventManagementPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceRoute = useCallback(
    (organizerRoute: string, adminRoute: string) => {
      if (location.pathname.startsWith("/department")) {
        // Keep the live-session query when translating an admin/organizer link
        // into the Department Admin event workspace. Dropping it silently sent
        // admins back to the directory instead of reopening the monitor.
        if (adminRoute.startsWith(`${APP_ROUTES.adminEvents}?`)) {
          return adminRoute.replace(APP_ROUTES.adminEvents, APP_ROUTES.departmentEvents);
        }
        if (organizerRoute.startsWith(`${APP_ROUTES.organizerEvents}?`)) {
          return organizerRoute.replace(APP_ROUTES.organizerEvents, APP_ROUTES.departmentEvents);
        }
        return APP_ROUTES.departmentEvents;
      }
      return getWorkspaceRoute(location.pathname, organizerRoute, adminRoute);
    },
    [location.pathname]
  );
  const { sessionId: sessionIdFromRoute } = useParams<{ sessionId?: string }>();
  const tabFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");

    if (tab === "incoming") return "incoming" as const;
    if (tab === "cancelled") return "cancelled" as const;
    return "today" as const;
  }, [location.search]);
  const sessionIdFromQuery = useMemo(
    () => sessionIdFromRoute ?? new URLSearchParams(location.search).get("session"),
    [location.search, sessionIdFromRoute]
  );
  const [activeTab, setActiveTab] = useState<EventTab>(tabFromQuery);
  const { setHeaderOverride } = useHeader();
  const [uiState] = useState(() => loadOrganizerUiState());
  const [search, setSearch] = useState("");
  const [eventFilters, setEventFilters] = useState<EventFilters>({ dateFrom: "", dateTo: "", venue: "", category: "", priority: "all" });
  const [cancelledCodes, setCancelledCodes] = useState<string[]>([]);
  const [eventAttention, setEventAttention] = useState<EventRecord | null>(null);
  const [editEvent, setEditEvent] = useState<EventRecord | null>(null);
  const [startEvent, setStartEvent] = useState<EventRecord | null>(null);
  const [rescheduleForStartId, setRescheduleForStartId] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<EventRecord | null>(null);
  const leavingReadOnlyMonitorRef = useRef(false);
  const activeEventId = activeEvent?.id;
  const [activeParticipantIdentities, setActiveParticipantIdentities] = useState<ActiveParticipantIdentity[] | null>(null);
  const [activeRows, setActiveRows] = useState<DraftAttendanceRow[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [finalizedSummary, setFinalizedSummary] = useState<FinalizedSessionSummary | null>(null);
  const [summaryEvent, setSummaryEvent] = useState<Pick<EventRecord, "id" | "code" | "name"> | null>(null);
  const [completedExtras] = useState<CompletedRecord[]>([]);
  const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);
  const [selectedEventForSession, setSelectedEventForSession] = useState<EventRecord | null>(null);
  const [readinessEvent, setReadinessEvent] = useState<EventRecord | null>(null);
  const [confirmCancelEvent, setConfirmCancelEvent] = useState<EventRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [captureMode, setCaptureMode] = useState<AttendanceMethod | null>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  // The successful offline-start IPC response is durable route authority for
  // this mounted workspace. It closes the renderer/IPC timing gap while the
  // session-specific package lookup catches up after a network transition.
  const [localStartPackage, setLocalStartPackage] = useState<PreparedEventPackage | null>(null);
  const [attendancePhase, setAttendancePhase] = useState<AttendanceCapturePhase>("time_in");
  const [endSessionConfirmOpen, setEndSessionConfirmOpen] = useState(false);
  const [endSessionReason, setEndSessionReason] = useState("");
  const [timeOutConfirmOpen, setTimeOutConfirmOpen] = useState(false);
  const [offlinePreparationByEventId, setOfflinePreparationByEventId] = useState<Map<string, EventOfflinePreparation>>(new Map());
  const [offlinePreparedPackages, setOfflinePreparedPackages] = useState<PreparedEventPackage[]>([]);
  const [offlinePreparedPackagesLoading, setOfflinePreparedPackagesLoading] = useState(false);
  const [qrInput, setQrInput] = useState("");
  const [isQrProcessing, setIsQrProcessing] = useState(false);
  const [facialCameraOpen, setFacialCameraOpen] = useState(false);
  const [facialVerifying, setFacialVerifying] = useState(false);
  const [facialStatus, setFacialStatus] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [manualEntryReason, setManualEntryReason] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);
  const [sessionForm, setSessionForm] = useState({
    venue: "",
    date: "",
    startTime: "",
    endTime: "",
    method: defaultAttendanceMethod,
    lateCutoffMinutes: 15
  });
  const qrScannerBufferRef = useRef("");
  const qrScannerFlushTimerRef = useRef<number | undefined>(undefined);
  const submitQrAttendanceRef = useRef<(code: string) => void>(() => undefined);
  const recentQrScansRef = useRef(new Map<string, number>());
  const qrSubmissionInFlightRef = useRef(false);
  const lastSuccessfulQrScanAtRef = useRef(0);
  const facialVideoRef = useRef<HTMLVideoElement>(null);
  const facialStreamRef = useRef<MediaStream | null>(null);
  const hydratedSessionIdRef = useRef<string | null>(null);
  const hydratedAttendanceDraftSessionIdRef = useRef<string | null>(null);
  const finalizedAttendanceSessionIdsRef = useRef(new Set<string>());
  const [attendanceDraftReadySessionId, setAttendanceDraftReadySessionId] = useState<string | null>(null);
  const [handledSessionRouteId, setHandledSessionRouteId] = useState<string | null>(null);
  const promptedLifecycleEventIdsRef = useRef(new Set<string>());

  const { session, isOfflineMode, reconciliationState } = useDevelopmentSession();
  const offlineLive = useOfflineEvent(undefined, sessionIdFromQuery ?? undefined);
  const routeStartHandoff = session?.userId && sessionIdFromQuery
    ? readOfflineLiveSessionHandoff(session.userId, sessionIdFromQuery)
    : null;
  const localStartFallbackMatchesRoute = Boolean(
    localStartPackage
    && sessionIdFromQuery
    && localStartPackage.sessions.some((item) => item.id === sessionIdFromQuery && ["START_PENDING", "STARTED"].includes(item.offlineLifecycle ?? ""))
  );
  // Prefer a completed owner-scoped database lookup, but never discard the
  // package returned by a successful local start just because a Wi-Fi change
  // causes that follow-up lookup to lag or fail temporarily.
  const offlineLivePackage = offlineLive.preparedEvent
    ?? (localStartFallbackMatchesRoute ? localStartPackage : null)
    ?? routeStartHandoff;
  const refreshOfflineLive = offlineLive.refresh;
  const previousReconciliationStateRef = useRef(reconciliationState);

  // The provider deliberately restores the Online badge before lifecycle
  // reconciliation completes. Once that reconciliation succeeds, reload this
  // package so a formerly local start stops being treated as authoritative and
  // normal QR submissions go straight to Supabase again.
  useEffect(() => {
    const reconciliationJustCompleted = previousReconciliationStateRef.current === "syncing"
      && reconciliationState === "idle";
    previousReconciliationStateRef.current = reconciliationState;
    if (reconciliationJustCompleted && !isOfflineMode) void refreshOfflineLive();
  }, [isOfflineMode, reconciliationState, refreshOfflineLive]);
  // The online student query is intentionally disabled while offline. Keep a
  // name lookup from the prepared package so live attendance never renders a
  // profile UUID as a student's name after a local scanner submission.
  const offlineParticipantNames = useMemo(() => new Map(
    (offlineLivePackage?.participants ?? [])
      .map((participant) => [participant.studentId, participant.displayName || participant.studentNumber] as const)
      .filter(([, displayName]) => Boolean(displayName))
  ), [offlineLivePackage]);
  const offlineLocalSession = useMemo(
    () => offlineLivePackage?.sessions.find((item) => item.id === sessionIdFromQuery),
    [offlineLivePackage, sessionIdFromQuery]
  );
  // Connectivity is presentation state. A locally started package remains the
  // authority for this exact session until its start has been reconciled, even
  // after the header has verified that the network is back.
  const hasLocallyResumableSession = Boolean(
    offlineLivePackage
    && offlineLocalSession
    && offlineLocalSession.eventId === offlineLivePackage.event.id
    && ["START_PENDING", "STARTED"].includes(offlineLocalSession.offlineLifecycle ?? "")
  );
  // A READY package can legitimately be addressed by an old live-session URL
  // while its session has not started yet. It belongs in the existing Events
  // flow, not in the "offline session unavailable" error state.
  const hasLocallyReadyUnstartedSession = Boolean(
    offlineLivePackage
    && offlineLocalSession
    && offlineLocalSession.eventId === offlineLivePackage.event.id
    && offlineLocalSession.offlineLifecycle === "NOT_STARTED"
  );
  const isLocalAuthoritativeSession = Boolean(
    hasLocallyResumableSession
    && (isOfflineMode || !offlineLocalSession?.offlineStartReconciledAt)
  );
  const offlineLiveSession = useMemo(() => {
    // A verified reconnect changes the header to Online before lifecycle
    // reconciliation and server queries finish. Keep a locally started
    // session valid as this route's fallback during that handoff; the server
    // session supersedes it as soon as it becomes available.
    // `getPreparedEventBySession` is owner-scoped and returns only READY
    // packages. Do not wait for the separate status read as well: it can
    // briefly still hold its prior value after the package has loaded.
    if (!offlineLocalSession || !offlineLivePackage || !hasLocallyResumableSession) return undefined;
    return {
      id: offlineLocalSession.id,
      type: "event" as const,
      eventId: offlineLocalSession.eventId,
      title: offlineLocalSession.title || offlineLivePackage.event.title,
      mode: "face-to-face" as const,
      status: "active" as const,
      startsAt: offlineLocalSession.startsAt,
      endsAt: offlineLocalSession.endsAt,
      lateCutoffAt: offlineLocalSession.lateCutoffAt,
      attendanceWindowStartAt: offlineLocalSession.attendanceWindowStartAt ?? offlineLocalSession.offlineStartedAt,
      attendanceWindowEndAt: offlineLocalSession.attendanceWindowEndAt,
      createdAt: offlineLivePackage.preparedAt,
      createdByUserId: "offline-cache"
    };
  }, [hasLocallyResumableSession, offlineLivePackage, offlineLocalSession]);
  const offlineLiveEvent = useMemo<EventRecord | undefined>(() => {
    if (!offlineLivePackage || !offlineLocalSession || !offlineLiveSession) return undefined;
    return {
      id: offlineLivePackage.event.id,
      code: offlineLivePackage.event.code,
      name: offlineLivePackage.event.title,
      category: "Offline event",
      venue: offlineLocalSession.venue,
      date: dateKey(offlineLivePackage.event.startsAt),
      startTime: formatDisplayTime(offlineLivePackage.event.startsAt, "08:00 AM"),
      endTime: formatDisplayTime(offlineLivePackage.event.endsAt, "05:00 PM"),
      predictedTurnout: "N/A",
      objectives: [],
      status: "ongoing",
      priorityLevel: "Flexible",
      impactScore: null
    };
  }, [offlineLivePackage, offlineLiveSession, offlineLocalSession]);
  useEffect(()=>{
    if(!session?.userId)return;
    try{
      const failures=JSON.parse(window.localStorage.getItem(`plpass-offline-package-failures:${session.userId}:${getManilaCalendarDate()}`)??"{}") as Record<string,string>;
      setOfflinePreparationByEventId(new Map(Object.entries(failures).map(([eventId,error])=>[eventId,{packageStatus:"INCOMPLETE",error}])));
    }catch{setOfflinePreparationByEventId(new Map());}
  },[session?.userId]);
  const isAdmin = session?.role === "admin";
  const isDepartmentAdmin = session?.role === "department_admin";
  const isReadOnlyMonitor = isAdmin || isDepartmentAdmin;
  const canManageOwnedEvents = session ? hasCapability(session.role, "events.manage.owned") : false;
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined),
    [session]
  );
  useEffect(() => {
    let current = true;
    if (!isOfflineMode || session?.role !== "organizer" || !session.userId) {
      setOfflinePreparedPackages([]);
      setOfflinePreparedPackagesLoading(false);
      return () => { current = false; };
    }
    const api = desktopApi();
    if (!api) {
      setOfflinePreparedPackages([]);
      setOfflinePreparedPackagesLoading(false);
      return () => { current = false; };
    }
    setOfflinePreparedPackagesLoading(true);
    void (async () => {
      const summaries = await listOfflineEvents(session.userId);
      const packages = await Promise.all(summaries.map((summary) => api.getPreparedEvent(summary.event.id, session.userId)));
      if (current) setOfflinePreparedPackages(packages.filter((pkg): pkg is PreparedEventPackage => pkg !== null));
    })().catch(() => {
      if (current) setOfflinePreparedPackages([]);
    }).finally(() => {
      if (current) setOfflinePreparedPackagesLoading(false);
    });
    return () => { current = false; };
  }, [isOfflineMode, session?.role, session?.userId]);
  const offlinePackageByEventId = useMemo(
    () => new Map(offlinePreparedPackages.map((pkg) => [pkg.event.id, pkg])),
    [offlinePreparedPackages]
  );
  useEffect(() => {
    if (isOfflineMode) setActiveTab("today");
  }, [isOfflineMode]);
  // A valid prepared package is the authoritative source for offline live
  // attendance. Do not start remote list queries while disconnected: their
  // expected failure used to win the render race and hide the local session.
  const eventsQuery = useEvents({ pageSize: 100 }, context, !isOfflineMode);
  const attendanceSessionsQuery = useAttendanceSessions({ pageSize: 200 }, context, !isOfflineMode);
  const lifecycleNotificationsQuery = useNotifications(
    { pageSize: 100, notificationCode: "event.lifecycle.unstarted" },
    isOfflineMode ? undefined : context
  );
  const sessionsList = useMemo(() => attendanceSessionsQuery.data?.items ?? [], [attendanceSessionsQuery.data?.items]);
  const activeAttendanceSession = useMemo(
    () =>
      sessionsList.find((item) => item.id === liveSessionId && item.status === "active")
      ?? sessionsList.find((item) => item.eventId === activeEvent?.id && item.status === "active")
      ?? offlineLiveSession,
    [activeEvent?.id, liveSessionId, offlineLiveSession, sessionsList]
  );
  const activeScannerSessionId = liveSessionId ?? activeAttendanceSession?.id;
  const attendanceRecordsQuery = useAttendanceRecords(
    { pageSize: 500, sessionId: activeScannerSessionId },
    activeScannerSessionId ? context : undefined,
    !isOfflineMode
  );
  // A locally started session remains the source of truth until its start is
  // reconciled, even if connectivity briefly returns.
  const liveAttendanceSummaryQuery = useAttendanceSummaries(activeEvent?.id ? [activeEvent.id] : [], !isLocalAuthoritativeSession);
  const { refetch: refetchAttendanceRecords } = attendanceRecordsQuery;
  const findRemoteUnverifiedWalkIn = useCallback(async (studentNumber: string): Promise<RemoteUnverifiedWalkIn | undefined> => {
    const matchingVisibleRows = activeRows.filter((row) => matchesUnverifiedWalkInNumber(row, studentNumber));
    if (matchingVisibleRows.length > 1) {
      throw new Error("Multiple walk-in records match this student number. Resolve the duplicate before recording attendance.");
    }
    const visibleRow = matchingVisibleRows[0];
    if (visibleRow) {
      return {
        id: visibleRow.studentId.slice("walkin:".length),
        studentNumber,
        timeIn: visibleRow.checkInAt,
        timeOut: visibleRow.checkOutAt,
        attendanceMethod: visibleRow.attendanceMethod,
        checkoutAttendanceMethod: visibleRow.checkoutAttendanceMethod,
      };
    }

    // A walk-in may already have synchronized and therefore no longer be in
    // the desktop queue or the browser draft. Check the owned live session
    // before accepting another Time In or routing Time Out to the local queue.
    if (!activeEvent?.id || !activeScannerSessionId) return undefined;
    const client = getSupabaseBrowserClient();
    const { data, error } = await client
      .from("unverified_walkin_attendance" as never)
      .select("id, student_number, identification_method, checkout_identification_method, time_in, time_out")
      .eq("event_id", activeEvent.id)
      .eq("event_session_id", activeScannerSessionId)
      .eq("student_number", studentNumber)
      .limit(2);
    if (error) {
      // An unavailable server must not prevent an offline package from using
      // its local duplicate protection and queued Time Out path.
      if (!navigator.onLine || /fetch|network|offline|timeout|connection/i.test(error.message ?? "")) return undefined;
      throw new Error(error.message);
    }
    const matches = (data ?? []) as Array<{
      id: string;
      student_number: string;
      identification_method: string | null;
      checkout_identification_method?: string | null;
      time_in: string;
      time_out?: string | null;
    }>;
    if (matches.length > 1) {
      throw new Error("Multiple walk-in records match this student number. Resolve the duplicate before recording attendance.");
    }
    const walkIn = matches[0];
    return walkIn ? {
      id: walkIn.id,
      studentNumber: walkIn.student_number,
      timeIn: walkIn.time_in,
      timeOut: walkIn.time_out,
      attendanceMethod: attendanceMethodFromVerification(walkIn.identification_method),
      ...(walkIn.checkout_identification_method
        ? { checkoutAttendanceMethod: attendanceMethodFromVerification(walkIn.checkout_identification_method) }
        : {}),
    } : undefined;
  }, [activeEvent?.id, activeRows, activeScannerSessionId]);
  const recordRemoteUnverifiedWalkInTimeOut = useCallback(async (
    walkIn: RemoteUnverifiedWalkIn,
    method: Extract<AttendanceMethod, "QR Code" | "Manual">,
    occurredAt: string
  ) => {
    if (!uuidPattern.test(walkIn.id)) {
      throw new Error("This walk-in cannot be checked out from the server.");
    }
    if (walkIn.timeOut) {
      throw new Error(`Unverified walk-in ${walkIn.studentNumber} already has a Time In and Time Out.`);
    }
    if (!canRecordTimeOut(walkIn.timeIn, occurredAt)) {
      throw new Error("Time Out can be recorded at least one minute after Time In.");
    }
    const client = getSupabaseBrowserClient() as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
    const { error } = await client.rpc("record_unverified_walkin_checkout", {
      p_walkin_id: walkIn.id,
      p_checkout_identification_method: verificationMethodFromAttendance(method),
      p_time_out: occurredAt
    });
    if (error) throw error;
    setActiveRows((rows) => upsertAttendanceRow(rows, {
      id: walkIn.id,
      studentId: `walkin:${walkIn.id}`,
      studentName: `Unverified walk-in · ${walkIn.studentNumber}`,
      eventCode: activeEvent?.code ?? "",
      attendanceMethod: walkIn.attendanceMethod,
      checkInAt: walkIn.timeIn,
      checkInTime: formatLocalTime(walkIn.timeIn),
      checkOutAt: occurredAt,
      checkOutTime: formatLocalTime(occurredAt),
      checkoutAttendanceMethod: method,
      attendanceStatus: resolveRecordedOrganizerAttendanceStatus({
        timeIn: walkIn.timeIn,
        timeOut: occurredAt,
        attendanceSessionStatus: activeAttendanceSession?.status,
        lateCutoffAt: activeAttendanceSession?.lateCutoffAt,
      }),
      isFinalized: false,
    }));
    await refetchAttendanceRecords();
  }, [activeAttendanceSession?.lateCutoffAt, activeAttendanceSession?.status, activeEvent?.code, refetchAttendanceRecords]);
  const { createEventSessionMutation, endSessionMutation } = useAttendanceSessionMutations(context);
  const { credentialScanMutation, manualAttendanceMutation } = useAttendanceSubmissionMutations(context);
  const { completeEventMutation, cancelEventMutation } = useEventMutations(context);
  const auditLogMutations = useAuditLogMutations(context);
  const [objectivesByEventId, setObjectivesByEventId] = useState<Map<string, string[]>>(new Map());
  const [participantStudentIdsByEventId, setParticipantStudentIdsByEventId] = useState<Map<string, string[]>>(new Map());
  const [selectedObjectivesEvent, setSelectedObjectivesEvent] = useState<EventRecord | null>(null);

  const studentsQuery = useStudents({ pageSize: 200 }, context, !isOfflineMode);
  const credentialStudentIds = useMemo(
    () => [...new Set([...participantStudentIdsByEventId.values()].flat())].sort(),
    [participantStudentIdsByEventId]
  );
  const credentialStatusesQuery = useStudentCredentialStatuses(context, credentialStudentIds, !isOfflineMode);

  useEffect(() => {
    if (!canManageOwnedEvents || attendanceSessionsQuery.isLoading || lifecycleNotificationsQuery.isLoading) return;
    const eventsById = new Map((eventsQuery.data?.items ?? []).map((event) => [event.id, event]));
    const attentionNotification = (lifecycleNotificationsQuery.data?.items ?? []).find((notification) => {
      const event = notification.referenceId ? eventsById.get(notification.referenceId) : undefined;
      if (!event || event.status === "completed" || event.status === "cancelled" || promptedLifecycleEventIdsRef.current.has(event.id)) return false;
      return !sessionsList.some((session) => session.eventId === event.id && !["scheduled", "cancelled"].includes(session.status));
    });
    if (!attentionNotification?.referenceId) return;
    const event = eventsById.get(attentionNotification.referenceId);
    if (!event) return;
    promptedLifecycleEventIdsRef.current.add(event.id);
    setEventAttention(eventRecordFromRepository(event));
  }, [attendanceSessionsQuery.isLoading, canManageOwnedEvents, eventsQuery.data?.items, lifecycleNotificationsQuery.data?.items, lifecycleNotificationsQuery.isLoading, sessionsList]);
  // A newly started live session stays local until End Session. Only reuse an
  // already persisted ongoing session when opening the separate verification view.
  const resolvedLiveSessionId = useMemo(
    () =>
      sessionsList.find((attendanceSession) => attendanceSession.id === liveSessionId && attendanceSession.status === "active")?.id
      ?? sessionsList.find((attendanceSession) => attendanceSession.eventId === activeEvent?.id && attendanceSession.status === "active")?.id,
    [activeEvent?.id, liveSessionId, sessionsList]
  );
  const monitorRows = useMemo<AttendanceRow[]>(() => {
    if (!isReadOnlyMonitor || !resolvedLiveSessionId) return [];
    return (attendanceRecordsQuery.data?.items ?? [])
      .filter((record) => record.sessionId === resolvedLiveSessionId)
      .map((record) => {
        const student = (studentsQuery.data?.items ?? []).find((candidate) => candidate.id === record.studentId);
        return {
          id: record.id,
          studentId: record.studentId,
          studentName: student?.fullName ?? student?.studentNumber ?? record.studentId,
          eventCode: activeEvent?.code ?? "",
          attendanceMethod: attendanceMethodFromVerification(record.verificationMethod),
          ...(record.checkoutVerificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(record.checkoutVerificationMethod) } : {}),
          checkInTime: formatLocalTime(record.timeIn ?? record.recordedAt),
          ...(record.checkedOutAt ? { checkOutTime: formatLocalTime(record.checkedOutAt) } : {}),
          attendanceStatus: record.status === "late" ? "late" : record.status === "absent" ? "absent" : "present",
          isFinalized: Boolean(record.finalizedAt),
          ...(record.lateReason ? { lateReason: record.lateReason as LateReason } : {})
        };
      });
  }, [activeEvent?.code, attendanceRecordsQuery.data?.items, isReadOnlyMonitor, resolvedLiveSessionId, studentsQuery.data?.items]);

  useEffect(() => {
    if (!isReadOnlyMonitor || !resolvedLiveSessionId) return;
    const timer = window.setInterval(() => { void refetchAttendanceRecords(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [isReadOnlyMonitor, refetchAttendanceRecords, resolvedLiveSessionId]);
  useEffect(() => {
    setActiveTab(tabFromQuery);
  }, [tabFromQuery]);

  useEffect(() => {
    if (captureMode !== "Facial Recognition" || !facialCameraOpen) {
      facialStreamRef.current?.getTracks().forEach((track) => track.stop());
      facialStreamRef.current = null;
      if (facialVideoRef.current) facialVideoRef.current.srcObject = null;
      return;
    }

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
  }, [captureMode, facialCameraOpen]);

  // Fetch objectives for all events from Supabase
  useEffect(() => {
    if (isOfflineMode) {
      setParticipantStudentIdsByEventId(new Map(offlinePreparedPackages.map((pkg) => [
        pkg.event.id,
        pkg.participants.filter((participant) => participant.isParticipant !== false).map((participant) => participant.studentId)
      ])));
      return;
    }
    const eventIds = (eventsQuery.data?.items ?? [])
      .map((event) => event.id)
      .filter((eventId) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId));
    if (eventIds.length === 0) return;

    const fetchAllObjectives = async () => {
      const map = new Map<string, string[]>();
      const client = getSupabaseBrowserClient();
      
      try {
        // Fetch all objectives for these events in a single query
        const { data, error } = await client
          .from("event_objectives")
          .select("event_id, objective_text, objective_order")
          .in("event_id", eventIds)
          .order("objective_order", { ascending: true });
        
        if (error) {
          console.error("Error fetching objectives:", error);
          return;
        }
        
        // Group objectives by event_id
        if (data && Array.isArray(data)) {
          data.forEach((obj) => {
            const eventId = obj.event_id;
            const text = obj.objective_text ?? "";
            
            if (eventId && text) {
              if (!map.has(eventId)) {
                map.set(eventId, []);
              }
              map.get(eventId)?.push(text);
            }
          });
        }
        
        setObjectivesByEventId(map);
      } catch (error) {
        console.error("Failed to fetch event objectives:", error);
      }
    };

    void fetchAllObjectives();
  }, [eventsQuery.data?.items, isOfflineMode, offlinePreparedPackages]);

  // The live attendance card and QR matcher must use the active event's full
  // participant list, rather than a paginated student list or a background
  // readiness cache. Fetch the participant IDs first, then their identities.
  useEffect(() => {
    if (!activeEventId) {
      setActiveParticipantIdentities(null);
      return;
    }
    if (isOfflineMode && offlineLivePackage?.event.id === activeEventId) {
      setActiveParticipantIdentities(offlineLivePackage.participants.map((participant) => ({
        studentId: participant.studentId,
        studentNumber: participant.studentNumber,
        fullName: participant.displayName
      })));
      return;
    }
    // Repository-backed event IDs are UUIDs. Mock/demo event IDs must not be
    // sent to Postgres, and this also keeps isolated UI tests credential-free.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activeEventId)) {
      setActiveParticipantIdentities([]);
      return;
    }

    let current = true;
    setActiveParticipantIdentities(null);
    const loadActiveParticipants = async () => {
      let client: ReturnType<typeof getSupabaseBrowserClient>;
      try {
        client = getSupabaseBrowserClient();
      } catch {
        // The browser client is deliberately absent in isolated UI tests and
        // offline setup screens. Attendance capture remains unavailable until
        // a real event participant list can be loaded.
        if (current) setActiveParticipantIdentities([]);
        return;
      }
      const { data: participantRows, error: participantError } = await client
        .from("event_participants")
        .select("student_id")
        .eq("event_id", activeEventId)
        .neq("participant_status", "removed");
      if (participantError) {
        console.error("Failed to load active event participants:", participantError);
        if (current) setActiveParticipantIdentities([]);
        return;
      }

      const participantIds = [...new Set((participantRows ?? []).map((row) => String(row.student_id ?? "")).filter(Boolean))];
      if (!participantIds.length) {
        if (current) setActiveParticipantIdentities([]);
        return;
      }

      const { data: studentRows, error: studentError } = await client
        .from("students")
        .select("id, student_id, profiles(first_name, middle_name, last_name, name_extension)")
        .in("id", participantIds);
      if (studentError) {
        console.error("Failed to load active participant identities:", studentError);
        if (current) setActiveParticipantIdentities([]);
        return;
      }

      const identities = (studentRows ?? []).map((student) => {
        const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
        return {
          studentId: String(student.id),
          studentNumber: String(student.student_id ?? ""),
          fullName: [profile?.first_name, profile?.middle_name, profile?.last_name, profile?.name_extension].filter(Boolean).join(" ")
        };
      });
      if (current) setActiveParticipantIdentities(identities);
    };

    void loadActiveParticipants();
    return () => { current = false; };
  }, [activeEventId, isOfflineMode, offlineLivePackage]);

  useEffect(() => {
    const eventIds = (eventsQuery.data?.items ?? [])
      .filter((event) => event.status !== "completed" && event.status !== "cancelled")
      .map((event) => event.id)
      .filter((eventId) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId));

    if (eventIds.length === 0) {
      setParticipantStudentIdsByEventId(new Map());
      return;
    }

    let isCurrent = true;
    const fetchParticipants = async () => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("event_participants")
        .select("event_id, student_id")
        .in("event_id", eventIds)
        .neq("participant_status", "removed");

      if (error) {
        console.error("Failed to load event readiness:", error);
        return;
      }

      const next = new Map<string, string[]>();
      (data ?? []).forEach((participant) => {
        if (!participant.event_id || !participant.student_id) return;
        const studentIds = next.get(participant.event_id) ?? [];
        studentIds.push(participant.student_id);
        next.set(participant.event_id, studentIds);
      });
      if (isCurrent) setParticipantStudentIdsByEventId(next);
    };

    void fetchParticipants();
    return () => {
      isCurrent = false;
    };
  }, [eventsQuery.data?.items]);

  const repositoryEvents = useMemo<EventRecord[]>(() => {
    if (isOfflineMode) return offlinePreparedPackages.map(eventRecordFromOfflinePackage);
    return (eventsQuery.data?.items ?? [])
      .filter((event) => event.status !== "completed" && event.status !== "cancelled")
      .map((event) => eventRecordFromRepository(event, objectivesByEventId.get(event.id) ?? []));
  }, [eventsQuery.data?.items, isOfflineMode, objectivesByEventId, offlinePreparedPackages]);

  const cancelledEvents = useMemo(
    () => (isOfflineMode ? [] : eventsQuery.data?.items ?? [])
      .filter((event) => event.status === "cancelled")
      .map((event) => eventRecordFromRepository(event, objectivesByEventId.get(event.id) ?? []))
      .filter((event) => matchesSearch(event, search) && matchesEventFilters(event, eventFilters)),
    [eventFilters, eventsQuery.data?.items, isOfflineMode, objectivesByEventId, search]
  );

  // Use only Supabase data (repositoryEvents), not UI store events
  const storeEvents = useMemo(
    () => repositoryEvents,
    [repositoryEvents]
  );

  const persistedActiveSession = useMemo(
    () => sessionsList.find((attendanceSession) =>
      attendanceSession.status === "active" &&
      Boolean(attendanceSession.eventId) &&
      repositoryEvents.some((event) => event.id === attendanceSession.eventId)
    ),
    [repositoryEvents, sessionsList]
  );

  // Rehydrate a live event from persisted session data after a reload or
  // logout/login for organizers. Admins monitor events, so visiting their
  // Events directory must never force them into one active event.
  useEffect(() => {
    if (isReadOnlyMonitor || sessionIdFromQuery || activeEvent || liveSessionId || attendanceSessionsQuery.isFetching || eventsQuery.isFetching) return;
    if (!persistedActiveSession?.eventId) return;
    const persistedEvent = repositoryEvents.find((event) => event.id === persistedActiveSession.eventId);
    if (!persistedEvent) return;

    hydratedSessionIdRef.current = persistedActiveSession.id;
    setActiveEvent(persistedEvent);
    setLiveSessionId(persistedActiveSession.id);
    setActiveRows([]);
    setCaptureMode(defaultAttendanceMethod);
    setAttendancePhase(readAttendancePhase(window.sessionStorage, persistedActiveSession.id));
    setManualInput("");
    setQrInput("");
  }, [activeEvent, attendanceSessionsQuery.isFetching, eventsQuery.isFetching, isReadOnlyMonitor, liveSessionId, persistedActiveSession, repositoryEvents, sessionIdFromQuery]);

  useEffect(() => {
    if (leavingReadOnlyMonitorRef.current) {
      if (!sessionIdFromQuery && !activeEvent && !liveSessionId) leavingReadOnlyMonitorRef.current = false;
      return;
    }
    if (!sessionIdFromQuery) {
      setHandledSessionRouteId(null);
      return;
    }

    const serverRequestedSession = sessionsList.find((session) => session.id === sessionIdFromQuery);
    const serverRequestedEvent = serverRequestedSession
      ? repositoryEvents.find((event) => event.id === serverRequestedSession.eventId)
      : undefined;
    const requestedSession = serverRequestedSession ?? offlineLiveSession;
    const requestedEvent = serverRequestedEvent ?? offlineLiveEvent;

    // The local package is authoritative for a valid offline live session.
    // Wait for its read model before deciding that a direct route is invalid;
    // the remote queries are expected to fail while disconnected.
    // Do not reject a freshly started offline event while its session-specific
    // package read is still in flight. The hook's previous empty result may
    // belong to the Events list rather than this new live-session route.
    if (offlineLive.isLoading) return;

    if (!requestedSession || requestedSession.status !== "active" || !requestedEvent) {
      // Network changes can make the server-side session read disappear before
      // the offline-mode transition is rendered. A locally READY, unstarted
      // package is still valid; return it to the normal Events grid so the
      // organizer can start it locally instead of treating it as missing.
      if (hasLocallyReadyUnstartedSession) {
        setActiveEvent(null);
        setLiveSessionId(null);
        setActiveRows([]);
        setCaptureMode(null);
        setFacialCameraOpen(false);
        setHandledSessionRouteId(sessionIdFromQuery);
        navigate(workspaceRoute(APP_ROUTES.organizerEvents, APP_ROUTES.adminEvents), { replace: true });
        return;
      }
      // While disconnected, a failed or missing local lookup must remain on
      // the session route for recovery instead of silently replacing it with
      // the Events list. A later retry/reconnect can still resolve it.
      if (isOfflineMode) {
        setHandledSessionRouteId(sessionIdFromQuery);
        return;
      }
      if (!attendanceSessionsQuery.isFetching && !eventsQuery.isFetching) {
        // A session may have been ended or discarded in another organizer view.
        // Never leave its stale in-memory workspace open with live controls.
        if (activeEvent || liveSessionId) {
          setActiveEvent(null);
          setLiveSessionId(null);
          setActiveRows([]);
          setCaptureMode(null);
          setFacialCameraOpen(false);
          toast.info("This attendance session is no longer active. Returned to Events.");
        }
        setHandledSessionRouteId(sessionIdFromQuery);
        navigate(workspaceRoute(APP_ROUTES.organizerEvents, APP_ROUTES.adminEvents), { replace: true });
      }
      return;
    }

    setActiveEvent(requestedEvent);
    setLiveSessionId(requestedSession.id);
    setHandledSessionRouteId(sessionIdFromQuery);
    if (hydratedSessionIdRef.current !== requestedSession.id) {
      hydratedSessionIdRef.current = requestedSession.id;
      setActiveRows([]);
      setCaptureMode(defaultAttendanceMethod);
      setAttendancePhase(readAttendancePhase(window.sessionStorage, requestedSession.id));
      setManualInput("");
      setQrInput("");
    }
  }, [attendanceSessionsQuery.isFetching, eventsQuery.isFetching, hasLocallyReadyUnstartedSession, isOfflineMode, offlineLive.isLoading, liveSessionId, navigate, offlineLiveEvent, offlineLiveSession, repositoryEvents, sessionIdFromQuery, sessionsList, activeEvent, workspaceRoute]);

  // The renderer can unmount when an organizer visits another screen, but the
  // Electron scanner coordinator remains alive in the main process. Restore
  // its session-scoped phase when returning so the UI and phone scanners agree.
  useEffect(() => {
    const api = desktopApi();
    if (!api || !activeEvent?.id || !activeScannerSessionId || !session?.userId) return;
    let current = true;
    const hasRecordedTimeOut = (attendanceRecordsQuery.data?.items ?? []).some(
      (record) => record.sessionId === activeScannerSessionId && Boolean(record.checkedOutAt)
    );
    const browserPhase = readAttendancePhase(window.sessionStorage, activeScannerSessionId);
    const applyPhase = (phase: AttendanceCapturePhase) => {
      if (!current) return;
      const resolved: AttendanceCapturePhase = hasRecordedTimeOut || browserPhase === "time_out" ? "time_out" : phase;
      writeAttendancePhase(window.sessionStorage, activeScannerSessionId, resolved);
      setAttendancePhase(resolved);
    };
    if (hasRecordedTimeOut || browserPhase === "time_out") setAttendancePhase("time_out");
    void api.getAttendanceCapturePhase(activeScannerSessionId,session.userId).then(async(phase)=>{
      applyPhase(phase);
      const scanner=await api.getScannerStations();
      const resolved: AttendanceCapturePhase = hasRecordedTimeOut || browserPhase === "time_out" ? "time_out" : phase;
      if(current&&scanner.active&&scanner.eventId===activeEvent.id&&scanner.sessionId===activeScannerSessionId&&scanner.capturePhase!==resolved) await api.setScannerCapturePhase(resolved);
    }).catch(async () => {
      try { applyPhase(await getServerAttendanceCapturePhase(activeScannerSessionId)); }
      catch { applyPhase("time_in"); }
    });
    return () => { current = false; };
  }, [activeEvent?.id, activeScannerSessionId, attendanceRecordsQuery.data?.items, session?.userId]);

  // Keep the live workspace addressable as its own session view. This also
  // gives the floating session shortcut a reliable route to detect and hide.
  useEffect(() => {
    if (leavingReadOnlyMonitorRef.current) return;
    if (activeEvent && liveSessionId && !sessionIdFromQuery) {
      navigate(workspaceRoute(APP_ROUTES.organizerLiveSession(liveSessionId), APP_ROUTES.adminLiveSession(liveSessionId)), { replace: true });
    }
  }, [activeEvent, liveSessionId, navigate, sessionIdFromQuery, workspaceRoute]);

  const readinessByEventId = useMemo(() => {
    const credentialStatusByStudentId = new Map((credentialStatusesQuery.data ?? []).map((status) => [status.studentId, status]));
    const now = Date.now();
    const readiness = new Map<string, EventReadiness>();

    repositoryEvents.forEach((event) => {
      if (!event.id) return;
      const localPackage = isOfflineMode ? offlinePackageByEventId.get(event.id) : undefined;
      if (localPackage) {
        const participants = localPackage.participants.filter((participant) => participant.isParticipant !== false);
        readiness.set(event.id, {
          participants: participants.length,
          qrReady: participants.filter((participant) => Boolean(participant.qrIdentifier)).length,
          facialReady: participants.filter((participant) => participant.faceEmbeddings.length > 0).length
        });
        return;
      }
      const participantIds = participantStudentIdsByEventId.get(event.id) ?? [];
      const qrReady = participantIds.filter((studentId) => {
        const credential = credentialStatusByStudentId.get(studentId)?.qrCredential;
        return credential?.status === "activated" && !credential.revokedAt && (!credential.expiresAt || new Date(credential.expiresAt).getTime() > now);
      }).length;
      const facialReady = participantIds.filter((studentId) => credentialStatusByStudentId.get(studentId)?.facialProfile?.status === "activated").length;

      readiness.set(event.id, { participants: participantIds.length, qrReady, facialReady });
    });
    return readiness;
  }, [credentialStatusesQuery.data, isOfflineMode, offlinePackageByEventId, participantStudentIdsByEventId, repositoryEvents]);
  const participantReadinessByEventId = useMemo(() => {
    const credentialStatusByStudentId = new Map((credentialStatusesQuery.data ?? []).map((status) => [status.studentId, status]));
    const studentById = new Map((studentsQuery.data?.items ?? []).map((student) => [student.id, student]));
    const now = Date.now();
    const participantReadiness = new Map<string, EventParticipantReadiness[]>();

    repositoryEvents.forEach((event) => {
      if (!event.id) return;
      const localPackage = isOfflineMode ? offlinePackageByEventId.get(event.id) : undefined;
      if (localPackage) {
        participantReadiness.set(event.id, localPackage.participants
          .filter((participant) => participant.isParticipant !== false)
          .map((participant) => ({
            studentId: participant.studentId,
            studentName: participant.displayName,
            studentNumber: participant.studentNumber,
            qrReady: Boolean(participant.qrIdentifier),
            facialReady: participant.faceEmbeddings.length > 0
          })));
        return;
      }
      const participants = (participantStudentIdsByEventId.get(event.id) ?? []).map((studentId) => {
        const credentialStatus = credentialStatusByStudentId.get(studentId);
        const qrCredential = credentialStatus?.qrCredential;
        const student = studentById.get(studentId);
        const qrReady = qrCredential?.status === "activated" && !qrCredential.revokedAt && (!qrCredential.expiresAt || new Date(qrCredential.expiresAt).getTime() > now);
        const facialReady = credentialStatus?.facialProfile?.status === "activated";
        return {
          studentId,
          studentName: student?.fullName ?? student?.formattedName ?? ([student?.firstName, student?.lastName].filter(Boolean).join(" ") || "Student details unavailable"),
          studentNumber: student?.studentNumber ?? "â€”",
          qrReady,
          facialReady
        };
      });

      participantReadiness.set(event.id, participants);
    });
    return participantReadiness;
  }, [credentialStatusesQuery.data, isOfflineMode, offlinePackageByEventId, participantStudentIdsByEventId, repositoryEvents, studentsQuery.data?.items]);
  const readinessIssuesByEventId = useMemo(
    () => new Map([...participantReadinessByEventId.entries()].map(([eventId, participants]) => [eventId, participants.filter((student) => !student.qrReady || !student.facialReady)])),
    [participantReadinessByEventId]
  );
  const readinessModalSummary = readinessEvent?.id ? readinessByEventId.get(readinessEvent.id) : undefined;
  const readinessModalIssues = readinessEvent?.id ? readinessIssuesByEventId.get(readinessEvent.id) ?? [] : [];
  const startEventReadiness = startEvent?.id ? readinessByEventId.get(startEvent.id) : undefined;
  const startEventMissingQrCount = startEventReadiness ? startEventReadiness.participants - startEventReadiness.qrReady : 0;
  const storeCompletedEvents = useMemo(() => uiState.completedEvents.map(completedFromStore), [uiState.completedEvents]);

  // Completed events = the repository summaries plus any sessions the
  // organizer has ended during this browser session.
  const completedEvents = useMemo(
    () =>
      [...completedExtras, ...storeCompletedEvents].filter(
        (event, index, events) => matchesSearch(event, search) && events.findIndex((item) => item.code === event.code) === index
      ),
    [completedExtras, search, storeCompletedEvents]
  );
  const completedCodes = useMemo(() => new Set(completedEvents.map((event) => event.code)), [completedEvents]);

  // Today and incoming events are published events that haven't been cancelled,
  // haven't been completed, and aren't currently live. New events appear here automatically.
  // Both lists are sorted by priority (Business-Critical > Time-Sensitive > Flexible,
  // impact score as tiebreaker) so the most urgent events surface first.
  const todayEvents = useMemo(
    () => {
      if (isOfflineMode) return sortByPriority(storeEvents.filter((event) => matchesSearch(event, search)));
      return sortByPriority(
        storeEvents.filter(
          (event) =>
            shouldDisplayInEventTab(event, "today", {
              activeEventCode: activeEvent?.code,
              includeActiveEvents: isReadOnlyMonitor,
              cancelledCodes,
              completedCodes,
              sessionsList
            }) &&
            matchesSearch(event, search)
        )
      );
    },
    [activeEvent, cancelledCodes, completedCodes, isOfflineMode, isReadOnlyMonitor, search, sessionsList, storeEvents]
  );

  const incomingEvents = useMemo(
    () => {
      if (isOfflineMode) return [];
      return sortByPriority(
        storeEvents.filter(
          (event) =>
            shouldDisplayInEventTab(event, "incoming", {
              activeEventCode: activeEvent?.code,
              cancelledCodes,
              completedCodes,
              sessionsList
            }) &&
            matchesSearch(event, search)
        )
      );
    },
    [activeEvent, cancelledCodes, completedCodes, isOfflineMode, search, sessionsList, storeEvents]
  );

  // Conflicts are computed across every non-cancelled, non-completed event
  // currently visible (today + incoming), so a conflict shows up regardless
  // of which tab either event happens to land in.
  const conflictsByCode = useMemo(() => {
    const pool = [...todayEvents, ...incomingEvents];
    const map = new Map<string, EventRecord[]>();
    pool.forEach((event) => {
      const conflicts = findConflicts(event, pool);
      if (conflicts.length > 0) {
        map.set(event.code, conflicts);
      }
    });
    return map;
  }, [todayEvents, incomingEvents]);

  const activeParticipantCount = activeParticipantIdentities?.length ?? 0;
  // While a session is live, students who have not checked in yet are still
  // pending, not absent. Missing participants become absent only in the
  // finalized session summary.
  const activeCounts = countRows(activeRows, activeParticipantCount, false);
  // A Time Out must be at least a minute after Time In. This is enforced at
  // capture time; the extra check is only a recovery safeguard for an old,
  // already-saved invalid value so End Session can still complete safely.
  const missingTimeOutRows = useMemo(
    () => activeRows.filter((row) => !row.checkOutAt || !canRecordTimeOut(row.checkInAt, row.checkOutAt)),
    [activeRows]
  );
  const actualStartAt = activeAttendanceSession?.attendanceWindowStartAt;
  const startedLateMinutes = actualStartAt && activeAttendanceSession
    ? Math.max(0, Math.floor((new Date(actualStartAt).getTime() - new Date(activeAttendanceSession.startsAt).getTime()) / 60_000))
    : 0;
  const isEndingAfterScheduledTime = Boolean(
    activeAttendanceSession?.endsAt && new Date().getTime() > new Date(activeAttendanceSession.endsAt).getTime()
  );
  const sessionSummary = finalizedSummary ?? summarizeFinalizedSession(activeRows, activeParticipantCount);

  // Scans are deliberately held in the live workspace until End Session. Keep
  // that draft in the browser session so route changes and reloads do not erase
  // valid scans before they are finalized in Supabase.
  useEffect(() => {
    if (!activeEvent?.id || !activeScannerSessionId) {
      setAttendanceDraftReadySessionId(null);
      return;
    }
    // Local attendance drafts belong to the organizer who is capturing them.
    // Read-only admin monitoring must never hydrate unsynchronized browser data.
    if (!canManageOwnedEvents) {
      setAttendanceDraftReadySessionId(activeScannerSessionId);
      return;
    }
    if (hydratedAttendanceDraftSessionIdRef.current === activeScannerSessionId) return;

    hydratedAttendanceDraftSessionIdRef.current = activeScannerSessionId;
    const restoredRows = readLiveAttendanceDraft(activeScannerSessionId, activeEvent.id);
    if (restoredRows.length > 0) setActiveRows(restoredRows.reduce(upsertAttendanceRow, []));
    setAttendanceDraftReadySessionId(activeScannerSessionId);
  }, [activeEvent?.id, activeScannerSessionId, canManageOwnedEvents]);

  useEffect(() => {
    if (!canManageOwnedEvents || !activeEvent?.id || !activeScannerSessionId || attendanceDraftReadySessionId !== activeScannerSessionId) return;
    if (finalizedAttendanceSessionIdsRef.current.has(activeScannerSessionId)) return;
    try {
      const draft: StoredLiveAttendanceDraft = { eventId: activeEvent.id, rows: activeRows };
      window.sessionStorage.setItem(liveAttendanceDraftStorageKey(activeScannerSessionId), JSON.stringify(draft));
    } catch {
      // Private browsing or storage limits should not stop attendance capture.
    }
  }, [activeEvent?.id, activeRows, activeScannerSessionId, attendanceDraftReadySessionId, canManageOwnedEvents]);

  // The browser draft is only a convenience layer. On restart, restore the
  // authoritative server summary as well: it includes unverified walk-ins and
  // the separately stored checkout method for registered participants.
  useEffect(() => {
    if (!activeEvent?.id || !resolvedLiveSessionId) return;
    const summary = liveAttendanceSummaryQuery.data?.[activeEvent.id];
    if (!summary) return;
    const persistedRows = summary.rows
      .filter((row) => row.sessionId === resolvedLiveSessionId && Boolean(row.timeIn))
      .map((row): DraftAttendanceRow => ({
        id: row.id,
        studentId: row.studentId,
        studentName: row.studentName,
        eventCode: activeEvent.code,
        attendanceMethod: row.attendanceMethod,
        ...(row.checkoutAttendanceMethod ? { checkoutAttendanceMethod: row.checkoutAttendanceMethod } : {}),
        checkInAt: row.timeIn ?? "",
        checkInTime: row.checkInTime,
        ...(row.timeOut ? { checkOutAt: row.timeOut, checkOutTime: row.checkOutTime ?? formatLocalTime(row.timeOut) } : {}),
        attendanceStatus: row.attendanceStatus,
        isFinalized: false,
        ...(row.lateReason ? { lateReason: row.lateReason } : {}),
      }));
    if (!persistedRows.length) return;
    setActiveRows((rows) => persistedRows.reduce(upsertAttendanceRow, rows));
  }, [activeEvent?.code, activeEvent?.id, liveAttendanceSummaryQuery.data, resolvedLiveSessionId]);

  // A record may have been created before the organizer reopened this live
  // screen, or have just synchronized from the local desktop database. Restore
  // those server records into the same table instead of showing an empty grid
  // and reporting the next scan as a duplicate.
  useEffect(() => {
    if (!activeEvent?.id || !resolvedLiveSessionId) return;
    const serverRecords = (attendanceRecordsQuery.data?.items ?? []).filter((record) => record.sessionId === resolvedLiveSessionId);
    if (!serverRecords.length) return;

    setActiveRows((rows) => {
      const restoredRows: DraftAttendanceRow[] = serverRecords.map((record) => {
        const student = (studentsQuery.data?.items ?? []).find((candidate) => candidate.id === record.studentId);
        const method = attendanceMethodFromVerification(record.verificationMethod);
        return {
          id: `server-${record.id}`,
          studentId: record.studentId,
          studentName: student?.fullName ?? student?.studentNumber ?? record.studentId,
          eventCode: activeEvent.code,
          attendanceMethod: method,
          ...(record.checkoutVerificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(record.checkoutVerificationMethod) } : {}),
          checkInAt: record.timeIn ?? "",
          checkInTime: record.timeIn ? formatLocalTime(record.timeIn) : "Not recorded",
          ...(record.checkedOutAt ? { checkOutAt: record.checkedOutAt, checkOutTime: formatLocalTime(record.checkedOutAt) } : {}),
          attendanceStatus: record.status === "late" ? "late" : "present",
          isFinalized: Boolean(record.finalizedAt),
          ...(record.lateReason ? { lateReason: record.lateReason as LateReason } : {})
        };
      });
      return restoredRows.reduce(upsertAttendanceRow, rows);
    });
  }, [activeEvent?.code, activeEvent?.id, attendanceRecordsQuery.data?.items, resolvedLiveSessionId, studentsQuery.data?.items]);

  // When disconnected, the prepared package is the read model for the live
  // workspace. Hydrate its existing attendance before accepting new scans so
  // a reload never presents an empty table or treats a repeat scan as new.
  useEffect(() => {
    if (!isLocalAuthoritativeSession || !activeEvent?.id || !activeScannerSessionId || !offlineLivePackage) return;
    if (offlineLivePackage.event.id !== activeEvent.id) return;
    const participantById = new Map(offlineLivePackage.participants.map((participant) => [participant.studentId, participant]));
    const localRows: DraftAttendanceRow[] = offlineLivePackage.attendance
      .filter((record) => record.sessionId === activeScannerSessionId && Boolean(record.timeIn))
      .map((record) => {
        const participant = participantById.get(record.studentId);
        const status: AttendanceStatus = record.attendanceStatus === "late" ? "late" : record.attendanceStatus === "absent" ? "absent" : "present";
        return {
          id: `offline-cached-${record.studentId}`,
          studentId: record.studentId,
          studentName: participant?.displayName || participant?.studentNumber || "Student details unavailable",
          eventCode: activeEvent.code,
          // Prepared packages carry existing timestamps but not historical
          // verification methods. Fresh local records below retain both.
          attendanceMethod: "QR Code",
          checkInAt: record.timeIn ?? "",
          checkInTime: formatLocalTime(record.timeIn ?? ""),
          ...(record.timeOut ? { checkOutAt: record.timeOut, checkOutTime: formatLocalTime(record.timeOut) } : {}),
          attendanceStatus: status,
          isFinalized: false
        };
      });
    if (!localRows.length) return;
    setActiveRows((rows) => localRows.reduce(upsertAttendanceRow, rows));
  }, [activeEvent?.code, activeEvent?.id, activeScannerSessionId, isLocalAuthoritativeSession, offlineLivePackage]);

  // Scanner phones write to the laptop's local database. Keep the live list
  // hydrated from that same source so a phone-confirmed scan is visible to the
  // organizer immediately, including while the laptop is offline. Do not poll
  // Supabase here: the previous one-second full-table refetch was the primary
  // source of the database CPU spikes.
  useEffect(() => {
    if (!canManageOwnedEvents) return;
    const api = desktopApi();
    if (!api || !activeEvent?.id || !activeScannerSessionId) return;

    let current = true;
    const refreshPhoneAttendance = async () => {
      try {
        const ownerId=session?.userId??"";
        const [pending,walkIns] = await Promise.all([api.listPending(activeEvent.id,ownerId),api.listPendingWalkInScans(activeEvent.id,ownerId,activeScannerSessionId)]);
        if (!current) return;
        const records = pending.filter((record) => record.sessionId === activeScannerSessionId);
        if (records.length || walkIns.length) {
          setActiveRows((rows) => {
            const phoneRows: DraftAttendanceRow[] = records.map((record): DraftAttendanceRow => {
            const student = (studentsQuery.data?.items ?? []).find((candidate) => candidate.id === record.studentId);
            return {
              id: `offline-${record.localAttendanceUuid}`,
              studentId: record.studentId,
              studentName: offlineParticipantNames.get(record.studentId) ?? student?.fullName ?? student?.studentNumber ?? "Student details unavailable",
              eventCode: activeEvent.code,
              attendanceMethod: attendanceMethodFromVerification(record.identificationMethod),
              ...(record.checkoutIdentificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(record.checkoutIdentificationMethod) } : {}),
              checkInAt: record.timeIn,
              checkInTime: formatLocalTime(record.timeIn),
              ...(record.timeOut ? { checkOutAt: record.timeOut, checkOutTime: formatLocalTime(record.timeOut) } : {}),
              attendanceStatus: record.attendanceStatus,
              ...(record.lateReason ? { lateReason: record.lateReason as LateReason } : {})
            };
            // The desktop API already scopes these to the active session, or
            // one unambiguous active walk-in after a renderer restore.
            }).concat(walkIns.map((scan): DraftAttendanceRow => ({
              id:`offline-walkin-${scan.localScanUuid}`,studentId:`walkin:${scan.localScanUuid}`,studentName:`Unverified walk-in · ${scan.studentNumber}`,
              eventCode:activeEvent.code,attendanceMethod:attendanceMethodFromVerification(scan.identificationMethod),
              ...(scan.checkoutIdentificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(scan.checkoutIdentificationMethod) } : {}),
              checkInAt:scan.timeIn,checkInTime:formatLocalTime(scan.timeIn),...(scan.timeOut?{checkOutAt:scan.timeOut,checkOutTime:formatLocalTime(scan.timeOut)}:{}),
              attendanceStatus:resolveRecordedOrganizerAttendanceStatus({timeIn:scan.timeIn,timeOut:scan.timeOut,attendanceSessionStatus:activeAttendanceSession?.status,lateCutoffAt:activeAttendanceSession?.lateCutoffAt}),isFinalized:false
            })));
            // Merge rather than replace. A request that began before the QR
            // checkout committed can return an older row with no Time Out.
            return phoneRows.reduce(upsertAttendanceRow, rows);
          });
        }
        // A scanner-status event is already a targeted signal. Refresh only the
        // active session's scoped query after that signal, never on a timer.
        await refetchAttendanceRecords();
      } catch {
        // The scanner itself remains the source of a safe result; a failed UI
        // refresh must not change or discard the locally recorded attendance.
      }
    };

    void refreshPhoneAttendance();
    const unsubscribe = api.onScannerStatus(() => { void refreshPhoneAttendance(); });
    const unsubscribeAttendance = api.onOfflineAttendanceRecorded((event) => {
      if (event.eventId !== activeEvent.id || event.sessionId !== activeScannerSessionId) return;
      if(event.source==="phone_scanner"&&event.studentId) {
        const student=(studentsQuery.data?.items??[]).find((candidate)=>candidate.id===event.studentId);
        toast.success(`${event.displayName??offlineParticipantNames.get(event.studentId)??student?.fullName??event.studentNumber??"Student"}: ${event.action==="checked_out"?"Time Out":"Time In"} at ${new Date(event.recordedAt).toLocaleTimeString()}`,{description:"Recorded on this desktop; awaiting server sync."});
      } else if(event.source==="phone_scanner"&&event.studentNumber) toast.success(`Walk-in ${event.studentNumber}: ${event.action==="checked_out"?"Time Out":"Time In"}`,{description:"Saved on this desktop; awaiting verification and sync."});
      void refreshPhoneAttendance();
    });
    return () => { current = false; unsubscribe(); unsubscribeAttendance(); };
  }, [activeAttendanceSession?.lateCutoffAt, activeAttendanceSession?.status, activeEvent, activeScannerSessionId, canManageOwnedEvents, offlineParticipantNames, refetchAttendanceRecords, session?.userId, studentsQuery.data?.items]);

  // Filter options are global to the Events workspace. Build them from every
  // loaded event so switching between Today, Incoming, and Cancelled never
  // removes a venue or category from the available choices.
  const filterableEvents = useMemo(
    () => repositoryEvents,
    [repositoryEvents]
  );
  const filterOptions = useMemo(
    () => ({
      venues: [...new Set(filterableEvents.map((event) => event.venue).filter(Boolean))].sort(),
      categories: [...new Set(filterableEvents.map((event) => event.category).filter(Boolean))].sort(),
      priorities: Object.keys(PRIORITY_RANK) as PriorityLevel[]
    }),
    [filterableEvents]
  );
  const selectedEvents = useMemo(
    () => (activeTab === "today" ? todayEvents : activeTab === "incoming" ? incomingEvents : cancelledEvents),
    [activeTab, cancelledEvents, incomingEvents, todayEvents]
  );
  const prepareOfflinePackage = useCallback(async (event: EventRecord, options: { silent?: boolean } = {}) => {
    const eventId = event.id;
    if (!eventId) return;
    if (!desktopApi()) {
      setOfflinePreparationByEventId((current) => new Map(current).set(eventId, { packageStatus: "NOT_PREPARED", error: "Open PLPass in the desktop app to prepare offline." }));
      return;
    }
    if (isOfflineMode || !navigator.onLine || !(await confirmSupabaseConnectivity())) {
      throw new Error("Offline preparation requires a verified online connection.");
    }
    setOfflinePreparationByEventId((current) => new Map(current).set(eventId, { packageStatus: "PREPARING", preparing: true }));
    try {
      if (!session?.userId) throw new Error("An authenticated organizer is required to prepare an offline event.");
      const status = await prepareEventForOffline(eventId, session.userId);
      setOfflinePreparationByEventId((current) => new Map(current).set(eventId, { packageStatus: status.packageStatus }));
      const failuresKey=`plpass-offline-package-failures:${session.userId}:${getManilaCalendarDate()}`;
      const failures=JSON.parse(window.localStorage.getItem(failuresKey)??"{}") as Record<string,string>;
      const remainingFailures=Object.fromEntries(Object.entries(failures).filter(([key])=>key!==eventId));window.localStorage.setItem(failuresKey,JSON.stringify(remainingFailures));
      if (!options.silent) toast.success(`${event.code} is ready for offline use.`);
    } catch (error) {
      const message=error instanceof Error ? error.message : "Preparation failed.";
      setOfflinePreparationByEventId((current) => new Map(current).set(eventId, { packageStatus: "INCOMPLETE", error: message }));
      if(session?.userId){const failuresKey=`plpass-offline-package-failures:${session.userId}:${getManilaCalendarDate()}`;const failures=JSON.parse(window.localStorage.getItem(failuresKey)??"{}") as Record<string,string>;failures[eventId]=message;window.localStorage.setItem(failuresKey,JSON.stringify(failures));}
      if (!options.silent) toast.error(`Unable to prepare ${event.code} for offline use.`);
      throw error;
    }
  }, [isOfflineMode, session?.userId]);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    let current = true;
    if (!session?.userId) return;
    void Promise.all(repositoryEvents.filter((event): event is EventRecord & { id: string } => Boolean(event.id)).map(async (event) => ({ id: event.id, status: await api.getStatus(event.id,session.userId) })))
      .then((entries) => {
        if (!current) return;
        setOfflinePreparationByEventId((previous) => {
          const next = new Map(previous);
          entries.forEach(({ id, status }) => {
            if (!next.get(id)?.preparing) {
              const existing=next.get(id);
              if(existing?.error&&status.packageStatus==="NOT_PREPARED") next.set(id,existing);
              else next.set(id, { packageStatus: status.packageStatus });
            }
          });
          return next;
        });
      })
      .catch(() => undefined);
    return () => { current = false; };
  }, [repositoryEvents,session?.userId]);

  // Daily package preparation is owned by the authenticated session provider;
  // opening this screen never starts an automatic RPC burst. Operators retain
  // the explicit per-event refresh action for changes made later in the day.
  const hasEventFilters = Boolean(eventFilters.dateFrom || eventFilters.dateTo || eventFilters.venue || eventFilters.category || eventFilters.priority !== "all");
  const selectedListTitle = activeTab === "today" ? "Today's events" : activeTab === "incoming" ? "Incoming events" : "Cancelled events";

  useEffect(() => {
    setHeaderOverride({
      title: isAdmin ? "Admin Workspace" : isDepartmentAdmin ? "Department Admin Workspace" : "Organizer Workspace",
      description: undefined
    });
  }, [isAdmin, isDepartmentAdmin, setHeaderOverride]);

  useEffect(() => {
    if (selectedEventForSession && !selectedEvents.some((event) => event.code === selectedEventForSession.code)) {
      setSelectedEventForSession(null);
    }
  }, [selectedEventForSession, selectedEvents]);

  async function cancelEvent(event: EventRecord) {
    if (!event.id || cancelReason.trim().length < 5) {
      toast.error("Provide a cancellation reason of at least 5 characters.");
      return;
    }
    await cancelEventMutation.mutateAsync({ eventId: event.id, reason: cancelReason.trim() });
    setCancelledCodes((current) => (current.includes(event.code) ? current : [...current, event.code]));
    setConfirmCancelEvent(null);
    setCancelReason("");
    toast.warning(`${event.code} has been cancelled.`);
  }

 async function startSession() {
  if (!startEvent?.id) {
    toast.error("Only events synced from Supabase can start a live session.");
    return;
  }

  // Validate the session form using Zod schema
  const validation = eventSessionSchema.safeParse({
    venue: sessionForm.venue,
    date: sessionForm.date,
    startTime: sessionForm.startTime,
    expectedEndTime: sessionForm.endTime,
    attendanceMode: "face-to-face"
  });

  if (!validation.success) {
    const errors = validation.error.errors.map((err) => err.message).join(", ");
    toast.error(`Form validation failed: ${errors}`);
    return;
  }

  const eventToStart = startEvent;
  const eventId = eventToStart.id as string;
  if (eventToStart.date !== getManilaCalendarDate() || sessionForm.date !== getManilaCalendarDate()) {
    toast.error("This event can only start on its scheduled Manila date. Reschedule it to today first.");
    return;
  }
  if (!eventToStart.id) {
    toast.error("This event is missing an ID and cannot start an attendance session.");
    return;
  }
  if (desktopApi() && !isOfflineMode) {
    const preparation = offlinePreparationByEventId.get(eventToStart.id);
    if (preparation?.packageStatus !== "READY") {
      const confirmed = window.confirm(`Offline resources for ${eventToStart.code} are not ready. Starting this event will download the required offline package now. The event can start only after that download succeeds. Continue?`);
      if (!confirmed) return;
      try {
        await prepareOfflinePackage(eventToStart);
      } catch {
        toast.error("The event was not started because its required offline resources could not be downloaded.");
        return;
      }
    }
  }
  let startedSessionId = "";
  let startedAt = "";
  let locallyStartedPackage: PreparedEventPackage | null = null;
  try {
    if (isOfflineMode) {
      const ownerId = session?.userId;
      const api = desktopApi();
      const localPackage = ownerId && api ? await api.getPreparedEvent(eventId, ownerId) : null;
      const localSession = localPackage?.sessions.find((item) =>
        ["scheduled", "ongoing"].includes(item.status) && (item.offlineLifecycle ?? "NOT_STARTED") === "NOT_STARTED"
      );
      if (!ownerId || !api || !localPackage || !localSession) {
        throw new Error("This event has no prepared local attendance session. Prepare it while online before starting offline.");
      }
      const updatedPackage = await startOfflineEvent(eventId, localSession.id, ownerId);
      const updatedSession = updatedPackage.sessions.find((item) => item.id === localSession.id);
      if (!updatedSession || !["START_PENDING", "STARTED"].includes(updatedSession.offlineLifecycle ?? "")) {
        throw new Error("The local attendance session did not enter its started state.");
      }
      locallyStartedPackage = updatedPackage;
      rememberOfflineLiveSessionHandoff(updatedPackage, ownerId, updatedSession.id);
      startedSessionId = updatedSession.id;
      startedAt = updatedSession.attendanceWindowStartAt ?? updatedSession.offlineStartedAt ?? new Date().toISOString();
    } else {
      const startedSession = await createEventSessionMutation.mutateAsync({
        eventId: eventToStart.id,
        venue: sessionForm.venue,
        date: sessionForm.date,
        startTime: sessionForm.startTime,
        expectedEndTime: sessionForm.endTime,
        attendanceMode: "face-to-face",
        lateCutoffMinutes: sessionForm.lateCutoffMinutes
      });
      startedSessionId = startedSession.id;
      startedAt = startedSession.attendanceWindowStartAt ?? new Date().toISOString();
    }
  } catch {
    toast.error(isOfflineMode ? "The prepared local session could not be started. No server session was changed." : "The attendance session could not be started.");
    return;
  }

  // Refresh the offline package after creating the session. A package prepared
  // before the event starts can be READY while still missing this newly
  // ongoing session, which would make scanner startup reject it.
  if (desktopApi() && !isOfflineMode) {
    try {
      const refreshed = await prepareEventForOffline(eventId, session?.userId ?? "");
      if (refreshed.packageStatus !== "READY") throw new Error("Offline package is not ready.");
      setOfflinePreparationByEventId((current) => new Map(current).set(eventId, { packageStatus: refreshed.packageStatus }));
    } catch {
      toast.error("The event session was created, but required offline resources could not be confirmed. Do not use offline scanners; refresh preparation and retry.");
      return;
    }
  }

  setActiveRows([]);
  setFinalizedSummary(null);
  setSummaryEvent(null);
  setCaptureMode(defaultAttendanceMethod);
  setAttendancePhase("time_in");
  writeAttendancePhase(window.sessionStorage, startedSessionId, "time_in");
  if (locallyStartedPackage) setLocalStartPackage(locallyStartedPackage);
  setLiveSessionId(startedSessionId);
  setActiveEvent({ ...eventToStart, venue: sessionForm.venue, date: sessionForm.date, startTime: sessionForm.startTime, endTime: sessionForm.endTime });
  setStartEvent(null);
  setSelectedEventForSession(null);
  navigate(workspaceRoute(APP_ROUTES.organizerLiveSession(startedSessionId), APP_ROUTES.adminLiveSession(startedSessionId)), { replace: true });
  const startedAtTimestamp = new Date(startedAt).getTime();
  const scheduledAt = new Date(`${eventToStart.date}T${sessionForm.startTime}:00`).getTime();
  const delayedMinutes = Math.max(0, Math.floor((startedAtTimestamp - scheduledAt) / 60_000));
  toast.success(
    delayedMinutes > 0
      ? `${eventToStart.code} started ${delayedMinutes} minutes later than scheduled. Late attendance is calculated from the actual start.`
      : `${eventToStart.code} live attendance started. Attendance will be finalized when you end it.`
  );
}
 const endSession = useCallback(async () => {
  if (!activeEvent?.id) return;
  if (isEndingAfterScheduledTime && endSessionReason.trim().length < 5) {
    toast.error("Provide a short reason for ending after the scheduled time.");
    return;
  }
  let attendanceFinalized = false;
  const finalizedEvent = { id: activeEvent.id, code: activeEvent.code, name: activeEvent.name };
  try {
    const sessionId = liveSessionId;
    if (!sessionId) throw new Error("The active attendance session could not be found.");
    const attendanceRecords: FinalizeAttendanceRecordInput[] = activeRows.map((row) => ({
      studentId: row.studentId,
      status: row.attendanceStatus === "late" ? "late" : "present",
      verificationMethod: verificationMethodFromAttendance(row.attendanceMethod),
      timeIn: row.checkInAt,
      ...(row.checkOutAt && canRecordTimeOut(row.checkInAt, row.checkOutAt) ? { timeOut: row.checkOutAt } : {}),
      ...(row.checkOutAt && row.checkoutAttendanceMethod ? { checkoutVerificationMethod: verificationMethodFromAttendance(row.checkoutAttendanceMethod) } : {}),
      ...(row.lateReason ? { lateReason: row.lateReason } : {})
    }));
    if (isLocalAuthoritativeSession) {
      const endedPackage = await endOfflineEvent(
        activeEvent.id,
        sessionId,
        session?.userId ?? "",
        endSessionReason.trim() || "Organizer ended session"
      );
      setLocalStartPackage(endedPackage);
      clearOfflineLiveSessionHandoff(session?.userId ?? "", sessionId);
      toast.success("Session ended on this device. Attendance is saved locally and will sync after reconnecting.");
    } else {
      await endSessionMutation.mutateAsync({
        sessionId,
        reason: endSessionReason.trim() || "Organizer ended session",
        attendanceRecords
      });
    }
    attendanceFinalized = true;
    finalizedAttendanceSessionIdsRef.current.add(sessionId);
    clearAttendancePhase(window.sessionStorage, sessionId);
    try {
      window.sessionStorage.removeItem(liveAttendanceDraftStorageKey(sessionId));
    } catch {
      // The session has already been finalized remotely; a storage cleanup
      // failure must not make the organizer believe it is still open.
    }
    if (!isLocalAuthoritativeSession) {
      await completeEventMutation.mutateAsync(activeEvent.id); // ADD — marks the event itself completed
    }
    setFinalizedSummary(
      summarizeFinalizedSession(
        activeRows.map((row) => ({
          attendanceStatus: row.attendanceStatus,
          lateReason: row.lateReason,
          isFinalized: row.isFinalized,
          checkOutAt: row.checkOutAt
        })),
        activeParticipantCount
      )
    );
    setSummaryEvent(finalizedEvent);
    setSummaryOpen(true);
    
    if (!isLocalAuthoritativeSession) {
      void auditLogMutations.logActionMutation.mutateAsync({
        action: "Ended Live Session",
        targetType: "attendance_session",
        targetId: sessionId,
        metadata: { eventCode: activeEvent.code, sessionId }
      });
    }
    setLiveSessionId(null);
    setEndSessionConfirmOpen(false);
    setEndSessionReason("");
  } catch (error) {
    // The session mutation already displays its own database error. Only surface
    // errors from later work, such as completing the event, here.
    if (attendanceFinalized) {
      toast.error(error instanceof Error ? error.message : "Failed to complete the event.");
    }
  }
}, [activeEvent, activeParticipantCount, activeRows, auditLogMutations.logActionMutation, completeEventMutation, endSessionMutation, endSessionReason, isEndingAfterScheduledTime, isLocalAuthoritativeSession, liveSessionId, session?.userId]);

  async function openTimeOut() {
    if (attendancePhase === "time_out") return;
    try {
      const api = desktopApi();
      const localPackage = api && activeEvent?.id && session?.userId && activeScannerSessionId
        ? await api.getPreparedEventBySession(activeScannerSessionId, session.userId)
        : null;
      const hasLocalSession = Boolean(localPackage?.sessions.some((item) => item.id === activeScannerSessionId));
      let serverPhase: AttendanceCapturePhase = "time_out";
      if (isLocalAuthoritativeSession) {
        await api?.advanceAttendanceCapturePhase(activeScannerSessionId ?? "", session?.userId ?? "");
      } else {
        try {
          serverPhase = await advanceServerAttendanceCapturePhase(activeScannerSessionId ?? "");
          if (hasLocalSession) await api?.advanceAttendanceCapturePhase(activeScannerSessionId ?? "", session?.userId ?? "");
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          const isNetworkFailure = !navigator.onLine || /failed to fetch|network|offline|timeout|connection/i.test(message);
          if (!hasLocalSession || !isNetworkFailure) throw error;
          await api?.advanceAttendanceCapturePhase(activeScannerSessionId ?? "", session?.userId ?? "");
        }
      }
      const scanner = api ? await api.getScannerStations() : undefined;
      if (scanner?.active) await api?.setScannerCapturePhase(serverPhase);
      setAttendancePhase(serverPhase);
      if (activeScannerSessionId) writeAttendancePhase(window.sessionStorage, activeScannerSessionId, serverPhase);
      toast.success("Time Out is now open. Phone scanners will record Time Out only.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Time Out could not be opened.");
    }
  }

  function openLiveFacialVerification() {
    if (!resolvedLiveSessionId) {
      toast.error("No active attendance session is available for facial verification.");
      return;
    }
    setFacialStatus("");
    setFacialCameraOpen(true);
  }

  async function verifyFacialAttendance() {
    const sessionId = resolvedLiveSessionId;
    const video = facialVideoRef.current;
    if (!sessionId || !activeEvent || !video) {
      setFacialStatus("Start the camera and keep one enrolled student centered.");
      return;
    }
    if (facialVerifying) return;

    setFacialVerifying(true);
    setFacialStatus("Identifying one live face among this event's enrolled participants…");
    try {
      const { descriptor: liveDescriptor } = await extractMirroredFaceDescriptor(video);
      const client = getSupabaseBrowserClient();
      const { data: candidates, error: candidatesError } = await client.rpc("get_live_facial_candidates", {
        p_event_session_id: sessionId
      });
      if (candidatesError) throw new Error(candidatesError.message);

      const matches = (await Promise.all((candidates ?? []).map(async (candidate) => {
        const { data: descriptor, error } = await client.rpc("get_facial_descriptor_for_organizer", {
          p_event_session_id: sessionId,
          p_student_id: candidate.student_id
        });
        if (error || !Array.isArray(descriptor) || !descriptor.every((value) => typeof value === "number")) return null;
        return { candidate, similarity: faceSimilarity(descriptor, liveDescriptor) };
      }))).filter((match): match is NonNullable<typeof match> => Boolean(match));

      matches.sort((left, right) => right.similarity - left.similarity);
      const bestMatch = matches[0];
      if (!bestMatch || bestMatch.similarity < 0.82) {
        throw new Error("No enrolled participant matched this face. Use QR or manual attendance instead.");
      }
      if (matches[1] && bestMatch.similarity - matches[1].similarity < 0.04) {
        throw new Error("Face match is ambiguous. Keep only one participant in view or use QR.");
      }

      const occurredAt = new Date().toISOString();
      const { data: attendance, error: attendanceError } = await client.rpc("record_live_facial_attendance", {
        p_event_session_id: sessionId,
        p_student_id: bestMatch.candidate.student_id,
        p_similarity: bestMatch.similarity,
        p_action: attendancePhase === "time_out" ? "check_out" : "check_in",
        p_occurred_at: occurredAt
      });
      if (attendanceError) throw new Error(attendanceError.message);
      const action = attendance && typeof attendance === "object" && "action" in attendance && typeof attendance.action === "string"
        ? attendance.action
        : "checked_in";
      const actionLabel = action === "checked_out" ? "checked out" : action === "already_recorded" ? "already recorded" : "checked in";
      const attendanceStatus = attendance && typeof attendance === "object" && "attendance_status" in attendance && (attendance.attendance_status === "late" || attendance.attendance_status === "present")
        ? attendance.attendance_status
        : "present";

      if (action !== "already_recorded") {
        setActiveRows((current) => {
          const existing = current.find((row) => row.studentId === bestMatch.candidate.student_id);
          if (action === "checked_out") {
            if (!existing) return current;
            return current.map((row) => row.studentId === bestMatch.candidate.student_id
              ? { ...row, checkOutAt: occurredAt, checkOutTime: formatLocalTime(occurredAt), checkoutAttendanceMethod: "Facial Recognition" }
              : row);
          }
          if (existing) {
            return current.map((row) => row.studentId === bestMatch.candidate.student_id
              ? { ...row, attendanceMethod: "Facial Recognition", attendanceStatus, isFinalized: false }
              : row);
          }
          return [...current, {
            id: `facial-${bestMatch.candidate.student_id}`,
            studentId: bestMatch.candidate.student_id,
            studentName: bestMatch.candidate.display_name,
            eventCode: activeEvent.code,
            attendanceMethod: "Facial Recognition",
            checkInAt: occurredAt,
            checkInTime: formatLocalTime(occurredAt),
            attendanceStatus,
            isFinalized: false
          }];
        });
      }

      setFacialStatus(`${bestMatch.candidate.display_name} (${bestMatch.candidate.student_number}) — ${actionLabel}. Match confidence: ${(bestMatch.similarity * 100).toFixed(1)}%. You can scan the next enrolled participant.`);
      toast.success(`${bestMatch.candidate.display_name}: ${actionLabel}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Face verification could not be completed.";
      setFacialStatus(!navigator.onLine || /failed to fetch|network|offline/i.test(errorMessage)
        ? "Facial recognition requires an internet connection. Reconnect and try again, or use QR attendance."
        : errorMessage);
    } finally {
      setFacialVerifying(false);
    }
  }

  async function submitQrAttendance(inputCode = qrInput) {
    const scanCode = inputCode.trim();
    if (!scanCode || !activeEvent?.id || isQrProcessing || qrSubmissionInFlightRef.current) {
      return;
    }

    // Some USB/Bluetooth scanners emit the same payload twice (or emit both
    // their terminator and an idle-delimited submission). Treat that as one
    // physical scan so the successful first attempt is not followed by a
    // misleading "no participant" error toast.
    // Ignore formatting differences between duplicate scanner emissions
    // (line breaks, brackets, labels, punctuation, and case).
    const scanKey = scanCode.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const now = Date.now();
    const previousScanAt = recentQrScansRef.current.get(scanKey);
    if (previousScanAt !== undefined && now - previousScanAt < duplicateQrSuppressionMs) return;
    recentQrScansRef.current.set(scanKey, now);
    for (const [key, timestamp] of recentQrScansRef.current) {
      if (now - timestamp >= duplicateQrSuppressionMs) recentQrScansRef.current.delete(key);
    }

    qrSubmissionInFlightRef.current = true;
    setIsQrProcessing(true);
    const eventId = activeEvent.id;
    if (!eventId) {
      setIsQrProcessing(false);
      qrSubmissionInFlightRef.current = false;
      return;
    }
    const sessionId = activeScannerSessionId ?? resolvedLiveSessionId;
    const recordQrLocally = async () => {
      if (!sessionId) throw new Error("The active attendance session could not be found.");
      if(session?.userId&&(await getOfflineSessionEndState(eventId,sessionId,session.userId)).isLocallyEnded) throw new Error("This event was ended on this device. Attendance capture is locked until synchronization is confirmed.");
      const recordedAt=new Date().toISOString();
      const student = await identifyOfflineStudent(eventId, "qr", scanCode);
      const api = desktopApi();
      let effectivePhase = attendancePhase;
      const reconcilePhase = async () => {
        if (!api || !session?.userId) return effectivePhase;
        const localPhase = await api.getAttendanceCapturePhase(sessionId, session.userId);
        // The local cache is authoritative for desktop writes.  A renderer
        // reload or a lost phase response can leave it one step behind the
        // page/server.  Reconcile only in the forward direction; never
        // downgrade a local Time Out session back to Time In.
        if (attendancePhase === "time_out" && localPhase === "time_in") {
          effectivePhase = await api.advanceAttendanceCapturePhase(sessionId, session.userId);
        } else {
          effectivePhase = localPhase;
        }
        if (effectivePhase !== attendancePhase) {
          setAttendancePhase(effectivePhase);
          writeAttendancePhase(window.sessionStorage, sessionId, effectivePhase);
        }
        return effectivePhase;
      };
      effectivePhase = await reconcilePhase();
      if (!student) {
        const studentNumber=extractStudentNumber(scanCode);
        if(!studentNumber) throw new Error("This QR does not contain a valid student number for a walk-in checkout.");
        const remoteWalkIn = await findRemoteUnverifiedWalkIn(studentNumber);
        if (remoteWalkIn && effectivePhase === "time_in") {
          toast.warning(`Unverified walk-in ${studentNumber}: ${alreadyRecordedAttendanceLabel(remoteWalkIn.timeOut)}`, {
            description: alreadyRecordedAttendanceDescription(remoteWalkIn.timeOut)
          });
          return;
        }
        if (remoteWalkIn && effectivePhase === "time_out") {
          await recordRemoteUnverifiedWalkInTimeOut(remoteWalkIn, "QR Code", recordedAt);
          toast.success(`Unverified walk-in ${studentNumber}: Time Out saved`, {
            description: "The original Time In and QR Time Out were recorded."
          });
          return;
        }
        // A Time Out must not ask to create a second walk-in. The local
        // database verifies the original Time In before accepting it.
        if(effectivePhase === "time_in" && !window.confirm(`Student ${studentNumber} is not in the downloaded roster. Save this scan as an unverified walk-in for later verification?`)) throw new Error("This QR is not in the downloaded roster; no attendance was saved.");
        const ownerId=session?.userId;if(!ownerId)throw new Error("Organizer identity is unavailable; the scan was not saved.");
        const queued=await api?.queueWalkInScan({eventId,sessionId,studentNumber,identificationMethod:"qr",capturePhase:effectivePhase,attendanceTimestamp:recordedAt,organizerProfileId:ownerId});
        if(!queued) throw new Error("The walk-in scan could not be securely saved on this desktop.");
        const walkInStatus=resolveRecordedOrganizerAttendanceStatus({timeIn:queued.timeIn,timeOut:queued.timeOut,attendanceSessionStatus:activeAttendanceSession?.status,lateCutoffAt:activeAttendanceSession?.lateCutoffAt});
        setActiveRows((current)=>upsertAttendanceRow(current,{
          id:`walkin-${queued.localScanUuid}`,
          studentId:`walkin:${queued.localScanUuid}`,
          studentName:`Unverified walk-in · ${queued.studentNumber}`,
          eventCode:activeEvent.code,
          attendanceMethod:attendanceMethodFromVerification(queued.identificationMethod),
          ...(queued.checkoutIdentificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(queued.checkoutIdentificationMethod) } : {}),
          checkInAt:queued.timeIn,
          checkInTime:formatLocalTime(queued.timeIn),
          ...(queued.timeOut?{checkOutAt:queued.timeOut,checkOutTime:formatLocalTime(queued.timeOut)}:{}),
          attendanceStatus:walkInStatus,
          isFinalized:false
        }));
        lastSuccessfulQrScanAtRef.current=Date.now();
        if (queued.action === "already_recorded") {
          toast.warning(`Unverified walk-in ${queued.studentNumber}: ${alreadyRecordedAttendanceLabel(queued.timeOut)}`, {
            description: alreadyRecordedAttendanceDescription(queued.timeOut)
          });
        } else {
          toast.success(`Unverified walk-in ${queued.studentNumber} saved locally`,{description:`${effectivePhase==="time_in"?"Time In":"Time Out"} at ${new Date(recordedAt).toLocaleTimeString()}; not synced.`});
        }
        return;
      }
      const local = await recordOfflineAttendance({ eventId, sessionId, studentId: student.studentId, identificationMethod: "qr", attendanceTimestamp: recordedAt },effectivePhase);
      setActiveRows((current) => upsertAttendanceRow(current, localAttendanceRow(local, activeEvent.code, student)));
      lastSuccessfulQrScanAtRef.current = Date.now();
      if (local.action === "already_recorded") {
        toast.warning(`${student.displayName}: ${alreadyRecordedAttendanceLabel(local.record.timeOut)}`, {
          description: alreadyRecordedAttendanceDescription(local.record.timeOut)
        });
      } else {
        toast.success(`${student.displayName}: ${local.action === "checked_out" ? "Time Out" : "Time In"} at ${new Date(recordedAt).toLocaleTimeString()}`, { description: `${local.safeMessage} Saved on this device; not synced.` });
      }
    };
    try {
      if (desktopApi()) {
        const preparedLocally = Boolean(session?.userId && await desktopApi()?.getPreparedEvent(eventId, session.userId));
        if (isLocalAuthoritativeSession || preparedLocally) {
          // The prepared desktop package is authoritative for live scans.
          // Do not hide a local walk-in checkout error behind the online
          // participant-only lookup.
          try {
            await recordQrLocally();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "The QR attendance could not be saved locally.");
          }
          return;
        }
      }
      const client = getSupabaseBrowserClient();
      if (activeParticipantIdentities === null) {
        toast.warning("The event participant list is still loading. Please scan again in a moment.");
        return;
      }
      const matchedStudent = activeParticipantIdentities.find((student) =>
        studentIdentityMatchesPayload(scanCode, student.studentNumber, student.fullName)
      );

      if (!matchedStudent) {
        if (Date.now() - lastSuccessfulQrScanAtRef.current < duplicateQrSuppressionMs) return;
        toast.error("No active event participant matches this student number or name.");
        return;
      }
      const studentId = matchedStudent.studentId;
      if (!studentId) {
        toast.error("The scanned student could not be identified.");
        return;
      }

      const { data: participant, error: participantError } = await client
        .from("event_participants")
        .select("id")
        .eq("event_id", activeEvent.id)
        .eq("student_id", studentId)
        .neq("participant_status", "removed")
        .maybeSingle();
      if (participantError) throw participantError;
      if (!participant) {
        toast.error("This student is not assigned to the active event.");
        return;
      }

      const existing = activeRows.find((row) => row.studentId === studentId);
      if (existing?.checkOutAt) {
        toast.warning(`${existing.studentName} already has a Time In and Time Out.`);
        return;
      }
      if (attendancePhase === "time_in" && existing?.checkInAt) {
        toast.warning(`${existing.studentName} already has a Time In.`);
        return;
      }
      if (attendancePhase === "time_out" && !existing?.checkInAt) {
        toast.warning("No Time In is recorded for this student.");
        return;
      }
      if (!sessionId) throw new Error("The active attendance session could not be found.");
      const result = await credentialScanMutation.mutateAsync({ sessionId, credentialCode: scanCode, method: "qr" });
      if (result.resultStatus !== "Time In Recorded" && result.resultStatus !== "Time Out Recorded") {
        if (result.resultStatus === "Already Recorded") toast.warning(result.safeMessage);
        else toast.error(result.safeMessage);
        return;
      }
      const record = result.attendanceRecord;
      if (!record) throw new Error("The attendance scan was accepted, but its saved record could not be confirmed.");
      const student = (studentsQuery.data?.items ?? []).find((candidate) => candidate.id === studentId);
      setActiveRows((current) => {
        const currentRow = current.find((row) => row.studentId === studentId);
        const next: DraftAttendanceRow = {
          id: record.id,
          studentId,
          studentName: student?.fullName ?? student?.studentNumber ?? studentId,
          eventCode: activeEvent.code,
          attendanceMethod: attendancePhase === "time_out" && currentRow ? currentRow.attendanceMethod : attendanceMethodFromVerification(record.verificationMethod),
          ...(attendancePhase === "time_out" ? { checkoutAttendanceMethod: "QR Code" as const } : record.checkoutVerificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(record.checkoutVerificationMethod) } : {}),
          checkInAt: record.timeIn ?? "",
          checkInTime: record.timeIn ? formatLocalTime(record.timeIn) : "Not recorded",
          ...(record.checkedOutAt ? { checkOutAt: record.checkedOutAt, checkOutTime: formatLocalTime(record.checkedOutAt) } : {}),
          attendanceStatus: record.status,
          isFinalized: Boolean(record.finalizedAt),
          ...(record.lateReasonCategory ? { lateReason: record.lateReasonCategory as LateReason } : {})
        };
        return upsertAttendanceRow(current, next);
      });
      toast.success(`${student?.fullName ?? student?.studentNumber ?? "Student"}: ${result.safeMessage}`);
      lastSuccessfulQrScanAtRef.current = Date.now();
    } catch (error) {
      const networkFailure = error instanceof TypeError
        || (error instanceof Error && /(?:network|fetch|timeout|offline|connection)/i.test(error.message));
      if (desktopApi() && (isLocalAuthoritativeSession || isOfflineMode || networkFailure)) {
        try {
          await recordQrLocally();
          return;
        } catch {
          // Keep the central validation error when the event was not prepared
          // or the QR is not present in the local package.
        }
      }
      toast.error(error instanceof Error ? error.message : "The QR code could not be validated.");
    } finally {
      setQrInput("");
      setIsQrProcessing(false);
      qrSubmissionInFlightRef.current = false;
    }
  }

  useEffect(() => {
    submitQrAttendanceRef.current = (code) => { void submitQrAttendance(code); };
  });

  useEffect(() => {
    const resetScannerBuffer = () => {
      if (qrScannerFlushTimerRef.current !== undefined) {
        window.clearTimeout(qrScannerFlushTimerRef.current);
        qrScannerFlushTimerRef.current = undefined;
      }
      qrScannerBufferRef.current = "";
    };

    const submitBufferedScan = () => {
      const value = qrScannerBufferRef.current.trim();
      if (value.length < 3) {
        resetScannerBuffer();
        return;
      }
      resetScannerBuffer();
      setQrInput(value);
      submitQrAttendanceRef.current(value);
    };

    if (!activeEventId || captureMode !== "QR Code") {
      resetScannerBuffer();
      return;
    }

    const handleScannerKeyDown = (event: KeyboardEvent) => {
      if (isQrProcessing || isEditableScanTarget(event.target)) {
        resetScannerBuffer();
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        if (qrScannerBufferRef.current.trim().length >= 3) {
          event.preventDefault();
          submitBufferedScan();
        } else {
          resetScannerBuffer();
        }
        return;
      }

      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
      // Barcode scanners vary substantially in their key interval, especially
      // when connected by Bluetooth. Submission is delimited by the scanner's
      // Enter/Tab suffix, with an idle fallback for scanners without a suffix.
      qrScannerBufferRef.current += event.key;
      if (qrScannerFlushTimerRef.current !== undefined) window.clearTimeout(qrScannerFlushTimerRef.current);
      qrScannerFlushTimerRef.current = window.setTimeout(submitBufferedScan, scannerIdleSubmissionDelayMs);
    };

    const handleScannerPaste = (event: ClipboardEvent) => {
      if (isQrProcessing || isEditableScanTarget(event.target)) return;
      const value = event.clipboardData?.getData("text")?.trim() ?? "";
      if (value.length < 3) return;
      event.preventDefault();
      resetScannerBuffer();
      setQrInput(value);
      submitQrAttendanceRef.current(value);
    };

    window.addEventListener("keydown", handleScannerKeyDown, true);
    window.addEventListener("paste", handleScannerPaste, true);
    return () => {
      resetScannerBuffer();
      window.removeEventListener("keydown", handleScannerKeyDown, true);
      window.removeEventListener("paste", handleScannerPaste, true);
    };
  }, [activeEventId, captureMode, isQrProcessing]);

  useEffect(() => {
    if (!activeEvent) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [activeEvent]);

  function activateManualCapture() {
    setCaptureMode("Manual");
    // Focusing after the mode change keeps the manual form usable in the
    // desktop shell during both Time In and Time Out.
    window.requestAnimationFrame(() => manualInputRef.current?.focus());
  }

  async function submitManualAttendance() {
    if (!manualInput || !activeEvent?.id) {
      toast.warning("Please select a student.");
      return;
    }
    if (manualEntryReason.trim().length < 5) {
      toast.warning("Provide a reason of at least 5 characters for the manual attendance entry.");
      return;
    }

    const eventId = activeEvent.id;
    const sessionId = activeScannerSessionId ?? resolvedLiveSessionId;
    const recordedAt = new Date().toISOString();
    const recordManualLocally = async () => {
      const api = desktopApi();
      const organizerProfileId = session?.userId;
      if (!api || !sessionId || !organizerProfileId) {
        throw new Error("The active desktop attendance session could not be found.");
      }
      if ((await getOfflineSessionEndState(eventId, sessionId, organizerProfileId)).isLocallyEnded) {
        throw new Error("This event was ended on this device. Attendance capture is locked until synchronization is confirmed.");
      }

      let effectivePhase = attendancePhase;
      const localPhase = await api.getAttendanceCapturePhase(sessionId, organizerProfileId);
      if (attendancePhase === "time_out" && localPhase === "time_in") {
        effectivePhase = await api.advanceAttendanceCapturePhase(sessionId, organizerProfileId);
      } else {
        effectivePhase = localPhase;
      }
      if (effectivePhase !== attendancePhase) {
        setAttendancePhase(effectivePhase);
        writeAttendancePhase(window.sessionStorage, sessionId, effectivePhase);
      }

      const participant = await identifyOfflineStudent(eventId, "manual", manualInput);
      if (participant) {
        const local = await recordOfflineAttendance({
          eventId,
          sessionId,
          studentId: participant.studentId,
          identificationMethod: "manual",
          attendanceTimestamp: recordedAt,
          remarks: manualEntryReason.trim(),
        }, effectivePhase);
        setActiveRows((current) => upsertAttendanceRow(current, localAttendanceRow(local, activeEvent.code, participant)));
        if (local.action === "already_recorded") {
          toast.warning(`${participant.displayName}: ${alreadyRecordedAttendanceLabel(local.record.timeOut)}`, {
            description: alreadyRecordedAttendanceDescription(local.record.timeOut),
          });
        } else {
          toast.success(
            `${participant.displayName}: ${local.action === "checked_out" ? "Time Out" : "Time In"} at ${new Date(recordedAt).toLocaleTimeString()}`,
            { description: `${local.safeMessage} Saved on this device; not synced.` },
          );
        }
        return;
      }

      const studentNumber = extractStudentNumber(manualInput);
      if (!studentNumber) {
        throw new Error("Enter an enrolled student name or a valid walk-in student number.");
      }
      const remoteWalkIn = await findRemoteUnverifiedWalkIn(studentNumber);
      if (remoteWalkIn && effectivePhase === "time_in") {
        toast.warning(`Unverified walk-in ${studentNumber}: ${alreadyRecordedAttendanceLabel(remoteWalkIn.timeOut)}`, {
          description: alreadyRecordedAttendanceDescription(remoteWalkIn.timeOut),
        });
        return;
      }
      if (remoteWalkIn && effectivePhase === "time_out") {
        await recordRemoteUnverifiedWalkInTimeOut(remoteWalkIn, "Manual", recordedAt);
        toast.success(`Unverified walk-in ${studentNumber}: Time Out saved`, {
          description: "The original Time In and Manual Time Out were recorded.",
        });
        return;
      }
      const queued = await api.queueWalkInScan({
        eventId,
        sessionId,
        studentNumber,
        identificationMethod: "manual",
        capturePhase: effectivePhase,
        attendanceTimestamp: recordedAt,
        organizerProfileId,
      });
      const walkInStatus = resolveRecordedOrganizerAttendanceStatus({
        timeIn: queued.timeIn,
        timeOut: queued.timeOut,
        attendanceSessionStatus: activeAttendanceSession?.status,
        lateCutoffAt: activeAttendanceSession?.lateCutoffAt,
      });
      setActiveRows((current) => upsertAttendanceRow(current, {
        id: `walkin-${queued.localScanUuid}`,
        studentId: `walkin:${queued.localScanUuid}`,
        studentName: `Unverified walk-in · ${queued.studentNumber}`,
        eventCode: activeEvent.code,
        attendanceMethod: attendanceMethodFromVerification(queued.identificationMethod),
        ...(queued.checkoutIdentificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(queued.checkoutIdentificationMethod) } : {}),
        checkInAt: queued.timeIn,
        checkInTime: formatLocalTime(queued.timeIn),
        ...(queued.timeOut ? { checkOutAt: queued.timeOut, checkOutTime: formatLocalTime(queued.timeOut) } : {}),
        attendanceStatus: walkInStatus,
        isFinalized: false,
      }));
      if (queued.action === "already_recorded") {
        toast.warning(`Unverified walk-in ${queued.studentNumber}: ${alreadyRecordedAttendanceLabel(queued.timeOut)}`, {
          description: alreadyRecordedAttendanceDescription(queued.timeOut),
        });
      } else {
        toast.success(
          `Unverified walk-in ${queued.studentNumber}: ${effectivePhase === "time_in" ? "Time In" : "Time Out"} saved locally`,
          { description: "Awaiting verification and synchronization." },
        );
      }
    };

    if (desktopApi()) {
      const api = desktopApi();
      const organizerProfileId = session?.userId;
      const preparedLocally = Boolean(
        api
          && organizerProfileId
          && await api.getPreparedEvent(activeEvent.id, organizerProfileId),
      );
      if (preparedLocally) {
        try {
          await recordManualLocally();
          setManualInput("");
          setManualEntryReason("");
          return;
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "The manual attendance entry could not be saved locally.");
          return;
        }
      }
    }

    const localStudents = (offlineLivePackage?.participants ?? [])
      .filter((participant) => participant.isParticipant !== false)
      .map((participant) => ({ id: participant.studentId, studentNumber: participant.studentNumber, fullName: participant.displayName }));
    const attendanceLookupStudents = isLocalAuthoritativeSession ? localStudents : (studentsQuery.data?.items ?? []);
    const lookupResult = resolveManualAttendanceLookup(manualInput, attendanceLookupStudents);
    if (!lookupResult.isValid || !lookupResult.matchedStudentId) {
      toast.warning("Please enter a valid student ID or name.");
      return;
    }

    const resolvedStudentId = lookupResult.matchedStudentId;
    const existingAttendanceRow = activeRows.find((row) => row.studentId === resolvedStudentId);
    if (existingAttendanceRow?.checkOutAt) { toast.warning(`${existingAttendanceRow.studentName} already has a Time In and Time Out.`); return; }
    if (attendancePhase === "time_in" && existingAttendanceRow?.checkInAt) { toast.warning(`${existingAttendanceRow.studentName} already has a Time In.`); return; }
    if (attendancePhase === "time_out" && !existingAttendanceRow?.checkInAt) { toast.warning("No Time In is recorded for this student."); return; }
    const isCheckout = attendancePhase === "time_out";
    const occurredAt = recordedAt;
    const resolvedStatus: ManualAttendanceStatus = isCheckout
      ? existingAttendanceRow?.attendanceStatus === "late" ? "late" : "present"
      : activeAttendanceSession?.lateCutoffAt && new Date(occurredAt) > new Date(activeAttendanceSession.lateCutoffAt) ? "late" : "present";

    if (isCheckout && existingAttendanceRow && !canRecordTimeOut(existingAttendanceRow.checkInAt, occurredAt)) {
      toast.warning("Time Out can be recorded at least one minute after Time In.");
      return;
    }
    const student = attendanceLookupStudents.find((candidate) => candidate.id === resolvedStudentId);
    if (isLocalAuthoritativeSession) {
      const sessionId = activeScannerSessionId ?? resolvedLiveSessionId;
      const participant = offlineLivePackage?.participants.find((candidate) => candidate.studentId === resolvedStudentId);
      if (!sessionId || !participant || (session?.userId && (await getOfflineSessionEndState(activeEvent.id, sessionId, session.userId)).isLocallyEnded)) {
        toast.error("This offline event is unavailable for attendance capture.");
        return;
      }
      const local = await recordOfflineAttendance({
        eventId: activeEvent.id,
        sessionId,
        studentId: resolvedStudentId,
        identificationMethod: "manual",
        attendanceTimestamp: occurredAt,
        attendanceStatus: resolvedStatus,
        remarks: manualEntryReason.trim()
      }, attendancePhase);
      setActiveRows((current) => upsertAttendanceRow(current, localAttendanceRow(local, activeEvent.code, participant)));
      toast.success(local.action === "checked_out" ? "Student Time Out saved on this device." : local.action === "already_recorded" ? "Student attendance is already recorded." : "Student Time In saved on this device.");
      setManualInput("");
      setManualEntryReason("");
      return;
    }
    const result = await manualAttendanceMutation.mutateAsync({
      sessionId: liveSessionId ?? activeAttendanceSession?.id ?? "",
      studentId: resolvedStudentId,
      reason: manualEntryReason.trim(),
      remarks: "",
      statusOverride: resolvedStatus,
      occurredAt
    });
    const saved = result.attendanceRecord;
    if (!saved) throw new Error("The attendance record could not be confirmed.");
    setActiveRows((current) => {
      const currentRow = current.find((row) => row.studentId === resolvedStudentId);
      return upsertAttendanceRow(current, {
      id: saved.id,
      studentId: resolvedStudentId,
      studentName: student?.fullName ?? student?.studentNumber ?? resolvedStudentId,
      eventCode: activeEvent.code,
      attendanceMethod: isCheckout && currentRow ? currentRow.attendanceMethod : attendanceMethodFromVerification(saved.verificationMethod),
      ...(isCheckout ? { checkoutAttendanceMethod: "Manual" as const } : saved.checkoutVerificationMethod ? { checkoutAttendanceMethod: attendanceMethodFromVerification(saved.checkoutVerificationMethod) } : {}),
      checkInAt: isCheckout && currentRow ? currentRow.checkInAt : saved.timeIn ?? "",
      checkInTime: isCheckout && currentRow ? currentRow.checkInTime : saved.timeIn ? formatLocalTime(saved.timeIn) : "Not recorded",
      ...(saved.checkedOutAt ? { checkOutAt: saved.checkedOutAt, checkOutTime: formatLocalTime(saved.checkedOutAt) } : {}),
      attendanceStatus: saved.status,
      isFinalized: Boolean(saved.finalizedAt),
      ...(saved.lateReasonCategory ? { lateReason: saved.lateReasonCategory as LateReason } : {})
      });
    });
    toast.success(
      isCheckout
        ? "Student Time Out recorded. Required feedback must still be completed for a final result."
        : "Student Time In recorded. Time Out and required feedback are still needed for a final result."
    );
    setManualInput("");
    setManualEntryReason("");
  }

  function viewEventRecordFromSummary() {
    const eventId = summaryEvent?.id ?? activeEvent?.id;
    if (!eventId) return;
    setSummaryOpen(false);
    navigate(workspaceRoute(
      `${APP_ROUTES.organizerRecords}?event=${encodeURIComponent(eventId)}`,
      `${APP_ROUTES.adminAttendance}?event=${encodeURIComponent(eventId)}`
    ));
  }

  function exportReport(label: string, events = completedEvents) {
    const rows = events.map((event) => ({
      "Event Code": event.code,
      "Event Name": event.name,
      Category: event.category,
      Venue: event.venue,
      Date: event.date,
      Present: event.present,
      Late: event.late,
      Absent: event.absent,
      "Total Registered": event.totalRegistered,
      "Attendance Rate": event.attendanceRate
    }));
    exportTabularReport(label, rows, events.length === 1 && events[0]?.id ? { type: "event", eventId: events[0].id } : undefined);
    toast.success(`${label} downloaded.`);
    
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Exported Event Action",
      targetType: "export_action",
      metadata: { label }
    });
  }

  function exportAttendanceReport(label: string, record: CompletedRecord, rows: AttendanceRow[]) {
    const attendanceRows = rows.map((row) => ({
      "Event Code": record.code,
      "Student Name": row.studentName,
      "Attendance Status": row.attendanceStatus,
      "Time In": row.checkInTime,
      "Time Out": row.checkOutTime ?? "No Time Out",
      "Attendance Method": row.attendanceStatus === "absent" ? "-" : formatAttendanceMethod(row),
      "Late Arrival Reason": row.lateReason ?? "-"
    }));
    exportTabularReport(label, attendanceRows, record.id ? { type: "event", eventId: record.id } : undefined);
    toast.success(`${label} downloaded.`);
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Exported Event Attendance Report",
      targetType: "export_action",
      metadata: { label, eventCode: record.code }
    });
  }

  const incomingColumnsWithActions: Array<ColumnDef<EventRecord> | ColDef<EventRecord>> = [
    {
      id: "actions",
      headerName: "Actions",
      // pin and lock so the action area stays fixed while scrolling
      pinned: "right",
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      width: 270,
      resizable: false,
      sortable: false,
      filter: false,
      cellRenderer: ({ data }: { data: EventRecord }) => {
        const preparation = data.id ? offlinePreparationByEventId.get(data.id) : undefined;
        const ready = preparation?.packageStatus === "READY";
        const label = preparation?.preparing
          ? "Preparing…"
          : ready
            ? "Refresh offline package"
            : preparation?.error
              ? "Retry preparation"
              : "Prepare for Offline Use";

        return (
          <div className="flex items-center gap-2 whitespace-nowrap" style={{ minWidth: 220 }}>
              {canManageOwnedEvents ? <Button
                type="button"
                variant={ready ? "outline" : "default"}
                size="sm"
                className="h-9 rounded-lg px-3"
                title={label}
                aria-label={`${label} for ${data.code}`}
                disabled={preparation?.preparing || !data.id}
                onClick={() => void prepareOfflinePackage(data)}
              >
                {preparation?.preparing ? "Preparing…" : ready ? "Refresh offline" : preparation?.error ? "Retry offline setup" : "Prepare offline"}
              </Button> : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-lg px-3"
                title="View More"
                aria-label={`View ${data.code}`}
                onClick={() => {
                  if (data.id) navigate(workspaceRoute(APP_ROUTES.organizerEvent(data.id), APP_ROUTES.adminEvent(data.id)));
                }}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                View More
              </Button>
            </div>
        );
      }
    } as ColDef<EventRecord>,
    { accessorKey: "code", header: "Event Code" },
    { accessorKey: "name", header: "Event Name" },
    { accessorKey: "venue", header: "Venue" },
    { accessorKey: "date", header: "Date" },
    { accessorKey: "startTime", header: "Start Time" },
    {
      id: "priority",
      header: "Priority",
      cell: ({ row }) => <StatusBadge label={row.original.priorityLevel} tone={priorityTone(row.original.priorityLevel)} />
    },
    {
      id: "readiness",
      header: "Readiness",
      cell: ({ row }) => {
        if (credentialStatusesQuery.isLoading) {
          return <span className="text-xs text-muted-foreground">Checking...</span>;
        }
        const readiness = row.original.id ? readinessByEventId.get(row.original.id) : undefined;
        if (!readiness || readiness.participants === 0) {
          return <span className="text-xs text-muted-foreground">No participants</span>;
        }
        const qrReady = readiness.qrReady === readiness.participants;
        return (
          <button
            type="button"
            className="min-w-36 space-y-1 rounded-md p-1 text-left text-xs transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            onClick={() => setReadinessEvent(row.original)}
            aria-label={`View attendance readiness for ${row.original.code}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{readiness.participants} registered</span>
              <span className={qrReady ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>{qrReady ? "QR ready" : "QR setup incomplete"}</span>
            </div>
            <p className="text-muted-foreground">QR {readiness.qrReady}/{readiness.participants} · Face {readiness.facialReady}/{readiness.participants}</p>
          </button>
        );
      }
    },
    {
      id: "conflict",
      header: "Schedule",
      cell: ({ row }) => {
        const conflicts = conflictsByCode.get(row.original.code);
        const schedule = eventScheduleLabel(row.original);
        if (!conflicts || conflicts.length === 0) {
          return <span className="whitespace-nowrap text-sm text-muted-foreground">{schedule}</span>;
        }
        const conflictCodes = conflicts.map((item) => item.code).join(", ");
        return (
          <div className="space-y-1">
            <span className="block whitespace-nowrap text-sm text-muted-foreground">{schedule}</span>
            <button
              type="button"
              className="flex items-center gap-1.5 text-left text-xs font-medium text-danger underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              title={`Another event uses the same venue at the same time: ${conflictCodes}`}
              aria-label={`View schedule warning for ${row.original.code}`}
              onClick={() => {
                if (row.original.id) navigate(workspaceRoute(APP_ROUTES.organizerEvent(row.original.id), APP_ROUTES.adminEvent(row.original.id)));
              }}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              {conflicts.length === 1 ? `Same venue and time as ${conflictCodes}` : `${conflicts.length} events share this schedule`}
            </button>
          </div>
        );
      }
    },
    {
      id: "status",
      header: "Offline status",
      minWidth: 180,
      cell: ({ row }) => {
        const preparation = row.original.id ? offlinePreparationByEventId.get(row.original.id) : undefined;
        if (preparation?.packageStatus === "READY") return <StatusBadge label="Ready for Offline Use" tone="success" />;
        if (preparation?.preparing) return <StatusBadge label="Preparing offline package" tone="info" />;
        if (preparation?.error) return <span title={preparation.error}><StatusBadge label="Preparation failed" tone="danger" /></span>;
        return <StatusBadge label={isTodayEvent(row.original) ? "Today" : "Incoming"} tone={isTodayEvent(row.original) ? "success" : "info"} />;
      }
    }
  ];

  const incomingColumns = incomingColumnsWithActions.slice(1);

  const cancelledColumns: Array<ColumnDef<EventRecord> | ColDef<EventRecord>> = [
    {
      id: "actions",
      headerName: "Actions",
      pinned: "right",
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      width: 150,
      sortable: false,
      filter: false,
      cellRenderer: ({ data }: { data: EventRecord }) => (
        <div className="flex justify-start">
          {!canManageOwnedEvents ? <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); if (data.id) navigate(workspaceRoute(APP_ROUTES.organizerEvent(data.id), APP_ROUTES.adminEvent(data.id))); }}>View</Button> : <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setEditEvent(data);
            }}
          >
            Reschedule
          </Button>}
        </div>
      )
    } as ColDef<EventRecord>,
    { accessorKey: "code", header: "Event Code" },
    { accessorKey: "name", header: "Event Name" },
    { accessorKey: "venue", header: "Venue" },
    { accessorKey: "date", header: "Scheduled Date" },
    { accessorKey: "startTime", header: "Start Time" },
    {
      id: "reason",
      header: "Cancellation reason",
      cell: ({ row }) => <span className="block max-w-xs truncate text-sm text-muted-foreground" title={row.original.cancellationReason}>{row.original.cancellationReason || "No reason recorded"}</span>
    }
  ];

  const liveColumns: ColumnDef<AttendanceRow>[] = [
    { accessorKey: "studentName", header: "Student Name" },
    { accessorKey: "checkInTime", header: "Time In" },
    {
      id: "checkOutTime",
      header: "Time Out",
      cell: ({ row }) =>
        row.original.checkOutTime ?? <span className="text-sm text-muted-foreground">No Time Out</span>
    },
    {
      id: "attendanceMethod",
      header: "Attendance Method",
      cell: ({ row }) => row.original.attendanceStatus === "absent" ? "-" : formatAttendanceMethod(row.original)
    },
    { id: "status", header: "Attendance Status", cell: ({ row }) => {
      const label = row.original.isFinalized === true ? row.original.attendanceStatus : "In progress";
      return <StatusBadge label={label} tone={statusTone(label)} />;
    } },
    { id: "lateReason", header: "Late Arrival Category", cell: ({ row }) => row.original.lateReason ?? "-" }
  ];

  const completedColumns: Array<ColumnDef<CompletedRecord> | ColDef<CompletedRecord>> = [
    { accessorKey: "code", header: "Event Code" },
    { accessorKey: "name", header: "Event Name" },
    { accessorKey: "venue", header: "Venue" },
    { accessorKey: "date", header: "Date" },
    { accessorKey: "present", header: "Present" },
    { accessorKey: "late", header: "Late" },
    { accessorKey: "absent", header: "Absent" },
    { accessorKey: "attendanceRate", header: "Attendance Rate" },
    {
      id: "actions",
      headerName: "Actions",
      pinned: "right",
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      width: 120,
      sortable: false,
      filter: false,
      cellRenderer: ({ data }: { data: CompletedRecord }) => (
        <div className="flex justify-start">
          <Button type="button" variant="outline" size="sm" onClick={() => setCompletedModal(data)}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            View More
          </Button>
        </div>
      )
    } as ColDef<CompletedRecord>
  ];

  function TabButton({ tab, label, count }: { tab: EventTab; label: string; count: number }) {
    return (
      <Button
        type="button"
        variant={activeTab === tab ? "default" : "outline"}
        className="h-auto min-h-14 justify-between rounded-lg px-3 py-2.5 text-left"
        onClick={() => {
          setActiveTab(tab);
          setSelectedEventForSession(null);
        }}
      >
        <span>
          <span className="block text-sm font-semibold">{label}</span>
          <span className="mt-0.5 block text-xs font-normal opacity-75">
            {tab === "today" ? "Requires attention today" : tab === "incoming" ? "Future published schedule" : "Events cancelled by the organizer or system"}
          </span>
        </span>
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold text-foreground">
          {count}
        </span>
      </Button>
    );
  }

  if (((!isOfflineMode && eventsQuery.isLoading) || (isOfflineMode && offlinePreparedPackagesLoading)) && !repositoryEvents.length && !offlineLiveSession) {
    return (
      <div className="space-y-4 lg:space-y-5">

        <LoadingState label="Loading events..." />
      </div>
    );
  }

  const isOpeningLiveSession = canManageOwnedEvents && Boolean(sessionIdFromQuery) && handledSessionRouteId !== sessionIdFromQuery && !(activeEvent && liveSessionId === sessionIdFromQuery);
  const hasOfflineLiveWorkspace = Boolean(activeEvent && liveSessionId && offlineLiveSession?.id === liveSessionId);

  if (isOpeningLiveSession) {
    return (
      <div className="space-y-4 lg:space-y-5">
        <PageHeader title="Events" description={isAdmin ? "View institution-wide events and operational status." : isDepartmentAdmin ? "View events managed by organizers in your department." : "Manage events and start attendance sessions."} />
        <LoadingState label="Opening live attendance..." />
      </div>
    );
  }

  if (isOfflineMode && sessionIdFromQuery && !offlineLive.isLoading && !hasOfflineLiveWorkspace && !hasLocallyReadyUnstartedSession) {
    return (
      <div className="space-y-4 lg:space-y-5">
        <ErrorState
          title="Offline session unavailable"
          message={offlineLive.lookupError ?? "This prepared session is missing, not ready, ended, or in conflict. Reconnect and prepare the event again before starting offline."}
        />
      </div>
    );
  }

  if (!isOfflineMode && eventsQuery.isError && !hasOfflineLiveWorkspace) {
    return (
      <div className="space-y-4 lg:space-y-5">

        <ErrorState
          title="Failed to load events"
          message="There was an error fetching events from Supabase. Please try again."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={activeEvent ? "Live attendance session" : "Events"}
        description={activeEvent ? isReadOnlyMonitor ? `Monitoring ${activeEvent.name} in read-only mode.` : `Recording attendance for ${activeEvent.name}.` : isAdmin ? "View institution-wide events, owners, schedules, and operational status." : isDepartmentAdmin ? "View events, organizers, schedules, and live status within your department." : "Find an event, prepare attendance, or open a live session."}
        actions={
          !activeEvent && canManageOwnedEvents ? (
            <Button asChild>
              <NavLink to={workspaceRoute(APP_ROUTES.organizerCreateEvent, APP_ROUTES.adminCreateEvent)}>
                <span className="text-lg leading-none" aria-hidden="true">+</span>
                Create event
              </NavLink>
            </Button>
          ) : undefined
        }
      />

      {!activeEvent ? <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-surface to-surface p-4 shadow-sm md:p-5" aria-label="Event workspace overview">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{isAdmin ? "Institution event workspace" : isDepartmentAdmin ? "Department event workspace" : "Your event workspace"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{isAdmin ? "Review institution-wide schedules and operational status." : isDepartmentAdmin ? "Review schedules and event status for organizers in your department." : "Plan and track scheduled events."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-medium ${conflictsByCode.size ? "bg-danger-muted text-danger" : "bg-surface-muted text-muted-foreground"}`}>
              {conflictsByCode.size ? `${conflictsByCode.size} events need scheduling` : "No schedule conflicts"}
            </span>
            <span className="flex shrink-0 items-center gap-2 rounded-xl border border-primary/10 bg-surface/80 px-4 py-2.5 text-sm">
            <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="font-semibold text-foreground">{activeTab === "today" ? todayEvents.length : activeTab === "incoming" ? incomingEvents.length : cancelledEvents.length}</span>
            <span className="text-muted-foreground">events</span>
            </span>
          </div>
        </div>
        <div className="mt-4 grid w-full grid-cols-3 gap-1 rounded-xl border border-primary/10 bg-background p-1" role="tablist" aria-label="Event schedule">
          <button type="button" role="tab" aria-selected={activeTab === "today"} onClick={() => { setActiveTab("today"); setSelectedEventForSession(null); }} className={`inline-flex min-h-10 items-center justify-center gap-2.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === "today" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}>
            <span className="font-semibold">Today</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activeTab === "today" ? "bg-white/20 text-white" : "bg-background/80 text-foreground"}`}>{todayEvents.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "incoming"} onClick={() => { setActiveTab("incoming"); setSelectedEventForSession(null); }} className={`inline-flex min-h-10 items-center justify-center gap-2.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === "incoming" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}>
            <span className="font-semibold">Incoming</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activeTab === "incoming" ? "bg-white/20 text-white" : "bg-background/80 text-foreground"}`}>{incomingEvents.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "cancelled"} onClick={() => { setActiveTab("cancelled"); setSelectedEventForSession(null); }} className={`inline-flex min-h-10 items-center justify-center gap-2.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${activeTab === "cancelled" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}>
            <span className="font-semibold">Cancelled</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activeTab === "cancelled" ? "bg-white/20 text-white" : "bg-background/80 text-foreground"}`}>{cancelledEvents.length}</span>
          </button>
        </div>
      </section> : null}

      {activeEvent ? (
        isReadOnlyMonitor ? (
          <div className="space-y-5" aria-label="Read-only live event monitor">
            <section className="rounded-2xl border border-border bg-surface shadow-sm">
              <div className="flex flex-col gap-4 border-b border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Activity className="h-4 w-4" aria-hidden="true" /></span><h2 className="truncate text-lg font-semibold">{activeEvent.name}</h2><StatusBadge label="Live" tone="success" /><StatusBadge label={activeAttendanceSession?.status === "active" ? "Session active" : "Session ended"} tone={activeAttendanceSession?.status === "active" ? "success" : "warning"} /></div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{activeEvent.code} <span aria-hidden="true">•</span> {activeEvent.venue}{activeAttendanceSession?.startsAt ? <> <span aria-hidden="true">•</span> Started {formatLocalTime(activeAttendanceSession.startsAt)}</> : null}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => { leavingReadOnlyMonitorRef.current = true; setActiveEvent(null); setLiveSessionId(null); setActiveRows([]); navigate(isDepartmentAdmin ? APP_ROUTES.departmentEvents : APP_ROUTES.adminEvents, { replace: true }); }}><ArrowLeft className="mr-2 h-4 w-4" />Back to all events</Button>
                  <Button type="button" variant="outline" onClick={() => void refetchAttendanceRecords()} disabled={attendanceRecordsQuery.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${attendanceRecordsQuery.isFetching ? "animate-spin" : ""}`} />Refresh monitor</Button>
                </div>
              </div>
            </section>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile label="Attendance records" value={monitorRows.length.toString()} />
              <SummaryTile label="Present" value={monitorRows.filter((row) => row.attendanceStatus === "present").length.toString()} />
              <SummaryTile label="Late" value={monitorRows.filter((row) => row.attendanceStatus === "late").length.toString()} />
              <SummaryTile label="Session" value={activeAttendanceSession?.status === "active" ? "Active" : "Ended"} />
            </div>
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm lg:p-6" aria-label="Live attendance monitor">
              <div className="flex items-center justify-between gap-3"><div><h3 className="text-base font-semibold">Live attendance</h3><p className="mt-1 text-sm text-muted-foreground">Read-only monitoring. Organizers retain all event and attendance controls.</p></div><span className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">Refreshes every 15 seconds</span></div>
              <div className="mt-5 border-t border-border pt-5"><PLPassDataGrid flat hideHeader label="Read-only live attendance" data={monitorRows} columns={liveColumns} isLoading={attendanceRecordsQuery.isFetching} isError={attendanceRecordsQuery.isError} emptyTitle="No attendance recorded yet" emptyDescription="This event is live; attendance will appear here after the organizer records it." /></div>
            </section>
          </div>
        ) : (
        // The original Live Session workspace stays inside Event Management.
        // Advanced QR and facial camera tools open only when requested.
        <>
        <section className="rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border bg-background/40 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Play className="h-4 w-4" aria-hidden="true" /></span>
                <h2 className="truncate text-lg font-semibold">{activeEvent.name}</h2>
                <StatusBadge label="Live" tone="success" />
                <StatusBadge label={attendancePhase === "time_out" ? "Recording Time Out" : "Recording Time In"} tone={attendancePhase === "time_out" ? "warning" : "success"} />
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{activeEvent.code} <span aria-hidden="true">•</span> {activeEvent.venue}{activeAttendanceSession?.lateCutoffAt ? <> <span aria-hidden="true">•</span> Late after {formatLocalTime(activeAttendanceSession.lateCutoffAt)}</> : null}</p>
              {actualStartAt ? <p className="mt-1 text-xs text-muted-foreground">Actual start: {formatLocalTime(actualStartAt)}{startedLateMinutes > 0 ? ` — started ${startedLateMinutes} minute${startedLateMinutes === 1 ? "" : "s"} later than scheduled.` : ""}</p> : null}
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 lg:w-auto lg:flex-nowrap">
              {attendancePhase === "time_in" ? <Button type="button" onClick={() => setTimeOutConfirmOpen(true)}>Open Time Out</Button> : <StatusBadge label="Time Out open" tone="success" />}
              <Button type="button" variant="destructive" disabled={createEventSessionMutation.isPending || endSessionMutation.isPending} onClick={() => { setEndSessionReason(""); setEndSessionConfirmOpen(true); }}>
                <Square className="h-4 w-4" aria-hidden="true" />
                {createEventSessionMutation.isPending || endSessionMutation.isPending ? "Saving…" : "End Session"}
              </Button>
            </div>
          </div>
        </section>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile label="Present" value={activeCounts.present.toString()} />
              <SummaryTile label="Late" value={activeCounts.late.toString()} />
              <SummaryTile label="Absent" value={activeCounts.absent.toString()} />
              <SummaryTile label="Attendance Rate" value={`${activeCounts.rate}%`} />
            </div>

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm lg:p-6" aria-labelledby="attendance-capture-heading">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 id="attendance-capture-heading" className="text-base font-semibold">Attendance capture</h3>
                <p className="mt-1 text-sm text-muted-foreground">{attendancePhase === "time_out" ? "Scan students who have already checked in." : "Students who check in after the late time are marked Late."}</p>
              </div>
              <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-background p-1">
              <Button
                type="button"
                  variant={captureMode === "QR Code" ? "default" : "outline"}
                  className="gap-2 rounded-lg shadow-none"
                  onClick={() => setCaptureMode("QR Code")}
                  aria-pressed={captureMode === "QR Code"}
                >
                  <ScanLine className="h-4 w-4" aria-hidden="true" />
                  QR Code
              </Button>
                <Button
                  type="button"
                  variant={captureMode === "Facial Recognition" ? "default" : "outline"}
                  className="gap-2 rounded-lg shadow-none"
                  onClick={() => setCaptureMode("Facial Recognition")}
                  aria-pressed={captureMode === "Facial Recognition"}
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Facial Recognition
                </Button>
                <Button
                  type="button"
                  variant={captureMode === "Manual" ? "default" : "outline"}
                  className="gap-2 rounded-lg shadow-none"
                  onClick={activateManualCapture}
                  aria-pressed={captureMode === "Manual"}
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  Manual
                </Button>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-5">
                  {captureMode === "QR Code" ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                            <ScanLine className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="font-semibold text-foreground">Scan student QR</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">Scan the student&apos;s PLPass QR code to record {attendancePhase === "time_out" ? "Time Out" : "Time In"}.</p>
                          </div>
                      </div>

                      <div className="border-t border-border pt-4">
                        <div className="mt-3 rounded-lg border border-dashed border-primary/25 bg-primary/5 px-4 py-3 text-sm text-muted-foreground" role="status">
                          {qrInput ? `Last scanner value received: ${qrInput}` : "Ready for a student number or name scan…"}
                        </div>
                      </div>

                    </div>
                  ) : captureMode === "Facial Recognition" ? (
                    <div className="mx-auto max-w-2xl text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <Camera className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-foreground">Facial verification</p>
                      <p id="live-facial-instructions" className="mt-2 text-sm text-muted-foreground">Use this supervised fallback only when QR cannot be read. Keep one enrolled participant centered in the camera.</p>

                      {facialCameraOpen ? (
                        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-black">
                          <video
                            ref={facialVideoRef}
                            aria-label="Live facial verification camera preview"
                            aria-describedby="live-facial-instructions"
                            autoPlay
                            muted
                            playsInline
                            className="aspect-video w-full scale-x-[-1] object-cover"
                          />
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => facialCameraOpen ? setFacialCameraOpen(false) : openLiveFacialVerification()}>
                          <Camera className="h-4 w-4" aria-hidden="true" />
                          {facialCameraOpen ? "Stop camera" : "Open live verification"}
                        </Button>
                        <Button type="button" size="sm" disabled={!facialCameraOpen || facialVerifying} onClick={() => void verifyFacialAttendance()}>
                          {facialVerifying ? "Identifying…" : attendancePhase === "time_out" ? "Verify Time Out" : "Verify attendance"}
                        </Button>
                      </div>
                      {facialStatus ? <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">{facialStatus}</p> : null}
                    </div>
                  ) : captureMode === "Manual" ? (
                    <div className="space-y-4">
                      <div className="border-b border-border pb-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">Manual attendance entry</p>
                          <p className="mt-1 text-sm text-muted-foreground">Record Time In or Time Out. A valid student number outside this event's roster is saved as an unverified walk-in for review. Final status is determined by the session cutoff after required feedback is completed.</p>
                        </div>

                      </div>

                      <form
                        className="grid gap-3"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitManualAttendance();
                        }}
                        onKeyDown={(event) => {
                          // Some desktop shells do not emit the form submit event
                          // consistently from the second field. Handle Enter at the
                          // form boundary so both manual fields have identical
                          // behavior, while preserving validation in the submit path.
                          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                          event.preventDefault();
                          void submitManualAttendance();
                        }}
                      >
                        <label className="space-y-2 text-sm font-medium">
                          Find student
                          <input
                            ref={manualInputRef}
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            placeholder="Enter student ID, name, or walk-in student number"
                            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none"
                          />
                        </label>
                        <label className="space-y-2 text-sm font-medium">
                          Reason for manual entry
                          <input
                            value={manualEntryReason}
                            onChange={(event) => setManualEntryReason(event.target.value)}
                            placeholder="Explain why manual capture is needed"
                            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none"
                          />
                        </label>

                        <div className="flex justify-end">
                          <Button type="submit" className="h-11 rounded-lg px-6">
                            Record Attendance
                          </Button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Choose a capture mode</p>
                      <p className="mt-2 text-sm text-muted-foreground">Tap QR Code, Facial Recognition, or Manual to begin.</p>
                    </div>
                  )}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm lg:p-6" aria-label="Live attendance records">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-8 w-1 rounded-full bg-primary" aria-hidden="true" />
                <div><h3 className="text-base font-semibold">Live attendance list</h3><p className="text-sm text-muted-foreground">Records appear as each student is confirmed.</p></div>
              </div>
              <span className="rounded-full border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">{activeRows.length} records</span>
            </div>
            <div className="mt-5 border-t border-border pt-5"><PLPassDataGrid flat hideHeader label="Live attendance list" data={activeRows} columns={liveColumns} emptyTitle={attendancePhase === "time_out" ? "No Time Out records yet" : "Ready to record Time In"} emptyDescription={attendancePhase === "time_out" ? "Scan a student who has checked in to record Time Out." : "Scan a student QR code or choose another capture method to begin."} /></div>
          </section>

          <ScannerStationsPanel
            eventId={activeEvent.id ?? ""}
            sessionId={activeScannerSessionId ?? ""}
            enabled={Boolean(activeEvent.id && activeScannerSessionId && offlinePreparationByEventId.get(activeEvent.id)?.packageStatus === "READY")}
            capturePhase={attendancePhase}
            organizerProfileId={session?.userId ?? ""}
          />
        </div>
        </>
        )
      ) : (
        <>
          <section className="rounded-xl border bg-surface p-4 shadow-sm md:p-5" aria-label="Refine event list">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-base font-semibold text-foreground">Refine your list</h2><p className="mt-0.5 text-sm text-muted-foreground">Narrow events by date, venue, category, or priority.</p></div>
              {hasEventFilters ? <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEventFilters({ dateFrom: "", dateTo: "", venue: "", category: "", priority: "all" })}
              >
                Clear filters
              </Button> : null}
            </div>
            <div className="mt-4">
              <label className="relative block w-full" htmlFor="event-record-search">
                <span className="sr-only">Search events</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input id="event-record-search" className="h-11 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground" placeholder="Search by code, name, venue, or category..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:col-span-2">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  <span>From date</span>
                  <input
                    id="event-date-from"
                    type="date"
                    className="plpass-field h-10 w-full rounded-md border px-3 text-sm text-foreground"
                    value={eventFilters.dateFrom}
                    max={eventFilters.dateTo || undefined}
                    onChange={(event) => setEventFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  <span>To date</span>
                  <input
                    id="event-date-to"
                    type="date"
                    className="plpass-field h-10 w-full rounded-md border px-3 text-sm text-foreground"
                    value={eventFilters.dateTo}
                    min={eventFilters.dateFrom || undefined}
                    onChange={(event) => setEventFilters((current) => ({ ...current, dateTo: event.target.value }))}
                  />
                </label>
              </div>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>Venue</span>
                <select
                  className="plpass-field h-10 w-full rounded-md border px-3 text-sm text-foreground"
                  value={eventFilters.venue}
                  onChange={(event) => setEventFilters((current) => ({ ...current, venue: event.target.value }))}
                >
                  <option value="">All venues</option>
                  {filterOptions.venues.map((venue) => <option key={venue} value={venue}>{venue}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>Category</span>
                <select
                  className="plpass-field h-10 w-full rounded-md border px-3 text-sm text-foreground"
                  value={eventFilters.category}
                  onChange={(event) => setEventFilters((current) => ({ ...current, category: event.target.value }))}
                >
                  <option value="">All categories</option>
                  {filterOptions.categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-muted-foreground">
                <span>Priority</span>
                <select
                  className="plpass-field h-10 w-full rounded-md border px-3 text-sm text-foreground"
                  value={eventFilters.priority}
                  onChange={(event) => setEventFilters((current) => ({ ...current, priority: event.target.value as EventFilters["priority"] }))}
                >
                  <option value="all">All priorities</option>
                  {filterOptions.priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="animate-fade-in-up" aria-label={selectedListTitle}>
            <PLPassDataGrid
              label={selectedListTitle}
              data={selectedEvents}
              columns={activeTab === "cancelled" ? cancelledColumns : incomingColumns}
              emptyTitle={activeTab === "today" ? "No events today" : activeTab === "incoming" ? "No incoming events" : "No cancelled events"}
              emptyDescription={activeTab === "today" ? "Events scheduled for today will appear here when the date matches." : activeTab === "incoming" ? "Future published events will appear here." : "Cancelled events will be recorded here for reference."}
              onRowClick={(event) => {
                if (!event.id) return;
                if (isOfflineMode) {
                  const localPackage = offlinePackageByEventId.get(event.id);
                  const localSession = localPackage ? preferredOfflineSession(localPackage) : undefined;
                  if (!localSession) return;
                  if (["START_PENDING", "STARTED"].includes(localSession.offlineLifecycle ?? "")) {
                    navigate(workspaceRoute(APP_ROUTES.organizerLiveSession(localSession.id), APP_ROUTES.adminLiveSession(localSession.id)));
                    return;
                  }
                  if (localSession.offlineLifecycle === "NOT_STARTED") {
                    openStartSession(event);
                    return;
                  }
                  toast.warning("This prepared event is awaiting reconciliation and cannot accept more attendance offline.");
                  return;
                }
                const activeSession = isReadOnlyMonitor
                  ? sessionsList.find((session) => session.eventId === event.id && session.status === "active")
                  : undefined;
                if (activeSession) {
                  navigate(workspaceRoute(APP_ROUTES.organizerLiveSession(activeSession.id), APP_ROUTES.adminLiveSession(activeSession.id)));
                  return;
                }
                navigate(workspaceRoute(`${APP_ROUTES.organizerEvents}/${event.id}`, `${APP_ROUTES.adminEvents}/${event.id}`));
              }}
              rowHeight={44}
              headerHeight={40}
            />
          </section>
        </>
      )}

      {readinessEvent && readinessModalSummary ? (
        <ModalFrame onClose={() => setReadinessEvent(null)} width="max-w-3xl">
          <div className="border-b pb-4">
            <h2 className="text-xl font-semibold">Attendance Readiness</h2>
            <p className="mt-1 text-sm text-muted-foreground">{readinessEvent.code} · {readinessEvent.name}</p>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            QR is the primary check-in method. Facial recognition is an optional backup for students who cannot scan their QR code.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryTile label="Registered" value={readinessModalSummary.participants.toString()} />
            <SummaryTile label="QR credentials ready" value={`${readinessModalSummary.qrReady}/${readinessModalSummary.participants}`} />
            <SummaryTile label="Facial backups ready" value={`${readinessModalSummary.facialReady}/${readinessModalSummary.participants}`} />
          </div>

          {readinessModalIssues.length === 0 ? (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              Every registered student has both a usable QR credential and facial backup.
            </div>
          ) : (
            <div className="mt-5">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="font-semibold">Students needing setup</h3>
                  <p className="text-sm text-muted-foreground">Students missing QR need setup before they can use the primary attendance method.</p>
                </div>
                <span className="text-sm text-muted-foreground">{readinessModalIssues.length} to review</span>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium">Student No.</th>
                      <th className="px-4 py-3 font-medium">QR credential</th>
                      <th className="px-4 py-3 font-medium">Facial backup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {readinessModalIssues.map((student) => (
                      <tr key={student.studentId} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">{student.studentName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{student.studentNumber}</td>
                        <td className={`px-4 py-3 font-medium ${student.qrReady ? "text-emerald-700" : "text-amber-700"}`}>{student.qrReady ? "Ready" : "Needs QR"}</td>
                        <td className={`px-4 py-3 font-medium ${student.facialReady ? "text-emerald-700" : "text-muted-foreground"}`}>{student.facialReady ? "Ready" : "Not enrolled"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setReadinessEvent(null)}>Close</Button>
            <Button
              type="button"
              onClick={() => {
                const eventId = readinessEvent.id;
                setReadinessEvent(null);
                navigate(workspaceRoute(`${APP_ROUTES.organizerEvents}/${eventId}`, `${APP_ROUTES.adminEvents}/${eventId}`));
              }}
            >
              Manage participants
            </Button>
          </div>
        </ModalFrame>
      ) : null}

      {eventAttention ? (
        <ModalFrame onClose={() => setEventAttention(null)} width="max-w-md">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold">Event not started</h2>
              <p className="mt-1 text-sm text-muted-foreground">{eventAttention.code} · {eventAttention.name}</p>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            This event was scheduled to start at {eventAttention.startTime}, but no attendance session has been started. Reschedule or cancel it before the end of today.
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEventAttention(null)}>Remind me later</Button>
            <Button type="button" variant="outline" onClick={() => { setEditEvent(eventAttention); setEventAttention(null); }}>Reschedule</Button>
            <Button type="button" variant="destructive" onClick={() => { setConfirmCancelEvent(eventAttention); setEventAttention(null); }}>Cancel event</Button>
          </div>
        </ModalFrame>
      ) : null}

      {confirmCancelEvent ? (
        <ModalFrame onClose={() => setConfirmCancelEvent(null)} width="max-w-md">
          <h2 className="text-lg font-semibold">Confirm Cancel</h2>
          <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to cancel <span className="font-medium">{confirmCancelEvent.code}</span>? This action cannot be undone.</p>
          <label className="mt-4 block space-y-2 text-sm font-medium">
            Cancellation reason
            <textarea className="min-h-20 w-full rounded-lg border bg-background px-3 py-2" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Explain why the event is being cancelled" />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmCancelEvent(null)}>Close</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelEventMutation.isPending || cancelReason.trim().length < 5}
              onClick={() => void cancelEvent(confirmCancelEvent)}
            >
              Cancel Event
            </Button>
          </div>
        </ModalFrame>
      ) : null}

      {editEvent ? (
        <EditEventModalComponent 
          event={editEvent} 
          onClose={() => { setEditEvent(null); setRescheduleForStartId(null); }}
          context={context}
          onRescheduled={(updatedEvent) => {
            if (rescheduleForStartId !== updatedEvent.id) return;
            const refreshed = eventRecordFromRepository(updatedEvent, editEvent?.objectives ?? []);
            setStartEvent(refreshed);
            setRescheduleForStartId(null);
            setSessionForm((current) => ({
              ...current,
              venue: refreshed.venue,
              date: refreshed.date,
              startTime: toTimeInputValue(refreshed.startTime),
              endTime: toTimeInputValue(refreshed.endTime)
            }));
          }}
        />
      ) : null}

      {startEvent ? (
        <ModalFrame onClose={() => setStartEvent(null)} width="max-w-2xl">
          <h2 className="text-xl font-semibold">Start Attendance</h2>
          <p className="mt-1 text-sm text-muted-foreground">{startEvent.code} - {startEvent.name}</p>
          {startEvent.date !== getManilaCalendarDate() ? (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="font-semibold">This event cannot be started today as currently scheduled.</p>
              <p className="mt-1 text-sm">Events may only start on their scheduled Manila date. This event is scheduled for {startEvent.date}; reschedule it to {getManilaCalendarDate()} first, or cancel to leave it unchanged.</p>
              <Button type="button" className="mt-4" onClick={() => {
                setRescheduleForStartId(startEvent.id ?? null);
                setEditEvent({ ...startEvent, date: getManilaCalendarDate() });
                setStartEvent(null);
              }}>
                Reschedule to today
              </Button>
            </div>
          ) : (
          <>
          <section className="mt-5 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground">Planned Schedule</h3>
              </div>
              <span className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">Read only</span>
            </div>
            <dl className="mt-4 grid gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">Venue</dt>
                <dd className="mt-1 font-medium text-foreground">{sessionForm.venue}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">Scheduled start</dt>
                <dd className="mt-1 font-medium text-foreground">{startEvent.date} {startEvent.startTime}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">Scheduled end</dt>
                <dd className="mt-1 font-medium text-foreground">{startEvent.date} {startEvent.endTime}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-muted-foreground">Actual start</dt>
                <dd className="mt-1 font-medium text-foreground">Recorded when Start Session is clicked</dd>
              </div>
            </dl>
          </section>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Late attendance</p>
              <p className="text-xs text-muted-foreground">Counted from the actual start time.</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span>Late after</span>
              <input type="number" min={0} max={240} className="h-9 w-16 rounded-lg border border-border bg-surface px-2 text-center text-sm font-semibold outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={sessionForm.lateCutoffMinutes} onChange={(event) => setSessionForm((current) => ({ ...current, lateCutoffMinutes: Math.max(0, Math.min(240, Number(event.target.value) || 0)) }))} />
              <span>min</span>
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Actual session time:</span> Start is recorded when you click Start Session; end is recorded when you end it. The session can continue past its scheduled end.
          </div>
          {credentialStatusesQuery.isLoading ? (
            <div className="mt-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Checking registered students&apos; QR credentials...
            </div>
          ) : startEventReadiness && startEventReadiness.participants > 0 && startEventMissingQrCount > 0 ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{startEventMissingQrCount} {startEventMissingQrCount === 1 ? "student needs" : "students need"} a QR credential</p>
                  <p className="mt-1 text-amber-900">
                    You can still start the session. Those students can use facial recognition when enrolled, or be recorded manually.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3 border-amber-300 bg-white hover:bg-amber-100"
                    onClick={() => {
                      const eventId = startEvent.id;
                      setStartEvent(null);
                      navigate(workspaceRoute(`${APP_ROUTES.organizerEvents}/${eventId}`, `${APP_ROUTES.adminEvents}/${eventId}`));
                    }}
                  >
                    Manage participants
                  </Button>
                </div>
              </div>
            </div>
          ) : credentialStatusesQuery.isError ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Student credential readiness could not be checked. You can still start the session.
            </div>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStartEvent(null)}>Cancel</Button>
            <Button type="button" onClick={() => void startSession()} disabled={createEventSessionMutation.isPending}><Play className="h-4 w-4" aria-hidden="true" />{createEventSessionMutation.isPending ? "Starting…" : "Start Session"}</Button>
          </div>
          </>
          )}
        </ModalFrame>
      ) : null}

      <ConfirmModal open={timeOutConfirmOpen} title="Open Time Out" description="The live session stays open. Connected phone scanners will immediately record Time Out only." confirmLabel="Open Time Out" onCancel={() => setTimeOutConfirmOpen(false)} onConfirm={() => { setTimeOutConfirmOpen(false); void openTimeOut(); }} />
      <ConfirmModal open={endSessionConfirmOpen} title="End attendance session" description={isEndingAfterScheduledTime ? "This session continued past its scheduled end. Provide a short reason before saving the actual end time." : missingTimeOutRows.length ? `${missingTimeOutRows.length} student${missingTimeOutRows.length === 1 ? " has" : "s have"} Time In but no Time Out. You may end the session; their Time Out will remain blank.` : "All recorded students have Time Out. End this attendance session?"} confirmLabel="End session" tone="danger" onCancel={() => { setEndSessionConfirmOpen(false); setEndSessionReason(""); }} onConfirm={() => void endSession()}>
        {missingTimeOutRows.length ? <p className="text-sm text-muted-foreground">Missing Time Out: {missingTimeOutRows.slice(0, 8).map((row) => row.studentName).join(", ")}{missingTimeOutRows.length > 8 ? "…" : ""}</p> : null}
        {isEndingAfterScheduledTime ? <label className="mt-4 grid gap-2 text-sm font-medium text-foreground">Reason for ending late<textarea className="min-h-20 rounded-lg border bg-background px-3 py-2 text-sm font-normal" value={endSessionReason} onChange={(event) => setEndSessionReason(event.target.value)} placeholder="For example: The program started late due to venue setup." /></label> : null}
      </ConfirmModal>

      {summaryOpen ? (
        <ModalFrame onClose={() => setSummaryOpen(false)} width="max-w-xl">
          <h2 className="text-xl font-semibold">Session Summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">{summaryEvent?.code ?? activeEvent?.code ?? "-"} - {summaryEvent?.name ?? activeEvent?.name ?? ""}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryTile label="Total Participants" value={sessionSummary.totalParticipants.toString()} />
            <SummaryTile label="Present" value={sessionSummary.present.toString()} />
            <SummaryTile label="Late" value={sessionSummary.late.toString()} />
             <SummaryTile label="Absent" value={sessionSummary.absent.toString()} />
            <SummaryTile label="Attendance Rate" value={`${sessionSummary.attendanceRate}%`} />
            <div className="rounded-lg border bg-background p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Most Common Late Arrival Reason</p>
              <p className="mt-1 text-lg font-semibold">{sessionSummary.mostCommonLateReason}</p>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={viewEventRecordFromSummary}>View Event Record</Button>
          </div>
        </ModalFrame>
      ) : null}

      {completedModal ? (
        <CompletedEventModal
          record={completedModal}
          rows={uiState.attendanceRows.filter((row) => row.eventCode === completedModal.code)}
          onClose={() => setCompletedModal(null)}
          onExportReport={(label) => exportReport(label, [completedModal])}
          onExportAttendanceReport={(label, rows) => exportAttendanceReport(label, completedModal, rows)}
        />
      ) : null}

      {selectedObjectivesEvent ? (
        <ModalFrame onClose={() => setSelectedObjectivesEvent(null)} width="max-w-md">
          <div className="border-b pb-4 mb-5">
            <h2 className="text-xl font-bold text-foreground">Event Objectives</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{selectedObjectivesEvent.code}</span> · {selectedObjectivesEvent.name}
            </p>
          </div>

          <div className="space-y-3">
            {selectedObjectivesEvent.objectives && selectedObjectivesEvent.objectives.length > 0 ? (
              selectedObjectivesEvent.objectives.map((objective, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-medium leading-relaxed text-foreground">
                      {objective}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-center">
                <p className="text-sm text-muted-foreground">No objectives defined for this event.</p>
              </div>
            )}
          </div>
        </ModalFrame>
      ) : null}

    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function CompletedEventModal({ record, rows, onClose, onExportReport, onExportAttendanceReport }: { record: CompletedRecord; rows: AttendanceRow[]; onClose: () => void; onExportReport?: (label: string) => void; onExportAttendanceReport?: (label: string, rows: AttendanceRow[]) => void }) {
  const attendanceColumns: ColumnDef<AttendanceRow>[] = [
    { accessorKey: "studentName", header: "Student Name" },
    { id: "attendanceMethod", header: "Attendance Method", cell: ({ row }) => formatAttendanceMethod(row.original) },
    { accessorKey: "checkInTime", header: "Time In" },
    {
      id: "checkOutTime",
      header: "Time Out",
      cell: ({ row }) =>
        row.original.checkOutTime ?? <span className="text-sm text-muted-foreground">No Time Out</span>
    },
    { id: "status", header: "Attendance Status", cell: ({ row }) => <StatusBadge label={row.original.attendanceStatus} tone={statusTone(row.original.attendanceStatus)} /> },
    { id: "lateReason", header: "Late Arrival Reason", cell: ({ row }) => row.original.lateReason ?? "-" }
  ];

  return (
    <ModalFrame onClose={onClose} width="max-w-6xl">
      <p className="text-sm font-semibold text-primary">View More</p>
      <h2 className="mt-1 text-2xl font-semibold">{record.code} - {record.name}</h2>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-surface p-4">
        <div>
          <p className="text-sm font-semibold">Export this event</p>
          <p className="mt-1 text-sm text-muted-foreground">Generate a single-event attendance or summary report from this view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onExportAttendanceReport?.(`Attendance Report XLSX: ${record.code}`, rows)}>
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />Attendance XLSX
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onExportAttendanceReport?.(`Attendance Report PDF: ${record.code}`, rows)}>
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />Attendance PDF
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onExportReport?.(`Event Summary Report XLSX: ${record.code}`)}>
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />Summary XLSX
          </Button>
          <Button type="button" size="sm" onClick={() => onExportReport?.(`Event Summary Report PDF: ${record.code}`)}>
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />Summary PDF
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <SummaryTile label="Present" value={record.present.toString()} />
        <SummaryTile label="Late" value={record.late.toString()} />
        <SummaryTile label="Absent" value={record.absent.toString()} />
        <SummaryTile label="Attendance Rate" value={record.attendanceRate} />
      </div>

      <section className="mt-5 rounded-lg border bg-background p-4">
        <h3 className="font-semibold">Attendee Information</h3>
        <div className="mt-3">
          <PLPassDataGrid label="Attendee information" data={rows} columns={attendanceColumns} emptyTitle="No attendance rows" emptyDescription="Attendance records will appear after Time In." />
        </div>
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border bg-background p-4">
          <h3 className="font-semibold">Late Arrival Breakdown</h3>
          <div className="mt-3 space-y-3">
            {lateBreakdown(rows).map((item) => (
              <div key={item.reason}>
                <div className="flex items-center justify-between text-sm">
                  <span>{item.reason}</span>
                  <span className="font-semibold">{item.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${rows.length ? (item.count / rows.length) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border bg-background p-4">
          <h3 className="font-semibold">Post-Event Objective Results</h3>
          <div className="mt-3 space-y-3">
            {record.objectives.map((objective, index) => (
              <div key={objective} className="rounded-lg border bg-surface p-3">
                <p className="text-sm font-medium">{objective}</p>
                <p className="mt-2 text-sm text-muted-foreground">Average Rating: <span className="font-semibold text-foreground">{index === 0 ? "4.7" : index === 1 ? "4.4" : "4.2"}</span></p>
                <p className="text-sm text-muted-foreground">Number of Responses: <span className="font-semibold text-foreground">{Math.max(record.present - 4 - index, 0)}</span></p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border bg-background p-4">
          <h3 className="font-semibold">Feedback Sentiment</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <SummaryTile label="Positive" value={`${record.sentiment.positive}%`} />
            <SummaryTile label="Neutral" value={`${record.sentiment.neutral}%`} />
            <SummaryTile label="Negative" value={`${record.sentiment.negative}%`} />
          </div>
          <div className="mt-4 space-y-2">
            {record.feedbackComments.map((comment) => <p key={comment} className="rounded-lg border bg-surface p-3 text-sm text-muted-foreground">{comment}</p>)}
          </div>
        </section>
      </div>
    </ModalFrame>
  );
}
