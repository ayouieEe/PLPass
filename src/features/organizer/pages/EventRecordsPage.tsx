import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ColumnDef, RowData } from "@tanstack/react-table";
import type { ColDef } from "ag-grid-community";
import { createPortal } from "react-dom";
import { BarChart3, CalendarCheck, CheckCircle2, Download, FileDown, FileSpreadsheet, FileText, Filter, Search, UserCheck, UserX, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { postgresUuidValues } from "@/lib/utils/postgresUuid";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useEvents, useAuditLogMutations } from "@/hooks/useRepositoryQueries";
import { type ObjectiveFeedbackSummary, useAttendanceSummaries, useEventFeedbackSummaries } from "@/features/organizer/hooks/useEventAttendance";
import { dateKey, formatDisplayTime } from "@/lib/utils/date";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { PriorityLevel } from "@/types/enums";
import { EVENT_CATEGORY_OPTIONS, EVENT_VENUE_OPTIONS } from "@/features/organizer/data/eventFormOptions";
import { formatAttendanceMethod, type OrganizerAttendanceRow } from "@/features/organizer/data/organizerUiStore";
import { exportTabularReport, exportTabularReportSections } from "@/features/organizer/utils/exportUtils";
import { sortCompletedEventsNewestFirst } from "@/features/organizer/utils/completedEventOrdering";
import { PageHeader } from "@/components/shared/PageHeader";
import { getWorkspaceRoute } from "@/lib/utils/workspaceRoutes";

// Lets column defs pass a className through to PLPassDataGrid's <th>/<td>.
// PLPassDataGrid must read column.columnDef.meta?.headerClassName /
// cellClassName when rendering header/body cells for this to take effect —
// if it doesn't yet, add that pass-through there once.
declare module "@tanstack/react-table" {
  // TValue is part of TanStack's declaration-merging contract.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
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
  startsAt?: string;
  endsAt?: string;
  date: string;
  startTime: string;
  endTime: string;
  predictedTurnout: string;
  objectives: Array<EventObjective | string>;
  priorityLevel?: PriorityLevel;
  collegeOffice?: string;
  impactScore?: number | null;
};

type EventObjective = {
  id: string;
  text: string;
};

function objectiveText(objective: EventObjective | string) {
  return typeof objective === "string" ? objective : objective.text;
}

function objectiveKey(objective: EventObjective | string, index: number) {
  return typeof objective === "string" ? `objective-${index}` : objective.id;
}

type AttendanceRow = Omit<OrganizerAttendanceRow, "attendanceStatus"> & { attendanceStatus: AttendanceStatus };

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
  feedbackCount?: number;
  feedbackComments: string[];
  objectiveResults?: Record<string, ObjectiveFeedbackSummary>;
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Completed event report" className={`max-h-[90vh] w-full overflow-hidden rounded-2xl border bg-surface shadow-xl ${width}`} onClick={(event) => event.stopPropagation()}>
        <div className="max-h-[90vh] overflow-y-auto">{children}</div>
      </section>
    </div>,
    document.body
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
  collegeOffice?: string;
  objectives?: Array<EventObjective | string>;
}): CompletedRecord {
  return {
    id: event.id,
    code: event.code,
    name: event.title,
    category: event.category,
    venue: event.venue,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    date: dateKey(event.startsAt),
    startTime: formatDisplayTime(event.startsAt, "08:00 AM"),
    endTime: formatDisplayTime(event.endsAt, "05:00 PM"),
    predictedTurnout: event.predictedTurnout !== null ? `${event.predictedTurnout}%` : "N/A",
    collegeOffice: event.collegeOffice,
    objectives: event.objectives ?? [],
    priorityLevel: event.priorityLevel,
    impactScore: event.impactScore,
    present: 0,
    late: 0,
    absent: 0,
    totalRegistered: 0,
    attendanceRate: "N/A",
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    feedbackCount: 0,
    feedbackComments: [],
    objectiveResults: {}
  };
}

function EventRecordsExportModal({
  isOpen,
  onClose,
  filteredRecords,
  onExportSubmit
}: {
  isOpen: boolean;
  onClose: () => void;
  filteredRecords: CompletedRecord[];
  onExportSubmit: (request: {
    reportType: "summary" | "attendance";
    format: "xlsx" | "pdf";
  }) => void;
}) {
  const [reportType, setReportType] = useState<"summary" | "attendance">("summary");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");

  if (!isOpen) return null;

  function handleExport() {
    onExportSubmit({
      reportType,
      format: exportFormat
    });
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <section
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-records-export-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
              <Download className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="event-records-export-modal-title" className="text-base font-bold text-slate-900">
                Export Event Records
              </h2>
              <p className="text-xs text-slate-500 font-medium">Select a report type and format. Export uses the current page filters.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200/60 bg-white text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close export modal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Step 1: Report Content Selection */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5 font-medium">
              1. Report Content
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                {
                  id: "summary",
                  title: "Event Summary Report",
                  desc: "High-level summary of completed events, schedules, venues & attendance rates.",
                  icon: FileDown
                },
                {
                  id: "attendance",
                  title: "Detailed Attendance Logs",
                  desc: "Participant-level check-in logs, arrival methods & tardiness reasons.",
                  icon: FileSpreadsheet
                }
              ].map((item) => {
                const ItemIcon = item.icon;
                const isSelected = reportType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setReportType(item.id as typeof reportType)}
                    className={`relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                        : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className={`p-1.5 rounded-lg ${isSelected ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                        <ItemIcon className="h-4 w-4" />
                      </div>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{item.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{item.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Download Format Selection */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 font-medium">
              3. Download Format
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat("xlsx")}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                  exportFormat === "xlsx"
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 font-semibold"
                    : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className={`p-2 rounded-lg ${exportFormat === "xlsx" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">Spreadsheet (.XLSX)</p>
                  <p className="text-[10px] text-slate-500 font-normal">Excel workbook format</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat("pdf")}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                  exportFormat === "pdf"
                    ? "border-emerald-500 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-500/20 font-semibold"
                    : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className={`p-2 rounded-lg ${exportFormat === "pdf" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold">PDF Document (.PDF)</p>
                  <p className="text-[10px] text-slate-500 font-normal">Printable formatted report</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {filteredRecords.length} {filteredRecords.length === 1 ? "Event Selected" : "Events Selected"}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export {exportFormat.toUpperCase()}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

export function EventRecordsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | "">("");
  const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleFromDateChange = (nextFromDate: string) => {
    setFromDate(nextFromDate);
    if (nextFromDate && toDate && toDate < nextFromDate) {
      setToDate("");
    }
  };

  const { session } = useDevelopmentSession();
  const isDepartmentAdmin = session?.role === "department_admin";
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined),
    [session]
  );
  const auditLogMutations = useAuditLogMutations(context);
  const eventsQuery = useEvents({ pageSize: 100 }, context);
  const [objectivesByEventId, setObjectivesByEventId] = useState<Map<string, EventObjective[]>>(new Map());

  useEffect(() => {
    const eventIds = postgresUuidValues((eventsQuery.data?.items ?? []).map((event) => event.id));
    if (eventIds.length === 0) {
      setObjectivesByEventId(new Map());
      return;
    }

    const fetchObjectives = async () => {
      const client = getSupabaseBrowserClient();
      const { data, error } = await client
        .from("event_objectives")
        .select("id, event_id, objective_text, objective_order")
        .in("event_id", eventIds)
        .order("objective_order", { ascending: true });

      if (error) {
        console.error("Failed to load event objectives for records page:", error);
        setObjectivesByEventId(new Map());
        return;
      }

      const map = new Map<string, EventObjective[]>();
      for (const row of data ?? []) {
        const eventId = String(row.event_id ?? "");
        const objectiveText = String(row.objective_text ?? "").trim();
        const objectiveId = String(row.id ?? "");
        if (!eventId || !objectiveId || !objectiveText) continue;
        const existing = map.get(eventId) ?? [];
        existing.push({ id: objectiveId, text: objectiveText });
        map.set(eventId, existing);
      }
      setObjectivesByEventId(map);
    };

    void fetchObjectives();
  }, [eventsQuery.data?.items, location.pathname]);

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
          collegeOffice: event.collegeOffice,
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
  const feedbackSummariesQuery = useEventFeedbackSummaries(completedEventIds);

  const repositoryCompletedEventsWithAttendance = useMemo<CompletedRecord[]>(() => {
    return repositoryCompletedEvents.map((event) => {
      const summary = event.id ? attendanceSummariesQuery.data?.[event.id] : undefined;
      const feedback = event.id ? feedbackSummariesQuery.data?.[event.id] : undefined;
      return {
        ...event,
        ...(summary ? {
          present: summary.present,
          late: summary.late,
           absent: summary.absent,
          totalRegistered: summary.totalRegistered,
          attendanceRate: `${summary.attendanceRate}%`
        } : {}),
        ...(feedback ? {
          sentiment: feedback.sentiment,
          feedbackCount: feedback.feedbackCount,
          feedbackComments: feedback.feedbackComments,
          objectiveResults: feedback.objectiveResults
        } : {})
      };
    });
  }, [repositoryCompletedEvents, attendanceSummariesQuery.data, feedbackSummariesQuery.data]);

  const completedRows = repositoryCompletedEventsWithAttendance;
  const selectedCompletedRecord = completedModal
    ? completedRows.find((event) => event.id === completedModal.id) ?? completedModal
    : null;

  useEffect(() => {
    const eventId = new URLSearchParams(location.search).get("event");
    if (!eventId) return;

    const event = completedRows.find((row) => row.id === eventId);
    if (!event) return;

    setCompletedModal(event);
    navigate(getWorkspaceRoute(location.pathname, APP_ROUTES.organizerRecords, APP_ROUTES.adminAttendance), { replace: true });
  }, [completedRows, location.pathname, location.search, navigate]);



  const venueOptions = useMemo(
    () => [...new Set([...EVENT_VENUE_OPTIONS.map((option) => option.value), ...completedRows.map((event) => event.venue.trim()).filter(Boolean)])].sort(),
    [completedRows]
  );
  const categoryOptions = useMemo(
    () => [...new Set([...EVENT_CATEGORY_OPTIONS.map((option) => option.value), ...completedRows.map((event) => event.category.trim()).filter(Boolean)])].sort(),
    [completedRows]
  );
  const pastEvents = useMemo(
    () => sortCompletedEventsNewestFirst(completedRows.filter((event) => {
      const scheduledDate = dateKey(event.startsAt ?? event.date);
      return matchesSearch(event, search)
        && (!fromDate || Boolean(scheduledDate && scheduledDate >= fromDate))
        && (!toDate || Boolean(scheduledDate && scheduledDate <= toDate))
        && (!venueFilter || event.venue === venueFilter)
        && (!categoryFilter || event.category === categoryFilter)
        && (!priorityFilter || event.priorityLevel === priorityFilter);
    })),
    [categoryFilter, completedRows, fromDate, priorityFilter, search, toDate, venueFilter]
  );

  const pastEventsStats = useMemo(() => completedStats(pastEvents), [pastEvents]);
  const hasActiveFilters = Boolean(search || fromDate || toDate || venueFilter || categoryFilter || priorityFilter);

  function clearFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setVenueFilter("");
    setCategoryFilter("");
    setPriorityFilter("");
  }

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
    exportTabularReport(label, rows, events.length === 1 && events[0]?.id ? { type: "event", eventId: events[0].id } : undefined);
    toast.success(`${label} downloaded.`);
    
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Exported Event Record",
      targetType: "export_action",
      metadata: { label }
    });
  }

  function exportAllAttendanceReport(label: string, events = pastEvents) {
    const sections = events.map((event) => ({
      name: `${event.code} — ${event.name}`,
      rows: event.id ? (attendanceSummariesQuery.data?.[event.id]?.rows ?? []).map((row) => ({
        "Student Name": row.studentName,
        "Attendance Status": row.attendanceStatus,
        "Check-in Time": row.checkInTime,
        "Check-out Time": row.checkOutTime ?? "Not checked out",
        "Attendance Method": row.attendanceStatus === "absent" ? "-" : formatAttendanceMethod(row),
        "Late Arrival Reason": row.lateReason ?? "-"
      })) : []
    }));
    if (sections.every((section) => section.rows.length === 0)) {
      toast.warning("No attendance records match the selected events.");
      return;
    }
    const collegeName = events.length === 1 ? events[0]?.collegeOffice : undefined;
    void exportTabularReportSections(label, sections, events.length === 1 && events[0]?.id ? { type: "event", eventId: events[0].id } : undefined, true, collegeName ? { collegeName } : undefined);
    toast.success(`${label} downloaded.`);
    void auditLogMutations.logActionMutation.mutateAsync({
      action: "Exported Event Attendance Report",
      targetType: "export_action",
      metadata: { label, eventCount: events.length }
    });
  }

  function exportAttendanceReport(label: string, record: CompletedRecord, rows: AttendanceRow[]) {
    const attendanceRows = rows.map((row) => ({
      "Event Code": record.code,
      "Student Name": row.studentName,
      "Attendance Status": row.attendanceStatus,
      "Check-in Time": row.checkInTime,
      "Check-out Time": row.checkOutTime ?? "Not checked out",
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
  ];

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader title="Event Records" description={session?.role === "admin" ? "Review institution-wide completed events and attendance outcomes." : isDepartmentAdmin ? "Review completed events and attendance outcomes for organizers in your department." : "Review your completed events and attendance outcomes."} />

      <section aria-label="Completed event summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EventMetricCard title="Completed events" value={String(pastEventsStats.totalEvents)} icon={CalendarCheck} />
        <EventMetricCard title="Average attendance" value={pastEventsStats.avgRate ? `${pastEventsStats.avgRate}%` : "—"} icon={BarChart3} />
        <EventMetricCard title="Present" value={String(pastEventsStats.totalPresent)} icon={UserCheck} />
        <EventMetricCard title="Absent" value={String(pastEventsStats.totalAbsent)} icon={UserX} />
      </section>

      <section className="space-y-4">
        <div className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{session?.role === "admin" ? "Completed events" : isDepartmentAdmin ? "Department completed events" : "Your completed events"}</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Select an event to view its attendance record.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" aria-hidden="true" />
                {pastEvents.length} {pastEvents.length === 1 ? "record" : "records"}
              </span>
              {hasActiveFilters ? <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : null}
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export
              </button>
            </div>
          </div>
          <div className="mt-4 border-t pt-4">
            <label className="relative block min-w-0">
              <span className="sr-only">Search completed events</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input id="event-record-search" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground" placeholder="Search by code, name, venue, or category..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-medium text-muted-foreground">From date</span>
              <input id="event-record-from-date" type="date" className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={fromDate} onChange={(event) => handleFromDateChange(event.target.value)} />
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-medium text-muted-foreground">To date</span>
              <input id="event-record-to-date" type="date" min={fromDate || undefined} className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={toDate} onChange={(event) => setToDate(event.target.value)} />
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-medium text-muted-foreground">Venue</span>
              <select className="h-10 min-w-0 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)}>
                <option value="">All venues</option>
                {venueOptions.map((venue) => <option key={venue} value={venue}>{venue}</option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-medium text-muted-foreground">Category</span>
              <select className="h-10 min-w-0 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">All categories</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-medium text-muted-foreground">Priority</span>
              <select className="h-10 min-w-0 w-full rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityLevel | "")}>
                <option value="">All priorities</option>
                <option value="Time-Sensitive">Time-Sensitive</option>
                <option value="Business-Critical">Business-Critical</option>
                <option value="Flexible">Flexible</option>
              </select>
            </label>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border bg-surface shadow-sm">
          {eventsQuery.isPending ? (
            <LoadingState />
          ) : eventsQuery.isError ? (
            <ErrorState title="Failed to load events" message={eventsQuery.error?.message ?? "An error occurred while loading events. Please try again."} />
          ) : (
            <PLPassDataGrid
              label="Completed events"
              data={pastEvents}
              columns={pastColumns}
              emptyTitle="No completed events"
              emptyDescription="Completed events will appear here."
              enableColumnVisibility
              hideHeader
              onRowClick={setCompletedModal}
            />
          )}
        </section>
      </section>

      <EventRecordsExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        filteredRecords={pastEvents}
        onExportSubmit={(req) => {
          const targetEvents = pastEvents;

          if (targetEvents.length === 0) {
            toast.warning("No completed event records match the selected export criteria.");
            return;
          }

          const label = req.reportType === "summary" ? "Event Summary Report" : "Attendance Report";
          if (req.reportType === "summary") {
            if (req.format === "xlsx") exportReport(`${label} XLSX`, targetEvents);
            else exportReport(`${label} PDF`, targetEvents);
          } else {
            if (req.format === "xlsx") exportAllAttendanceReport(`${label} XLSX`, targetEvents);
            else exportAllAttendanceReport(`${label} PDF`, targetEvents);
          }
        }}
      />

      {completedModal ? (
        <CompletedEventModal
          record={selectedCompletedRecord ?? completedModal}
          rows={
            selectedCompletedRecord?.id ? attendanceSummariesQuery.data?.[selectedCompletedRecord.id]?.rows ?? [] : []
          }
          onClose={() => setCompletedModal(null)}
          onExportReport={(label) => exportReport(label, [completedModal])}
          onExportAttendanceReport={(label, rows) => exportAttendanceReport(label, completedModal, rows)}
        />
      ) : null}
    </div>
  );
}

function EventMetricCard({ title, value, icon: Icon }: { title: string; value: string; icon: LucideIcon }) {
  return (
    <article className="rounded-xl border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-foreground">{value}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </article>
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
    <div className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-surface">
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
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const attendanceColumns: ColumnDef<AttendanceRow>[] = [
    // Who + at-a-glance outcome, grouped first so status doesn't require scrolling to see
    { accessorKey: "studentName", header: "Student Name" },
    {
      id: "verification",
      header: "Verification",
      cell: ({ row }) => row.original.verificationLabel ?? "Verified"
    },
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
      cell: ({ row }) => row.original.attendanceStatus === "absent" ? "-" : formatAttendanceMethod(row.original)
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
      <div className="bg-muted/30">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-surface px-5 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">PLPass event record</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <Button type="button" size="sm" onClick={() => setIsExportMenuOpen((open) => !open)} aria-expanded={isExportMenuOpen}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export
              </Button>
              {isExportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border bg-popover shadow-xl">
                  <div className="border-b px-3 py-2.5">
                    <p className="text-sm font-semibold text-foreground">Export this event</p>
                  </div>
                  <div className="divide-y">
                    <ReportExportRow icon={<FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />} label="Attendance" onExportXlsx={() => { onExportAttendanceReport?.(`Attendance Report XLSX: ${record.code}`, rows); setIsExportMenuOpen(false); }} onExportPdf={() => { onExportAttendanceReport?.(`Attendance Report PDF: ${record.code}`, rows); setIsExportMenuOpen(false); }} />
                    <ReportExportRow icon={<FileDown className="h-3.5 w-3.5" aria-hidden="true" />} label="Event summary" onExportXlsx={() => { onExportReport?.(`Event Summary Report XLSX: ${record.code}`); setIsExportMenuOpen(false); }} onExportPdf={() => { onExportReport?.(`Event Summary Report PDF: ${record.code}`); setIsExportMenuOpen(false); }} />
                  </div>
                </div>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close event record">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <article className="mx-auto max-w-5xl space-y-5 rounded-xl border bg-surface p-5 shadow-sm sm:p-6">
            <section className="border-b pb-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{record.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{record.code} · {record.date} · {record.startTime} - {record.endTime}</p>
                </div>
                {record.priorityLevel ? <StatusBadge label={record.priorityLevel} tone={priorityTone(record.priorityLevel)} /> : null}
              </div>
              <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile label="Category" value={record.category} />
                <SummaryTile label="Venue" value={record.venue} />
                <SummaryTile label="Registered" value={String(record.totalRegistered)} />
                <SummaryTile label="Feedback" value={`${record.feedbackCount ?? 0} responses`} />
              </dl>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-foreground">Attendance summary</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile label="Present" value={record.present.toString()} />
              <SummaryTile label="Late" value={record.late.toString()} />
               <SummaryTile label="Absent" value={record.absent.toString()} />
              <SummaryTile label="Attendance Rate" value={record.attendanceRate} />
              </div>
            </section>

      <section className="mt-5 rounded-3xl border border-border bg-background p-4">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">Attendee Information</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Review individual attendance with check-in, checkout, and method details.
            </p>
          </div>
          <span className="rounded-full border bg-surface-muted px-3 py-1 text-xs font-medium text-muted-foreground">
             {rows.length} participants
          </span>
        </div>

        <PLPassDataGrid
          label="Attendee information"
          data={rows}
          columns={attendanceColumns}
           emptyTitle="No participants"
           emptyDescription="Assigned participants will appear here with Present, Late, or Absent attendance outcomes."
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
                <div key={objectiveKey(objective, index)} className="rounded-lg border bg-background p-3">
                  <p className="text-sm font-medium">{objectiveText(objective)}</p>
                  {record.objectiveResults?.[objectiveKey(objective, index)] ? (
                    <>
                      <p className="mt-2 text-sm text-muted-foreground">Average rating: <span className="font-semibold text-foreground">{record.objectiveResults[objectiveKey(objective, index)].averageRating}/5</span></p>
                      <p className="text-sm text-muted-foreground">Responses: <span className="font-semibold text-foreground">{record.objectiveResults[objectiveKey(objective, index)].responseCount}</span></p>
                    </>
                  ) : <p className="mt-2 text-sm text-muted-foreground">No ratings received.</p>}
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
          </article>
        </main>
      </div>
    </ModalFrame>
  );
}
