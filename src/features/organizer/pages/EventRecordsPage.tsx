/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Eye, FileDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useEvents } from "@/hooks/useRepositoryQueries";
import { useAttendanceSummaries } from "@/features/organizer/hooks/useEventAttendance";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import type { PriorityLevel } from "@/types/enums";
import {
  createUiExport,
  loadOrganizerUiState,
  type OrganizerCompletedEvent,
  type OrganizerEvent,
  type OrganizerAttendanceRow,
  type AttendanceMethod
} from "@/features/organizer/data/organizerUiStore";
type AttendanceMethodLocal = AttendanceMethod;
type AttendanceStatus = "present" | "late" | "absent";
type LateReason = "Traffic / Commute" | "Class or Academic Conflict" | "Personal / Health" | "Weather / Force Majeure" | "Other";

function priorityTone(level: PriorityLevel) {
  if (level === "Business-Critical") {
    return "danger" as const;
  }
  if (level === "Time-Sensitive") {
    return "warning" as const;
  }
  return "muted" as const;
}

type EventRecord = {
  id?: string;
  code: string;
  name: string;
  category: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  predictedTurnout: string;
  objectives: string[];
  priorityLevel?: PriorityLevel;
  impactScore?: number | null;
};

type AttendanceRow = OrganizerAttendanceRow;

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

function statusTone(status: AttendanceStatus | "Upcoming" | "Active" | "Completed") {
  if (status === "present" || status === "Active" || status === "Completed") {
    return "success" as const;
  }
  if (status === "late" || status === "Upcoming") {
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

function lateBreakdown(rows: AttendanceRow[]) {
  return lateReasons.map((reason) => ({
    reason,
    count: rows.filter((row) => row.lateReason === reason).length
  }));
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

// Local-only completed events (older UI store demo data) are still merged in
// so nothing that previously worked disappears; real Supabase-backed
// completed events are the primary source now.
function eventFromStore(event: OrganizerEvent): EventRecord {
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

// Completed events synced from Supabase. Attendance counts start at zero
// here and are filled in by real attendance_records data once
// useAttendanceSummaries resolves (see repositoryCompletedEventsWithAttendance
// below) — the event itself, its priority, and its schedule are all real
// from the moment this runs.
function completedFromRepositoryEvent(event: {
  id: string;
  code: string;
  title: string;
  category: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  priorityLevel: PriorityLevel;
  impactScore: number | null;
  predictedTurnout: number | null;
}): CompletedRecord {
  return {
    id: event.id,
    code: event.code,
    name: event.title,
    category: event.category,
    venue: event.venue,
    date: event.startsAt.slice(0, 10),
    startTime: formatDisplayTime(event.startsAt, "08:00 AM"),
    endTime: formatDisplayTime(event.endsAt, "05:00 PM"),
    predictedTurnout: event.predictedTurnout !== null ? `${event.predictedTurnout}%` : "N/A",
    objectives: [],
    priorityLevel: event.priorityLevel,
    impactScore: event.impactScore,
    present: 0,
    late: 0,
    absent: 0,
    totalRegistered: 0,
    attendanceRate: "N/A",
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    feedbackComments: []
  };
}

export function EventRecordsPage() {
  const [uiState] = useState(() => loadOrganizerUiState());
  const [search, setSearch] = useState("");
  const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);

  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
  const eventsQuery = useEvents({ pageSize: 100 }, context);

  const repositoryCompletedEvents = useMemo<CompletedRecord[]>(() => {
    return (eventsQuery.data?.items ?? [])
      .filter((event) => event.status === "completed")
      .map((event) =>
        completedFromRepositoryEvent({
          id: event.id,
          code: event.code,
          title: event.title,
          category: event.category,
          venue: event.venue,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          priorityLevel: event.priorityLevel,
          impactScore: event.impactScore,
          predictedTurnout: event.predictedTurnout
        })
      );
  }, [eventsQuery.data?.items]);

  // Real attendance/late/absent/rate + attendee rows for every completed
  // event, fetched in one batched query keyed by event id.
  const completedEventIds = useMemo(
    () => repositoryCompletedEvents.map((event) => event.id).filter((id): id is string => Boolean(id)),
    [repositoryCompletedEvents]
  );
  const attendanceSummariesQuery = useAttendanceSummaries(completedEventIds);

  const repositoryCompletedEventsWithAttendance = useMemo<CompletedRecord[]>(() => {
    return repositoryCompletedEvents.map((event) => {
      const summary = event.id ? attendanceSummariesQuery.data?.[event.id] : undefined;
      if (!summary) {
        return event;
      }
      return {
        ...event,
        present: summary.present,
        late: summary.late,
        absent: summary.absent,
        totalRegistered: summary.totalRegistered,
        attendanceRate: `${summary.attendanceRate}%`
      };
    });
  }, [repositoryCompletedEvents, attendanceSummariesQuery.data]);

  const storeCompletedEvents = useMemo(() => uiState.completedEvents.map(completedFromStore), [uiState.completedEvents]);

 const completedRows = useMemo(
  () =>
    [...repositoryCompletedEventsWithAttendance, ...storeCompletedEvents].filter(
      (event, index, events) => events.findIndex((item) => item.code === event.code) === index
    ),
  [repositoryCompletedEventsWithAttendance, storeCompletedEvents]
);

  const pastEvents = useMemo(
    () => completedRows.filter((event) => matchesSearch(event, search)),
    [completedRows, search]
  );

  function exportReport(label: string) {
    toast.success(createUiExport(label));
  }

  const pastColumns: ColumnDef<CompletedRecord>[] = [
    { accessorKey: "code", header: "Event Code" },
    { accessorKey: "name", header: "Event Name" },
    { accessorKey: "venue", header: "Venue" },
    { accessorKey: "date", header: "Date" },
    {
      id: "priority",
      header: "Priority",
      cell: ({ row }) =>
        row.original.priorityLevel ? (
          <StatusBadge label={row.original.priorityLevel} tone={priorityTone(row.original.priorityLevel)} />
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
    },
    { accessorKey: "present", header: "Present" },
    { accessorKey: "late", header: "Late" },
    { accessorKey: "absent", header: "Absent" },
    { accessorKey: "attendanceRate", header: "Attendance Rate" },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button type="button" variant="outline" size="sm" onClick={() => setCompletedModal(row.original)}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          View More
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Event Records" />

      <section className="rounded-lg border bg-surface p-4">
        <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 w-full max-w-md">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id="event-record-search"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search completed events..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-lg border bg-surface p-4">
          <PLPassDataGrid label="Completed events" data={pastEvents} columns={pastColumns} emptyTitle="No completed events" emptyDescription="Completed events will appear here." />
        </section>

        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">Export attendance or event summary reports.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border bg-background p-4">
              <p className="font-semibold">Attendance Report</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => exportReport("Attendance Report XLSX")}><FileDown className="h-4 w-4" aria-hidden="true" />XLSX</Button>
                <Button type="button" variant="destructive" onClick={() => exportReport("Attendance Report PDF")}><FileDown className="h-4 w-4" aria-hidden="true" />PDF</Button>
              </div>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="font-semibold">Event Summary Report</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => exportReport("Event Summary Report XLSX")}><FileDown className="h-4 w-4" aria-hidden="true" />XLSX</Button>
                <Button type="button" variant="destructive" onClick={() => exportReport("Event Summary Report PDF")}><FileDown className="h-4 w-4" aria-hidden="true" />PDF</Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {completedModal ? (
  <CompletedEventModal
    record={completedModal}
    rows={
      completedModal.id
        ? attendanceSummariesQuery.data?.[completedModal.id]?.rows ?? []
        : uiState.attendanceRows.filter((row) => row.eventCode === completedModal.code)
    }
    onClose={() => setCompletedModal(null)}
    onExportReport={exportReport}
  />
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

function EventDetails({ event }: { event: EventRecord }) {
  return (
    <div>
      <p className="text-sm font-semibold text-primary">Event Details</p>
      <h2 className="mt-1 text-2xl font-semibold">{event.code} - {event.name}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SummaryTile label="Category" value={event.category} />
        <SummaryTile label="Venue" value={event.venue} />
        <SummaryTile label="Date" value={event.date} />
        <SummaryTile label="Schedule" value={`${event.startTime} - ${event.endTime}`} />
        <SummaryTile label="Status" value="Upcoming" />
      </div>
      <section className="mt-5 rounded-lg border bg-background p-4">
        <h3 className="font-semibold">Objectives</h3>
        <div className="mt-3 space-y-2">
          {event.objectives.map((objective, index) => <p key={objective} className="text-sm text-muted-foreground">{index + 1}. {objective}</p>)}
        </div>
      </section>
    </div>
  );
}

export function CompletedEventModal({ record, rows, onClose, onExportReport }: { record: CompletedRecord; rows: AttendanceRow[]; onClose: () => void; onExportReport?: (label: string) => void }) {
  const attendanceColumns: ColumnDef<AttendanceRow>[] = [
    { accessorKey: "studentName", header: "Student Name" },
    { accessorKey: "attendanceMethod", header: "Attendance Method" },
    { accessorKey: "checkInTime", header: "Check-in Time" },
    { id: "status", header: "Attendance Status", cell: ({ row }) => <StatusBadge label={row.original.attendanceStatus} tone={statusTone(row.original.attendanceStatus)} /> },
    { id: "lateReason", header: "Late Arrival Reason", cell: ({ row }) => row.original.lateReason ?? "-" }
  ];

  return (
    <ModalFrame onClose={onClose} width="max-w-6xl">
      <p className="text-sm font-semibold text-primary">View More</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h2 className="text-2xl font-semibold">{record.code} - {record.name}</h2>
        {record.priorityLevel ? <StatusBadge label={record.priorityLevel} tone={priorityTone(record.priorityLevel)} /> : null}
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-surface p-4">
        <div>
          <p className="text-sm font-semibold">Export this event</p>
          <p className="mt-1 text-sm text-muted-foreground">Generate a single-event attendance or summary report from this view.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onExportReport?.(`Attendance Report: ${record.code}`)}>
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />Attendance
          </Button>
          <Button type="button" size="sm" onClick={() => onExportReport?.(`Event Summary Report: ${record.code}`)}>
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />Summary
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
          <PLPassDataGrid label="Attendee information" data={rows} columns={attendanceColumns} emptyTitle="No attendance rows" emptyDescription="Attendance records will appear after check-in." />
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
            {record.objectives.length ? (
              record.objectives.map((objective, index) => (
                <div key={objective} className="rounded-lg border bg-surface p-3">
                  <p className="text-sm font-medium">{objective}</p>
                  <p className="mt-2 text-sm text-muted-foreground">Average Rating: <span className="font-semibold text-foreground">{index === 0 ? "4.7" : index === 1 ? "4.4" : "4.2"}</span></p>
                  <p className="text-sm text-muted-foreground">Number of Responses: <span className="font-semibold text-foreground">{Math.max(record.present - 4 - index, 0)}</span></p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No objective feedback data yet.</p>
            )}
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
            {record.feedbackComments.length ? (
              record.feedbackComments.map((comment) => <p key={comment} className="rounded-lg border bg-surface p-3 text-sm text-muted-foreground">{comment}</p>)
            ) : (
              <p className="text-sm text-muted-foreground">No feedback comments yet.</p>
            )}
          </div>
        </section>
      </div>
    </ModalFrame>
  );
}