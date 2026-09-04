/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ColDef } from "ag-grid-community";
import { Eye, FileDown, FileSpreadsheet, Search, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAttendanceRecords, useEventMutations, useEvents, useStudents, useAuditLogMutations } from "@/hooks/useRepositoryQueries";
import { useAttendanceSummaries } from "@/features/organizer/hooks/useEventAttendance";
import { dateKey, formatDisplayTime } from "@/lib/utils/date";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { PriorityLevel } from "@/types/enums";
import type { OrganizerAttendanceRow } from "@/features/organizer/data/organizerUiStore";
import { exportTabularReport } from "@/features/organizer/utils/exportUtils";

// Lets column defs pass a className through to PLPassDataGrid's <th>/<td>.
// PLPassDataGrid must read column.columnDef.meta?.headerClassName /
// cellClassName when rendering header/body cells for this to take effect —
// if it doesn't yet, add that pass-through there once.
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    headerClassName?: string;
    cellClassName?: string;
    agGrid?: Partial<ColDef<TData>>;
  }
}

type AttendanceStatus = "present" | "late" | "absent";
type LateReason =
  | "Traffic / Commute"
  | "Class or Academic Conflict"
  | "Personal / Health"
  | "Weather / Force Majeure"
  | "Other";

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

const lateReasons: LateReason[] = [
  "Traffic / Commute",
  "Class or Academic Conflict",
  "Personal / Health",
  "Weather / Force Majeure",
  "Other"
];

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

// Aggregate summary stats across the currently filtered set of completed
// events, used to render the stat strip above the completed events grid.
function completedStats(events: CompletedRecord[]) {
  const totalPresent = events.reduce((sum, event) => sum + event.present, 0);
  const totalAbsent = events.reduce((sum, event) => sum + event.absent, 0);
  const rates = events
    .map((event) => Number.parseFloat(event.attendanceRate))
    .filter((rate) => !Number.isNaN(rate));
  const avgRate = rates.length ? (rates.reduce((sum, rate) => sum + rate, 0) / rates.length).toFixed(1) : null;
  return {
    totalEvents: events.length,
    totalPresent,
    totalAbsent,
    avgRate
  };
}

function ModalFrame({
  children,
  onClose,
  width = "max-w-3xl"
}: {
  children: ReactNode;
  onClose: () => void;
  width?: string;
}) {
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
  objectives?: string[];
}): CompletedRecord {
  return {
    id: event.id,
    code: event.code,
    name: event.title,
    category: event.category,
    venue: event.venue,
    date: 
    (event.startsAt),
    startTime: formatDisplayTime(event.startsAt, "08:00 AM"),
    endTime: formatDisplayTime(event.endsAt, "05:00 PM"),
    predictedTurnout: event.predictedTurnout !== null ? `${event.predictedTurnout}%` : "N/A",
    objectives: event.objectives ?? [],
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
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);

  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
  const auditLogMutations = useAuditLogMutations(context);
  const eventsQuery = useEvents({ pageSize: 100 }, context);
  const [objectivesByEventId, setObjectivesByEventId] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    const eventIds = (eventsQuery.data?.items ?? []).map((event) => event.id);
    if (eventIds.length === 0) {
      setObjectivesByEventId(new Map());
      return;
    }

    const fetchObjectives = async () => {
      const client = getSupabaseBrowserClient();
      const { data, error } = await client
        .from("event_objectives")
        .select("event_id, objective_text, objective_order")
        .in("event_id", eventIds)
        .order("objective_order", { ascending: true });

      if (error) {
        console.error("Failed to load event objectives for records page:", error);
        setObjectivesByEventId(new Map());
        return;
      }

      const map = new Map<string, string[]>();
      for (const row of data ?? []) {
        const eventId = String(row.event_id ?? "");
        const objectiveText = String(row.objective_text ?? "").trim();
        if (!eventId || !objectiveText) continue;
        const existing = map.get(eventId) ?? [];
        existing.push(objectiveText);
        map.set(eventId, existing);
      }
      setObjectivesByEventId(map);
    };

    void fetchObjectives();
  }, [eventsQuery.data?.items]);

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
          predictedTurnout: event.predictedTurnout,
          objectives: objectivesByEventId.get(event.id) ?? []
        })
      );
  }, [eventsQuery.data?.items, objectivesByEventId]);

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

  const completedRows = repositoryCompletedEventsWithAttendance;

  useEffect(() => {
    const eventId = new URLSearchParams(location.search).get("event");
    if (!eventId) return;

    const event = completedRows.find((row) => row.id === eventId);
    if (!event) return;

    setCompletedModal(event);
    navigate(APP_ROUTES.organizerRecords, { replace: true });
  }, [completedRows, location.search, navigate]);

  const pastEvents = useMemo(
    () => completedRows.filter((event) => matchesSearch(event, search)),
    [completedRows, search]
  );

  const pastEventsStats = useMemo(() => completedStats(pastEvents), [pastEvents]);

  function exportReport(label: string, events = pastEvents) {
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
      action: "Exported Event Record",
      targetType: "export_action",
      metadata: { label }
    });
  }

  function exportAllAttendanceReport(label: string) {
    const attendanceRows = pastEvents.flatMap((event) =>
      event.id ? (attendanceSummariesQuery.data?.[event.id]?.rows ?? []).map((row) => ({
        "Event Code": event.code,
        "Event Name": event.name,
        "Student Name": row.studentName,
        "Attendance Status": row.attendanceStatus,
        "Check-in Time": row.checkInTime,
        "Check-out Time": row.checkOutTime ?? "Not checked out",
        "Attendance Method": row.attendanceStatus === "absent" ? "-" : row.attendanceMethod,
        "Late Arrival Reason": row.lateReason ?? "-"
      })) : []
    );
    exportTabularReport(label, attendanceRows);
    toast.success(`${label} downloaded.`);
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Exported Event Attendance Report",
      targetType: "export_action",
      metadata: { label, eventCount: pastEvents.length }
    });
  }

  function exportAttendanceReport(label: string, record: CompletedRecord, rows: AttendanceRow[]) {
    const attendanceRows = rows.map((row) => ({
      "Event Code": record.code,
      "Student Name": row.studentName,
      "Attendance Status": row.attendanceStatus,
      "Check-in Time": row.checkInTime,
      "Check-out Time": row.checkOutTime ?? "Not checked out",
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

  const pastColumns: ColumnDef<CompletedRecord>[] = [
    // Identity — what the event is
    { accessorKey: "code", header: "Event Code" },
    { accessorKey: "name", header: "Event Name" },
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
    // When / where — schedule context
    { accessorKey: "date", header: "Date" },
    { accessorKey: "venue", header: "Venue" },
    // Attendance outcome — kept together so the numbers can be scanned as one group
    { accessorKey: "present", header: "Present" },
    { accessorKey: "late", header: "Late" },
    { accessorKey: "absent", header: "Absent" },
    {
      accessorKey: "attendanceRate",
      header: "Attendance Rate",
      cell: ({ row }) => <span className="font-semibold text-foreground">{row.original.attendanceRate}</span>
    },
    // Actions — always last, pinned to the right edge so it stays reachable
    // no matter how far the table scrolls horizontally.
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button type="button" variant="outline" size="sm" onClick={() => setCompletedModal(row.original)}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          View More
        </Button>
      ),
      meta: {
        agGrid: {
          pinned: "right",
          lockPosition: true,
          lockPinned: true,
          suppressMovable: true,
          width: 180
        }
      }
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Event Records" />

      <section className="space-y-4">
        {/* Search card (left, flexible width) and Reports card (right, fixed 320px)
            are stretched to the same row height so Reports doesn't tower over
            Search — keeps the top strip compact and leaves room for the table. */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <section className="rounded-lg border bg-surface p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Search completed events</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Filter by code, name, venue, or category.</p>
                </div>
                <div className="flex w-full max-w-md items-center gap-2 rounded-lg border bg-background px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="event-record-search"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    placeholder="Search completed events..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>
            </section>

            {pastEvents.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryTile label="Events" value={pastEventsStats.totalEvents.toString()} />
                <SummaryTile label="Total Present" value={pastEventsStats.totalPresent.toString()} />
                <SummaryTile label="Total Absent" value={pastEventsStats.totalAbsent.toString()} />
                <SummaryTile
                  label="Avg Attendance"
                  value={pastEventsStats.avgRate !== null ? `${pastEventsStats.avgRate}%` : "N/A"}
                />
              </div>
            ) : null}
          </div>

          <section className="flex flex-col justify-center gap-3 rounded-lg border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h2 className="text-sm font-semibold text-foreground">Reports</h2>
            </div>

            <div className="divide-y divide-border rounded-lg border bg-background">
              <ReportExportRow
                icon={<FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />}
                label="Attendance"
                onExportXlsx={() => exportAllAttendanceReport("Attendance Report XLSX")}
                onExportPdf={() => exportAllAttendanceReport("Attendance Report PDF")}
              />
              <ReportExportRow
                icon={<FileDown className="h-3.5 w-3.5" aria-hidden="true" />}
                label="Event Summary"
                onExportXlsx={() => exportReport("Event Summary Report XLSX")}
                onExportPdf={() => exportReport("Event Summary Report PDF")}
              />
            </div>
          </section>
        </div>

        <section className="rounded-lg border bg-surface p-4 shadow-sm">
          {eventsQuery.isPending ? (
            <LoadingState />
          ) : eventsQuery.isError ? (
            <ErrorState title="Failed to load events" message={eventsQuery.error?.message ?? "An error occurred while loading events. Please try again."} />
          ) : pastEvents.length > 0 ? (
            <>
              <PLPassDataGrid
                label="Completed events"
                data={pastEvents}
                columns={pastColumns}
                emptyTitle="No completed events"
                emptyDescription="Completed events will appear here."
              />
            </>
          ) : (
            <PLPassDataGrid
              label="Completed events"
              data={pastEvents}
              columns={pastColumns}
              emptyTitle="No completed events"
              emptyDescription="Completed events will appear here."
            />
          )}
        </section>
      </section>

      {completedModal ? (
        <CompletedEventModal
          record={completedModal}
          rows={
            completedModal.id ? attendanceSummariesQuery.data?.[completedModal.id]?.rows ?? [] : []
          }
          onClose={() => setCompletedModal(null)}
          onExportReport={(label) => exportReport(label, [completedModal])}
          onExportAttendanceReport={(label, rows) => exportAttendanceReport(label, completedModal, rows)}
        />
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-lg border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-4 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

// A single export option (e.g. "Attendance") offering XLSX and PDF download
// actions as one slim row. Used in the compact Reports panel so both report
// types share one layout instead of duplicating markup per report.
function ReportExportRow({
  icon,
  label,
  onExportXlsx,
  onExportPdf
}: {
  icon: ReactNode;
  label: string;
  onExportXlsx: () => void;
  onExportPdf: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3 transition-colors hover:bg-surface sm:flex-row sm:items-center sm:justify-between sm:gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="min-w-0 text-xs font-medium text-foreground">{label}</span>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button type="button" variant="outline" size="sm" aria-label={`${label} XLSX`} onClick={onExportXlsx}>
          XLSX
        </Button>
        <Button type="button" variant="default" size="sm" className="min-w-[5rem]" aria-label={`${label} PDF`} onClick={onExportPdf}>
          PDF
        </Button>
      </div>
    </div>
  );
}

function EventDetails({ event }: { event: EventRecord }) {
  return (
    <div>
      <p className="text-sm font-semibold text-primary">Event Details</p>
      <h2 className="mt-1 text-2xl font-semibold">
        {event.code} - {event.name}
      </h2>
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
          {event.objectives.map((objective, index) => (
            <p key={objective} className="text-sm text-muted-foreground">
              {index + 1}. {objective}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
}

export function CompletedEventModal({
  record,
  rows,
  onClose,
  onExportReport,
  onExportAttendanceReport
}: {
  record: CompletedRecord;
  rows: AttendanceRow[];
  onClose: () => void;
  onExportReport?: (label: string) => void;
  onExportAttendanceReport?: (label: string, rows: AttendanceRow[]) => void;
}) {
  const attendanceColumns: ColumnDef<AttendanceRow>[] = [
    // Who + at-a-glance outcome, grouped first so status doesn't require scrolling to see
    { accessorKey: "studentName", header: "Student Name" },
    {
      id: "status",
      header: "Attendance Status",
      cell: ({ row }) => <StatusBadge label={row.original.attendanceStatus} tone={statusTone(row.original.attendanceStatus)} />
    },
    // Supporting detail on how/when they checked in
    { accessorKey: "checkInTime", header: "Check-in Time" },
    {
      accessorKey: "checkOutTime",
      header: "Check-out Time",
      cell: ({ row }) => row.original.checkOutTime ?? <span className="text-sm text-muted-foreground">Not checked out</span>
    },
    {
      id: "attendanceMethod",
      header: "Attendance Method",
      cell: ({ row }) => row.original.attendanceStatus === "absent" ? "-" : row.original.attendanceMethod
    },
    // Only relevant for late rows — placed last since it's blank most of the time
    {
      id: "lateReason",
      header: "Late Arrival Reason",
      cell: ({ row }) => row.original.lateReason ?? <span className="text-muted-foreground">—</span>
    }
  ];

  return (
    <ModalFrame onClose={onClose} width="max-w-6xl">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-primary">View More</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold">
                {record.code} - {record.name}
              </h2>
              {record.priorityLevel ? <StatusBadge label={record.priorityLevel} tone={priorityTone(record.priorityLevel)} /> : null}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Review attendee status, check-in/check-out times, and export event reports from a clean modal layout.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_320px] items-stretch">
          <section className="h-full rounded-3xl border border-border bg-background p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Event summary</h3>
                <p className="mt-1 text-sm text-muted-foreground">At-a-glance attendance totals for this event.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 auto-rows-fr">
              <SummaryTile label="Present" value={record.present.toString()} />
              <SummaryTile label="Late" value={record.late.toString()} />
              <SummaryTile label="Absent" value={record.absent.toString()} />
              <SummaryTile label="Attendance Rate" value={record.attendanceRate} />
            </div>
          </section>

          <section className="h-full rounded-3xl border border-border bg-background p-4 shadow-sm">
            <div className="flex h-full flex-col justify-between space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Export this event</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Download this event's reports in XLSX or PDF format.
                </p>
              </div>
              <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
                <ReportExportRow
                  icon={<FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Attendance"
                  onExportXlsx={() => onExportAttendanceReport?.(`Attendance Report XLSX: ${record.code}`, rows)}
                  onExportPdf={() => onExportAttendanceReport?.(`Attendance Report PDF: ${record.code}`, rows)}
                />
                <ReportExportRow
                  icon={<FileDown className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Event Summary"
                  onExportXlsx={() => onExportReport?.(`Event Summary Report XLSX: ${record.code}`)}
                  onExportPdf={() => onExportReport?.(`Event Summary Report PDF: ${record.code}`)}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="mt-5 rounded-3xl border border-border bg-background p-4">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Attendee Information</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Review individual attendance with check-in, checkout, and method details.
            </p>
          </div>
          <span className="rounded-full border bg-surface-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {rows.length} records
          </span>
        </div>

        <PLPassDataGrid
          label="Attendee information"
          data={rows}
          columns={attendanceColumns}
          emptyTitle="No attendance rows"
          emptyDescription="Attendance records will appear after check-in."
        />
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
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${rows.length ? (item.count / rows.length) * 100 : 0}%` }}
                  />
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
                  <p className="mt-2 text-sm text-muted-foreground">
                    Average Rating:{" "}
                    <span className="font-semibold text-foreground">
                      {index === 0 ? "4.7" : index === 1 ? "4.4" : "4.2"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Number of Responses:{" "}
                    <span className="font-semibold text-foreground">{Math.max(record.present - 4 - index, 0)}</span>
                  </p>
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
              record.feedbackComments.map((comment) => (
                <p key={comment} className="rounded-lg border bg-surface p-3 text-sm text-muted-foreground">
                  {comment}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No feedback comments yet.</p>
            )}
          </div>
        </section>
      </div>
    </ModalFrame>
  );
}
