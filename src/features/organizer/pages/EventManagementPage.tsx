/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColDef } from "ag-grid-community";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CalendarClock, Camera, Eye, FileDown, Play, ScanLine, Search, Square, X, XCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractQrCredentialId } from "@/lib/credentials/qrCredential";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useEvents, useAttendanceSessions, useAttendanceSessionMutations, useStudents, useEventMutations, useEventObjectives, useAuditLogMutations, useEventRescheduleMutation } from "@/hooks/useRepositoryQueries";
import { dateKey, formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import { eventSessionSchema } from "@/lib/validations/events";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { FinalizeAttendanceRecordInput } from "@/services/contracts";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type { PriorityLevel } from "@/types/enums";
import {
  hasValidEventSchedule,
  isTodayEvent,
  resolveLateStudentManualState,
  resolveManualAttendanceLookup,
  shouldDisplayInEventTab,
  type AttendanceStatus,
  type EventRecord,
  type LateReason,
  type ManualAttendanceStatus
} from "@/features/organizer/utils/eventManagement";
import {
  endOrganizerSession,
  loadOrganizerUiState,
  saveOrganizerUiState,
  startOrganizerSession,
  type OrganizerCompletedEvent,
  type OrganizerAttendanceRow,
  type OrganizerEvent
} from "@/features/organizer/data/organizerUiStore";
import { exportTabularReport } from "@/features/organizer/utils/exportUtils";

// Event Records is organized around three lifecycle tabs: Today, Incoming,
// and Completed. A live session is a full-page state entered after Start Session.
type EventTab = "today" | "incoming";
type AttendanceMethod = "QR Code" | "Facial Recognition" | "Manual";
const defaultAttendanceMethod: AttendanceMethod = "QR Code";
const minimumTimeOutIntervalMs = 60_000;

type AttendanceRow = OrganizerAttendanceRow & {
  /** Set when the student verifies a second time in the same live session. */
  checkOutTime?: string;
};

type DraftAttendanceRow = AttendanceRow & {
  checkInAt: string;
  checkOutAt?: string;
};

type FinalizedSessionSummary = {
  totalParticipants: number;
  present: number;
  late: number;
  absent: number;
  attendanceRate: number;
  pendingStudentTasks: number;
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

export function toTimeInputValue(value: string) {
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

function statusTone(status: AttendanceStatus | "Today" | "Incoming" | "Active" | "Completed") {
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


function countRows(rows: AttendanceRow[]) {
  const present = rows.filter((row) => row.attendanceStatus === "present").length;
  const late = rows.filter((row) => row.attendanceStatus === "late").length;
  const absent = rows.filter((row) => row.attendanceStatus === "absent").length;
  const rate = rows.length ? Math.round(((present + late) / rows.length) * 100) : 0;
  return { present, late, absent, rate };
}

function lateBreakdown(rows: AttendanceRow[]) {
  return lateReasons.map((reason) => ({
    reason,
    count: rows.filter((row) => row.lateReason === reason).length
  }));
}

function commonLateReason(rows: AttendanceRow[]) {
  const [top] = lateBreakdown(rows).sort((a, b) => b.count - a.count);
  return top?.count ? top.reason : "None";
}

function canRecordTimeOut(timeIn: string, attemptedTimeOut: string) {
  return new Date(attemptedTimeOut).getTime() - new Date(timeIn).getTime() >= minimumTimeOutIntervalMs;
}

function summarizeFinalizedSession(rows: Array<{ attendanceStatus: AttendanceStatus; lateReason?: string }>): FinalizedSessionSummary {
  const present = rows.filter((row) => row.attendanceStatus === "present").length;
  const late = rows.filter((row) => row.attendanceStatus === "late").length;
  const absent = rows.filter((row) => row.attendanceStatus === "absent").length;
  const submittedReasons = rows.filter((row) => row.attendanceStatus === "late" && Boolean(row.lateReason));
  const reasonCounts = new Map<string, number>();
  submittedReasons.forEach((row) => {
    const reason = row.lateReason;
    if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  });
  const [topReason, topCount = 0] = [...reasonCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];

  return {
    totalParticipants: rows.length,
    present,
    late,
    absent,
    attendanceRate: rows.length ? Math.round(((present + late) / rows.length) * 100) : 0,
    pendingStudentTasks: present + late,
    mostCommonLateReason: topCount ? topReason : late ? "Awaiting student submission" : "None"
  };
}

function getEventLifecycleStatus(event: EventRecord, activeEventCode: string | undefined, completedCodes: Set<string>, cancelledCodes: string[]) {
  if (activeEventCode === event.code) {
    return "Active";
  }
  if (completedCodes.has(event.code)) {
    return "Completed";
  }
  if (cancelledCodes.includes(event.code)) {
    return "Cancelled";
  }
  return "Upcoming";
}

function ModalFrame({ children, onClose, width = "max-w-3xl" }: { children: ReactNode; onClose: () => void; width?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <section className={`max-h-[90vh] w-full overflow-hidden rounded-lg border bg-surface shadow-xl ${width}`}>
        <div className="flex justify-end border-b px-5 py-3">
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="max-h-[calc(90vh-58px)] overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
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
}

function EditEventModalComponent({ event, onClose, context }: EditEventModalComponentProps) {
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
    try {
      await rescheduleEventMutation.mutateAsync({
        eventId: event.id || "",
        venue: values.venue,
        date: values.date,
        startTime: toTimeInputValue(values.startTime || ""),
        endTime: toTimeInputValue(values.endTime || ""),
        reason: values.reason
      });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reschedule event";
      toast.error(message);
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
  const tabFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");

    if (tab === "incoming") return "incoming" as const;
    return "today" as const;
  }, [location.search]);
  const [activeTab, setActiveTab] = useState<EventTab>(tabFromQuery);
  const [uiState, setUiState] = useState(() => loadOrganizerUiState());
  const [search, setSearch] = useState("");
  const [cancelledCodes, setCancelledCodes] = useState<string[]>([]);
  const [eventModal, setEventModal] = useState<EventRecord | null>(null);
  const [editEvent, setEditEvent] = useState<EventRecord | null>(null);
  const [startEvent, setStartEvent] = useState<EventRecord | null>(null);
  const [activeEvent, setActiveEvent] = useState<EventRecord | null>(null);
  const [activeRows, setActiveRows] = useState<DraftAttendanceRow[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [finalizedSummary, setFinalizedSummary] = useState<FinalizedSessionSummary | null>(null);
  const [completedExtras, setCompletedExtras] = useState<CompletedRecord[]>([]);
  const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);
  const [selectedEventForSession, setSelectedEventForSession] = useState<EventRecord | null>(null);
  const [confirmCancelEvent, setConfirmCancelEvent] = useState<EventRecord | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [captureMode, setCaptureMode] = useState<AttendanceMethod | null>(null);
  const [qrInput, setQrInput] = useState("");
  const [isQrProcessing, setIsQrProcessing] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualStatus, setManualStatus] = useState<ManualAttendanceStatus>("present");
  const [sessionForm, setSessionForm] = useState({
    venue: "",
    date: "",
    startTime: "",
    endTime: "",
    method: defaultAttendanceMethod
  });
  const qrInputRef = useRef<HTMLInputElement>(null);
  const previousManualStudentIdRef = useRef<string | null>(null);

  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
  const eventsQuery = useEvents({ pageSize: 100 }, context);
  const attendanceSessionsQuery = useAttendanceSessions({ pageSize: 200 }, context);
  const { createEventSessionMutation, endSessionMutation } = useAttendanceSessionMutations(context);
  const { completeEventMutation, cancelEventMutation } = useEventMutations(context);
  const auditLogMutations = useAuditLogMutations(context);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [objectivesByEventId, setObjectivesByEventId] = useState<Map<string, string[]>>(new Map());
  const [selectedObjectivesEvent, setSelectedObjectivesEvent] = useState<EventRecord | null>(null);

  const studentsQuery = useStudents({ pageSize: 200 }, context);
  const sessionsList = useMemo(() => attendanceSessionsQuery.data?.items ?? [], [attendanceSessionsQuery.data?.items]);
  const resolvedLiveSessionId = useMemo(() => {
    if (liveSessionId) return liveSessionId;

    const activeForEvent = sessionsList.find((candidate) =>
      candidate.status === "active" && (!activeEvent?.id || candidate.eventId === activeEvent.id)
    );
    return activeForEvent?.id ?? null;
  }, [activeEvent?.id, liveSessionId, sessionsList]);
  const manualLateLock = useMemo(
    () =>
      resolveLateStudentManualState({
        manualInput,
        students: studentsQuery.data?.items ?? [],
        activeRows
      }),
    [activeRows, manualInput, studentsQuery.data?.items]
  );
  const studentNameById = useMemo(() => {
  const map = new Map<string, string>();
  (studentsQuery.data?.items ?? []).forEach((s) => map.set(s.id, s.fullName ?? s.studentNumber));
  return map;
}, [studentsQuery.data?.items]);

  useEffect(() => {
    setActiveTab(tabFromQuery);
  }, [tabFromQuery]);

  useEffect(() => {
    if (manualLateLock.isLateLocked) {
      setManualStatus("late");
    } else if (
      previousManualStudentIdRef.current !== null
      && previousManualStudentIdRef.current !== manualLateLock.matchedStudentId
    ) {
      setManualStatus("present");
    }
    previousManualStudentIdRef.current = manualLateLock.matchedStudentId;
  }, [manualLateLock.isLateLocked, manualLateLock.matchedStudentId]);

  // Fetch objectives for all events from Supabase
  useEffect(() => {
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
  }, [eventsQuery.data?.items]);

  const repositoryEvents = useMemo<EventRecord[]>(() => {
    return (eventsQuery.data?.items ?? [])
      .filter((event) => event.status !== "completed" && event.status !== "cancelled")
      .map((event) => {
        const rec: EventRecord = {
          id: event.id,
          code: event.code,
          name: event.title,
          category: event.category,
          venue: event.venue,
          date: dateKey(event.startsAt),
          startTime: formatDisplayTime(event.startsAt, "08:00 AM"),
          endTime: formatDisplayTime(event.endsAt, "05:00 PM"),
          predictedTurnout: "85%",
          objectives: objectivesByEventId.get(event.id) ?? [],
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
        return rec;
      });
  }, [eventsQuery.data?.items, objectivesByEventId]);

  // Use only Supabase data (repositoryEvents), not UI store events
  const storeEvents = useMemo(
    () => repositoryEvents,
    [repositoryEvents]
  );
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
    () =>
      sortByPriority(
        storeEvents.filter(
          (event) =>
            shouldDisplayInEventTab(event, "today", {
              activeEventCode: activeEvent?.code,
              cancelledCodes,
              completedCodes,
              sessionsList
            }) &&
            matchesSearch(event, search)
        )
      ),
    [activeEvent, cancelledCodes, completedCodes, search, sessionsList, storeEvents]
  );

  const incomingEvents = useMemo(
    () =>
      sortByPriority(
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
      ),
    [activeEvent, cancelledCodes, completedCodes, search, sessionsList, storeEvents]
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

  const activeCounts = countRows(activeRows);
  const sessionSummary = finalizedSummary ?? summarizeFinalizedSession(activeRows);
  const selectedEvents = activeTab === "today" ? todayEvents : incomingEvents;
  const selectedListTitle = activeTab === "today" ? "Today's events" : "Incoming events";
  const selectedListDescription =
    activeTab === "today"
      ? "Events scheduled to run today, ranked by priority and impact."
      : "Published future events, ranked by priority and impact.";

  function openStartSession(event: EventRecord) {
    setStartEvent(event);
    setSessionForm({
      venue: event.venue,
      date: event.date,
      startTime: toTimeInputValue(event.startTime),
      endTime: toTimeInputValue(event.endTime),
      method: defaultAttendanceMethod
    });
  }

  async function cancelEvent(event: EventRecord) {
    if (!event.id || cancelReason.trim().length < 5) {
      toast.error("Provide a cancellation reason of at least 5 characters.");
      return;
    }
    await cancelEventMutation.mutateAsync({ eventId: event.id, reason: cancelReason.trim() });
    setCancelledCodes((current) => (current.includes(event.code) ? current : [...current, event.code]));
    setConfirmCancelEvent(null);
    setEventModal(null);
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

  try {
    const session = await createEventSessionMutation.mutateAsync({
      eventId: startEvent.id,
      venue: sessionForm.venue,
      date: sessionForm.date,
      startTime: sessionForm.startTime,
      expectedEndTime: sessionForm.endTime,
      attendanceMode: "face-to-face"
    });
    setLiveSessionId(session.id);
    setActiveRows([]);
    setFinalizedSummary(null);
    setCaptureMode(defaultAttendanceMethod);
    setActiveEvent({ ...startEvent, venue: sessionForm.venue, date: sessionForm.date, startTime: sessionForm.startTime, endTime: sessionForm.endTime });
    setStartEvent(null);
    setSelectedEventForSession(null);
    toast.success(`${startEvent.code} live session started.`);
    
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Started Live Session",
      targetType: "attendance_session",
      targetId: session.id,
      metadata: { eventCode: startEvent.code, sessionId: session.id }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start session.";
    toast.error(message);
  }
}
 const endSession = useCallback(async () => {
  if (!liveSessionId || !activeEvent?.id) return;
  let attendanceFinalized = false;
  try {
    const attendanceRecords: FinalizeAttendanceRecordInput[] = activeRows.map((row) => ({
      studentId: row.studentId,
      status: row.attendanceStatus === "late" ? "late" : "present",
      verificationMethod:
        row.attendanceMethod === "QR Code"
          ? "qr"
          : row.attendanceMethod === "Facial Recognition"
            ? "facial"
            : "manual",
      timeIn: row.checkInAt,
      ...(row.checkOutAt ? { timeOut: row.checkOutAt } : {}),
      ...(row.lateReason ? { lateReason: row.lateReason } : {})
    }));
    await endSessionMutation.mutateAsync({ sessionId: liveSessionId, reason: "Organizer ended session", attendanceRecords });
    attendanceFinalized = true;
    await completeEventMutation.mutateAsync(activeEvent.id); // ADD — marks the event itself completed
    const { data: finalizedRecords, error: finalizedRecordsError } = await getSupabaseBrowserClient()
      .from("attendance_records")
      .select("attendance_status, late_reason_category")
      .eq("event_session_id", liveSessionId);
    if (finalizedRecordsError) throw finalizedRecordsError;
    setFinalizedSummary(
      summarizeFinalizedSession(
        (finalizedRecords ?? []).map((record) => ({
          attendanceStatus: record.attendance_status as AttendanceStatus,
          lateReason: record.late_reason_category ?? undefined
        }))
      )
    );
    setSummaryOpen(true);
    
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Ended Live Session",
      targetType: "attendance_session",
      targetId: liveSessionId,
      metadata: { eventCode: activeEvent.code, sessionId: liveSessionId }
    });
  } catch (error) {
    // The session mutation already displays its own database error. Only surface
    // errors from later work, such as completing the event, here.
    if (attendanceFinalized) {
      toast.error(error instanceof Error ? error.message : "Failed to complete the event.");
    }
  }
}, [activeEvent?.code, activeEvent?.id, activeRows, auditLogMutations.logActionMutation, liveSessionId, endSessionMutation, completeEventMutation]);

  function focusQrInput() {
    window.requestAnimationFrame(() => qrInputRef.current?.focus());
  }

  async function submitQrAttendance() {
    if (!qrInput.trim() || !liveSessionId || !activeEvent?.id || isQrProcessing) {
      return;
    }

    setIsQrProcessing(true);
    try {
      const credentialId = extractQrCredentialId(qrInput);
      const client = getSupabaseBrowserClient();
      const { data: credential, error: credentialError } = await client
        .from("qr_credentials")
        .select("id, student_id, credential_status, revoked_at, expires_at")
        .eq("id", credentialId)
        .maybeSingle();

      if (credentialError) throw credentialError;
      if (!credential || credential.credential_status !== "activated" || credential.revoked_at || (credential.expires_at && new Date(credential.expires_at).getTime() <= Date.now())) {
        toast.error("Invalid or inactive student QR code.");
        return;
      }

      const { data: participant, error: participantError } = await client
        .from("event_participants")
        .select("id")
        .eq("event_id", activeEvent.id)
        .eq("student_id", credential.student_id)
        .neq("participant_status", "removed")
        .maybeSingle();
      if (participantError) throw participantError;
      if (!participant) {
        toast.error("This student is not assigned to the active event.");
        return;
      }

      const studentId = String(credential.student_id);
      const existing = activeRows.find((row) => row.studentId === studentId);
      if (existing?.checkOutAt) {
        toast.warning(`${existing.studentName} already has a Time In and Time Out.`);
        return;
      }

      const occurredAt = new Date().toISOString();
      if (existing && !canRecordTimeOut(existing.checkInAt, occurredAt)) {
        toast.warning("Time Out can be recorded at least one minute after Time In.");
        return;
      }
      const student = (studentsQuery.data?.items ?? []).find((candidate) => candidate.id === studentId);
      setActiveRows((current) => {
        const currentRow = current.find((row) => row.studentId === studentId);
        if (currentRow) {
          return current.map((row) =>
            row.studentId === studentId
              ? { ...row, checkOutAt: occurredAt, checkOutTime: formatDisplayTime(occurredAt) }
              : row
          );
        }

        return [
          ...current,
          {
            id: `draft-${studentId}`,
            studentId,
            studentName: student?.fullName ?? student?.studentNumber ?? studentId,
            eventCode: activeEvent.code,
            attendanceMethod: "QR Code",
            checkInAt: occurredAt,
            checkInTime: formatDisplayTime(occurredAt),
            attendanceStatus: "present"
          }
        ];
      });
      toast.success(
        existing
          ? `${existing.studentName} Time Out recorded. This will be saved when you end the session.`
          : `${student?.fullName ?? student?.studentNumber ?? "Student"} Time In recorded. This will be saved when you end the session.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The QR code could not be validated.");
    } finally {
      setQrInput("");
      setIsQrProcessing(false);
      focusQrInput();
    }
  }

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

  async function submitManualAttendance() {
    if (!manualInput || !liveSessionId) {
      toast.warning("Please select a student.");
      return;
    }

    const lookupResult = resolveManualAttendanceLookup(manualInput, studentsQuery.data?.items ?? []);
    if (!lookupResult.isValid || !lookupResult.matchedStudentId) {
      toast.warning("Please enter a valid student ID or name.");
      return;
    }

    const resolvedStudentId = lookupResult.matchedStudentId;
    const existingAttendanceRow = activeRows.find((row) => row.studentId === resolvedStudentId);
    const isCheckout = Boolean(existingAttendanceRow);
    const resolvedStatus: ManualAttendanceStatus = isCheckout
      ? existingAttendanceRow?.attendanceStatus === "late" ? "late" : "present"
      : manualStatus;

    const occurredAt = new Date().toISOString();
    if (existingAttendanceRow && !canRecordTimeOut(existingAttendanceRow.checkInAt, occurredAt)) {
      toast.warning("Time Out can be recorded at least one minute after Time In.");
      return;
    }
    const student = (studentsQuery.data?.items ?? []).find((candidate) => candidate.id === resolvedStudentId);
    setActiveRows((current) => {
      const existing = current.find((row) => row.studentId === resolvedStudentId);
      if (existing) {
        return current.map((row) =>
          row.studentId === resolvedStudentId
            ? { ...row, checkOutAt: occurredAt, checkOutTime: formatDisplayTime(occurredAt) }
            : row
        );
      }

      return [
        ...current,
        {
          id: `draft-${resolvedStudentId}`,
          studentId: resolvedStudentId,
          studentName: student?.fullName ?? student?.studentNumber ?? resolvedStudentId,
          eventCode: activeEvent?.code ?? "LIVE",
          attendanceMethod: "Manual",
          checkInAt: occurredAt,
          checkInTime: formatDisplayTime(occurredAt),
          attendanceStatus: resolvedStatus
        }
      ];
    });
    toast.success(
      isCheckout
        ? "Student Time Out recorded. This will be saved when you end the session."
        : "Student Time In recorded. This will be saved when you end the session."
    );
    setManualInput("");
    setManualStatus("present");
  }

  function viewEventRecordFromSummary() {
    if (!activeEvent?.id) {
      return;
    }
    navigate(`${APP_ROUTES.organizerRecords}?event=${encodeURIComponent(activeEvent.id)}`);
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
    exportTabularReport(label, rows);
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
      "Attendance Method": row.attendanceStatus === "absent" ? "-" : row.attendanceMethod,
      "Late Arrival Reason": row.lateReason ?? "-"
    }));
    exportTabularReport(label, attendanceRows);
    toast.success(`${label} downloaded.`);
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Exported Event Attendance Report",
      targetType: "export_action",
      metadata: { label, eventCode: record.code }
    });
  }

  const startSessionToolbar = (
    <Button
      type="button"
      size="sm"
      className="h-9 rounded-lg px-3"
      title="Start Session"
      aria-label="Start selected session"
      onClick={() => {
        if (!selectedEventForSession) {
          toast.warning("Select an event first to start a session.");
          return;
        }
        openStartSession(selectedEventForSession);
      }}
      disabled={!selectedEventForSession}
    >
      <Play className="h-4 w-4" aria-hidden="true" />
      Start Session
    </Button>
  );

  const incomingColumns: Array<ColumnDef<EventRecord> | ColDef<EventRecord>> = [
    {
      id: "actions",
      headerName: "Actions",
      // pin and lock so the action area stays fixed while scrolling
      pinned: "right",
      lockPosition: true,
      lockPinned: true,
      suppressMovable: true,
      width: 220,
      sortable: false,
      filter: false,
      cellRenderer: ({ data }: { data: EventRecord }) => {
        const isToday = isTodayEvent(data);

        return (
          <div className="flex flex-col gap-2 whitespace-nowrap" style={{ minWidth: 180 }}>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-lg px-3"
                title="View More"
                aria-label={`View ${data.code}`}
                onClick={() => setEventModal(data)}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                View More
              </Button>
            </div>
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
      id: "objectives",
      header: "Objectives",
      cell: ({ row }) => {
        const objectives = row.original.objectives ?? [];
        if (objectives.length === 0) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div
            className="cursor-pointer hover:opacity-75 transition-opacity"
            onClick={() => objectives.length > 1 && setSelectedObjectivesEvent(row.original)}
          >
            <p className="text-sm text-foreground truncate">
              {objectives[0]}
            </p>
            {objectives.length > 1 && (
              <p className="text-xs font-semibold text-primary">
                +{objectives.length - 1} more
              </p>
            )}
          </div>
        );
      }
    },
    {
      id: "priority",
      header: "Priority",
      cell: ({ row }) => <StatusBadge label={row.original.priorityLevel} tone={priorityTone(row.original.priorityLevel)} />
    },
    {
      id: "conflict",
      header: "Conflict",
      cell: ({ row }) => {
        const conflicts = conflictsByCode.get(row.original.code);
        if (!conflicts || conflicts.length === 0) {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        const conflictCodes = conflicts.map((item) => item.code).join(", ");
        return (
          <div
            className="flex items-center gap-1.5 text-sm font-medium text-danger"
            title={`Overlaps with ${conflictCodes} at the same venue and time`}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {conflicts.length === 1 ? `Conflicts with ${conflictCodes}` : `${conflicts.length} conflicts`}
          </div>
        );
      }
    },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge label={isTodayEvent(row.original) ? "Today" : "Incoming"} tone={isTodayEvent(row.original) ? "success" : "info"} /> }
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
      cell: ({ row }) => row.original.attendanceStatus === "absent" ? "-" : row.original.attendanceMethod
    },
    { id: "status", header: "Attendance Status", cell: ({ row }) => <StatusBadge label={row.original.attendanceStatus} tone={statusTone(row.original.attendanceStatus)} /> },
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
            {tab === "today" ? "Requires attention today" : "Future published schedule"}
          </span>
        </span>
        <span className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-semibold text-foreground">
          {count}
        </span>
      </Button>
    );
  }

  if (eventsQuery.isLoading && !repositoryEvents.length) {
    return (
      <div className="space-y-4 lg:space-y-5">
        <PageHeader title="Events" description="Review today&apos;s schedule, prepare upcoming events, and start attendance sessions." />
        <LoadingState label="Loading events..." />
      </div>
    );
  }

  if (eventsQuery.isError) {
    return (
      <div className="space-y-4 lg:space-y-5">
        <PageHeader title="Events" description="Review today&apos;s schedule, prepare upcoming events, and start attendance sessions." />
        <ErrorState
          title="Failed to load events"
          message="There was an error fetching events from Supabase. Please try again."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader title="Events" description="Review today&apos;s schedule, prepare upcoming events, and start attendance sessions." />


      {activeEvent ? (
        // The original Live Session workspace stays inside Event Management.
        // Advanced QR and facial camera tools open only when requested.
        <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border bg-background/40 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Play className="h-4 w-4" aria-hidden="true" /></span>
                <h2 className="text-xl font-semibold">Live Session</h2>
                <StatusBadge label="Active" tone="success" />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{activeEvent.code} · {activeEvent.name}</span>
                <span className="mx-2" aria-hidden="true">•</span>{activeEvent.venue}
              </p>
            </div>
            <Button type="button" variant="destructive" disabled={endSessionMutation.isPending} onClick={endSession}>
              <Square className="h-4 w-4" aria-hidden="true" />
              {endSessionMutation.isPending ? "Ending…" : "End Session"}
            </Button>
          </div>
          <div className="space-y-5 p-5 lg:p-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile label="Present" value={activeCounts.present.toString()} />
              <SummaryTile label="Late" value={activeCounts.late.toString()} />
              <SummaryTile label="Absent" value={activeCounts.absent.toString()} />
              <SummaryTile label="Attendance Rate" value={`${activeCounts.rate}%`} />
            </div>

          <section className="rounded-2xl border border-border bg-background/40 p-4 lg:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-semibold">Attendance capture</h3>
                <p className="mt-1 text-sm text-muted-foreground">Choose a verification method. Entries stay in the session draft until you end the session.</p>
              </div>
              <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-sm">
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
                  onClick={() => setCaptureMode("Manual")}
                  aria-pressed={captureMode === "Manual"}
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  Manual
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Current mode</p>
                    <p className="text-lg font-semibold text-foreground">{captureMode ?? "No mode selected"}</p>
                  </div>
                  <StatusBadge label="Live" tone="success" />
                </div>

                <div className="mt-4 rounded-xl border border-border bg-background/40 p-5">
                  {captureMode === "QR Code" ? (
                    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
                      <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                            <ScanLine className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="font-semibold text-foreground">Student QR scanner</p>
                            <p className="mt-0.5 text-sm text-muted-foreground">Scan the student&apos;s PLPass QR code: first scan records Time In; second scan records Time Out.</p>
                          </div>
                      </div>

                      <div className="border-t border-border pt-4">
                        <label className="block text-sm font-semibold text-foreground" htmlFor="student-qr-scan">Scanner input</label>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          id="student-qr-scan"
                          ref={qrInputRef}
                          value={qrInput}
                          onChange={(event) => setQrInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void submitQrAttendance();
                            }
                          }}
                          placeholder="Waiting for a student QR scan…"
                          aria-label="Student QR scan input"
                          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                          disabled={isQrProcessing}
                        />
                        <Button type="button" className="h-11 shrink-0 rounded-lg px-6" onClick={focusQrInput} disabled={isQrProcessing}>
                          <ScanLine className="h-4 w-4" aria-hidden="true" />
                          Focus scanner input
                        </Button>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">Draft only — attendance is saved when you select End Session.</p>
                    </div>
                  ) : captureMode === "Facial Recognition" ? (
                    <div className="text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <Camera className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-foreground">Face scan ready</p>
                      <p className="mt-2 text-sm text-muted-foreground">Open the live camera and let enrolled participants face it one at a time.</p>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          if (!resolvedLiveSessionId) {
                            toast.error("No active attendance session is available for facial verification.");
                            return;
                          }
                          navigate(APP_ROUTES.organizerSession(resolvedLiveSessionId));
                        }}
                      >
                        Open live verification
                      </Button>
                    </div>
                  ) : captureMode === "Manual" ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">Manual attendance entry</p>
                            <p className="mt-1 text-sm text-muted-foreground">Search or select a student, then mark present or late before saving.</p>
                          </div>
                          <div className="inline-flex rounded-full border border-border bg-background p-1">
                            <button
                              type="button"
                              className={`rounded-full px-4 py-2 text-sm ${manualStatus === "present" ? "bg-primary text-white" : "text-muted-foreground"}`}
                              onClick={() => {
                                if (!manualLateLock.isLateLocked) {
                                  setManualStatus("present");
                                }
                              }}
                              disabled={manualLateLock.isLateLocked}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              className={`rounded-full px-4 py-2 text-sm ${manualStatus === "late" || manualLateLock.isLateLocked ? "bg-primary text-white" : "text-muted-foreground"}`}
                              onClick={() => {
                                if (!manualLateLock.isLateLocked) {
                                  setManualStatus("late");
                                }
                              }}
                              disabled={manualLateLock.isLateLocked}
                            >
                              Late
                            </button>
                          </div>
                        </div>

                      </div>

                      <div className="grid gap-3">
                        <label className="space-y-2 text-sm font-medium">
                          Student lookup
                          <input
                            value={manualInput}
                            onChange={(e) => setManualInput(e.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void submitManualAttendance();
                              }
                            }}
                            placeholder="Enter student ID or name"
                            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none"
                          />
                        </label>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">Attendance stays in this session draft and is saved only when you end the session.</p>
                        <Button
                          type="button"
                          className="h-11 rounded-lg px-6"
                          onClick={() => void submitManualAttendance()}
                        >
                          Record Attendance
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Choose a capture mode</p>
                      <p className="mt-2 text-sm text-muted-foreground">Tap QR Code, Facial Recognition, or Manual to begin.</p>
                    </div>
                  )}
                </div>
              </div>

              <aside className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <p className="text-sm font-semibold">Session guide</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>• QR Code for fast contactless Time In and Time Out</li>
                  <li>• Facial Recognition for enrolled participants</li>
                  <li>• Manual entry for verified exceptions</li>
                  <li>• Late-arrival reasons are submitted by students</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {captureMode ? (
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium text-foreground">
                      {captureMode}
                    </span>
                  ) : null}
                  <span className="rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground">
                    Supabase connected
                  </span>
                </div>
              </aside>
            </div>
          </section>

          <PLPassDataGrid label="Live attendance list" data={activeRows} columns={liveColumns} emptyTitle="No Time In records yet" emptyDescription="Live QR or facial recognition attendance records will appear here." />
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-lg border bg-surface p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Event workspace</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Schedule overview</h2>
                <p className="mt-1 text-sm text-muted-foreground">Select an event from the list, then use Start Session to begin attendance.</p>
              </div>
              <div className="w-full lg:max-w-sm">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="event-record-search">Search events</label>
                <div className="mt-1.5 flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <input id="event-record-search" className="w-full bg-transparent text-sm outline-none" placeholder="Code, name, venue, or category" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <SummaryTile label="Today" value={todayEvents.length.toString()} />
              <SummaryTile label="Upcoming" value={incomingEvents.length.toString()} />
              <SummaryTile label="Schedule conflicts" value={conflictsByCode.size.toString()} />
            </div>
          </section>

          <section className="flex items-center" aria-label="Event schedule filters">
            <div className="inline-flex items-center rounded-full border bg-background p-1 shadow-sm" role="tablist" aria-label="Event tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "today"}
                onClick={() => {
                  setActiveTab("today");
                  setSelectedEventForSession(null);
                }}
                className={`inline-flex items-center gap-3 rounded-full px-5 py-2 text-sm font-medium ${
                  activeTab === "today" ? "bg-emerald-700 text-white shadow" : "text-muted-foreground"
                }`}
              >
                <span className="text-sm font-semibold">Today</span>
                <span className={`rounded-full ${activeTab === "today" ? "bg-white/20 text-white" : "bg-background/80 text-foreground"} px-2 py-0.5 text-xs font-semibold`}>
                  {todayEvents.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "incoming"}
                onClick={() => {
                  setActiveTab("incoming");
                  setSelectedEventForSession(null);
                }}
                className={`inline-flex items-center gap-3 rounded-full px-5 py-2 text-sm font-medium ${
                  activeTab === "incoming" ? "bg-emerald-700 text-white shadow" : "text-muted-foreground"
                }`}
              >
                <span className="text-sm font-semibold">Incoming</span>
                <span className={`rounded-full ${activeTab === "incoming" ? "bg-white/20 text-white" : "bg-background/80 text-foreground"} px-2 py-0.5 text-xs font-semibold`}>
                  {incomingEvents.length}
                </span>
              </button>
            </div>
          </section>

          <section className="animate-fade-in-up rounded-lg border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">{selectedListTitle}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{selectedListDescription}</p>
              </div>
              {selectedEventForSession ? (
                <span className="w-fit rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                  {selectedEventForSession.code} selected
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Select one event to start a session.</span>
              )}
            </div>
            <PLPassDataGrid
              label={selectedListTitle}
              data={selectedEvents}
              columns={incomingColumns}
              emptyTitle={activeTab === "today" ? "No events today" : "No incoming events"}
              emptyDescription={activeTab === "today" ? "Events scheduled for today will appear here when the date matches." : "Future published events will appear here."}
              rowSelection="single"
              checkboxSelection
              suppressRowClickSelection
              onSelectionChange={(rows) => setSelectedEventForSession((rows[0] as EventRecord | undefined) ?? null)}
              toolbarActions={startSessionToolbar}
              rowHeight={44}
              headerHeight={40}
              enableColumnVisibility
            />
          </section>
        </>
      )}

      {eventModal ? (
        <ModalFrame onClose={() => setEventModal(null)}>
          <EventDetails
            event={eventModal}
            status={getEventLifecycleStatus(eventModal, activeEvent?.code, completedCodes, cancelledCodes)}
            conflicts={conflictsByCode.get(eventModal.code) ?? []}
            onCancel={() => setConfirmCancelEvent(eventModal)}
            onEdit={(event) => {
              setEditEvent(event);
              setEventModal(null);
            }}
          />
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
          onClose={() => setEditEvent(null)} 
          context={context}
        />
      ) : null}

      {startEvent ? (
        <ModalFrame onClose={() => setStartEvent(null)} width="max-w-2xl">
          <h2 className="text-xl font-semibold">Start Session</h2>
          <p className="mt-1 text-sm text-muted-foreground">{startEvent.code} - {startEvent.name}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm font-medium">
              <span>Venue <span className="text-destructive" aria-hidden="true">*</span></span>
              <input
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={sessionForm.venue}
                readOnly
                aria-readonly="true"
                required
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Schedule Date <span className="text-destructive" aria-hidden="true">*</span></span>
              <input
                type="date"
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={sessionForm.date}
                readOnly
                aria-readonly="true"
                required
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Start Time <span className="text-destructive" aria-hidden="true">*</span></span>
              <input
                type="time"
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={sessionForm.startTime}
                readOnly
                aria-readonly="true"
                required
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>End Time <span className="text-destructive" aria-hidden="true">*</span></span>
              <input
                type="time"
                className="h-12 w-full rounded-xl border border-border bg-background px-4 text-sm font-medium shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={sessionForm.endTime}
                readOnly
                aria-readonly="true"
                required
              />
            </label>
          </div>
          <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            Attendance will use <span className="font-medium text-foreground">QR Code</span> and <span className="font-medium text-foreground">Facial Recognition</span> automatically during the live session.
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStartEvent(null)} disabled={createEventSessionMutation.isPending}>Cancel</Button>
            <Button type="button" onClick={startSession} disabled={createEventSessionMutation.isPending}><Play className="h-4 w-4" aria-hidden="true" />{createEventSessionMutation.isPending ? "Starting..." : "Start Session"}</Button>
          </div>
        </ModalFrame>
      ) : null}

      {summaryOpen ? (
        <ModalFrame onClose={() => setSummaryOpen(false)} width="max-w-xl">
          <h2 className="text-xl font-semibold">Session Summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeEvent?.code} - {activeEvent?.name}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryTile label="Total Participants" value={sessionSummary.totalParticipants.toString()} />
            <SummaryTile label="Present" value={sessionSummary.present.toString()} />
            <SummaryTile label="Late" value={sessionSummary.late.toString()} />
            <SummaryTile label="Absent" value={sessionSummary.absent.toString()} />
            <SummaryTile label="Attendance Rate" value={`${sessionSummary.attendanceRate}%`} />
            <SummaryTile label="Student Tasks Pending" value={sessionSummary.pendingStudentTasks.toString()} />
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

function EventDetails({ event, status, conflicts = [], onCancel, onEdit }: { event: EventRecord; status: string; conflicts?: EventRecord[]; onCancel?: () => void; onEdit?: (event: EventRecord) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">Event Details</p>
        {event.id ? (
          <a href={`/organizer/events/${event.id}`} className="text-sm font-medium text-primary hover:text-primary-hover hover:underline">
            View Full Details →
          </a>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold">{event.code} - {event.name}</h2>
        <StatusBadge label={event.priorityLevel} tone={priorityTone(event.priorityLevel)} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SummaryTile label="Category" value={event.category} />
        <SummaryTile label="Venue" value={event.venue} />
        <SummaryTile label="Date" value={event.date} />
        <SummaryTile label="Schedule" value={`${event.startTime} - ${event.endTime}`} />
        <SummaryTile label="Status" value={status} />
        <SummaryTile label="Predicted Turnout" value={event.predictedTurnout} />
        <SummaryTile label="Priority Tier" value={event.priorityTier ?? event.priorityLevel} />
        <SummaryTile label="Priority Score" value={event.priorityScore == null ? "Not set" : `${event.priorityScore}/9`} />
      </div>
      {conflicts.length > 0 ? (
        <section className="mt-5 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <h3 className="font-semibold">Schedule Conflict Detected</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            This event overlaps at the same venue and time with:
          </p>

          <ul className="mt-2 space-y-1">
            {conflicts.map((conflict) => (
              <li key={conflict.code} className="flex items-center justify-between rounded-md border bg-background p-2 text-sm">
                <span>{conflict.code} - {conflict.name}</span>
                <StatusBadge label={conflict.priorityLevel} tone={priorityTone(conflict.priorityLevel)} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Higher-priority and higher-impact events are ranked first in the event list to help decide which one keeps the slot.
          </p>
        </section>
      ) : null}
      {event.description ? (
        <section className="mt-5 rounded-lg border bg-background p-4">
          <h3 className="font-semibold">Description</h3>
          <p className="mt-2 text-sm text-muted-foreground">{event.description}</p>
        </section>
      ) : null}
      <section className="mt-5 rounded-lg border bg-background p-4">
        <h3 className="font-semibold">Objectives</h3>
        <div className="mt-3 space-y-2">
          {event.objectives.map((objective, index) => <p key={objective} className="text-sm text-muted-foreground">{index + 1}. {objective}</p>)}
        </div>
      </section>
      <div className="mt-6 border-t pt-4">
        <div className="flex justify-end gap-2">
          {onEdit ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onEdit(event)}>
              Edit Event
            </Button>
          ) : null}
          {onCancel ? (
            <Button type="button" variant="destructive" size="sm" onClick={() => onCancel?.()}>
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Cancel Event
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CompletedEventModal({ record, rows, onClose, onExportReport, onExportAttendanceReport }: { record: CompletedRecord; rows: AttendanceRow[]; onClose: () => void; onExportReport?: (label: string) => void; onExportAttendanceReport?: (label: string, rows: AttendanceRow[]) => void }) {
  const attendanceColumns: ColumnDef<AttendanceRow>[] = [
    { accessorKey: "studentName", header: "Student Name" },
    { accessorKey: "attendanceMethod", header: "Attendance Method" },
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
