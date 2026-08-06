/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, Camera, Eye, FileDown, Play, ScanLine, Search, Square, X, XCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  createUiExport,
  endOrganizerSession,
  loadOrganizerUiState,
  saveOrganizerUiState,
  startOrganizerSession,
  type OrganizerCompletedEvent,
  type OrganizerAttendanceRow,
  type OrganizerEvent
} from "@/features/organizer/data/organizerUiStore";

// Event Records is organized around three lifecycle tabs: Today, Incoming,
// and Completed. A live session is a full-page state entered after Start Session.
type EventTab = "today" | "incoming";
type AttendanceMethod = "QR Code" | "Facial Recognition" | "Manual";
type AttendanceStatus = "present" | "late" | "absent";

const defaultAttendanceMethod: AttendanceMethod = "QR Code";
const dashboardActiveSessionEventCode = "EVT-2026-004";
type LateReason = "Traffic / Commute" | "Class or Academic Conflict" | "Personal / Health" | "Weather / Force Majeure" | "Other";

type EventRecord = {
  code: string;
  name: string;
  category: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  predictedTurnout: string;
  objectives: string[];
  description?: string;
  status?: OrganizerEvent["status"];
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

const allEvents: EventRecord[] = [];

const sessionSummaries: CompletedRecord[] = [];

const attendanceDetails: AttendanceRow[] = [];

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

function isTodayEvent(event: EventRecord) {
  if (event.code === dashboardActiveSessionEventCode) {
    return true;
  }

  const today = new Date();
  const eventDate = new Date(`${event.date}T00:00:00`);
  return [today.getFullYear(), today.getMonth(), today.getDate()].join("-") === [eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()].join("-");
}

function buildLiveRows(method: AttendanceMethod, eventCode: string): AttendanceRow[] {
  return attendanceDetails.slice(0, 10).map((row, index) => ({
    ...row,
    id: `LIVE-${index + 1}`,
    eventCode,
    attendanceMethod: index % 2 === 0 ? method : method === "QR Code" ? "Facial Recognition" : "QR Code"
  }));
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
    ,status: event.status
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

export function EventManagementPage() {
  const location = useLocation();
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
  const [activeRows, setActiveRows] = useState<AttendanceRow[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [completedExtras, setCompletedExtras] = useState<CompletedRecord[]>([]);
  const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);
  const [selectedEventForSession, setSelectedEventForSession] = useState<EventRecord | null>(null);
  const [confirmCancelEvent, setConfirmCancelEvent] = useState<EventRecord | null>(null);
  const [captureMode, setCaptureMode] = useState<AttendanceMethod | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [manualStatus, setManualStatus] = useState<AttendanceStatus>("present");
  const [sessionForm, setSessionForm] = useState({
    venue: "",
    date: "",
    startTime: "",
    endTime: "",
    method: defaultAttendanceMethod
  });

  useEffect(() => {
    setActiveTab(tabFromQuery);
  }, [tabFromQuery]);

  const storeEvents = useMemo(() => uiState.events.map(eventFromStore), [uiState.events]);
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
  const todayEvents = useMemo(
    () =>
      storeEvents.filter(
        (event) =>
          !cancelledCodes.includes(event.code) &&
          !completedCodes.has(event.code) &&
          event.code !== activeEvent?.code &&
          (event.status === "today" || isTodayEvent(event)) &&
          matchesSearch(event, search)
      ),
    [activeEvent, cancelledCodes, completedCodes, search, storeEvents]
  );

  const incomingEvents = useMemo(
    () =>
      storeEvents.filter(
        (event) =>
          !cancelledCodes.includes(event.code) &&
          !completedCodes.has(event.code) &&
          event.code !== activeEvent?.code &&
          (event.status === "incoming" || !isTodayEvent(event)) &&
          matchesSearch(event, search)
      ),
    [activeEvent, cancelledCodes, completedCodes, search, storeEvents]
  );

  const activeCounts = countRows(activeRows);

  function openStartSession(event: EventRecord) {
    setStartEvent(event);
    setSessionForm({
      venue: event.venue,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      method: defaultAttendanceMethod
    });
  }

  function cancelEvent(event: EventRecord) {
    setCancelledCodes((current) => (current.includes(event.code) ? current : [...current, event.code]));
    setUiState((current) =>
      saveOrganizerUiState({
        ...current,
        events: current.events.map((item) => (item.code === event.code ? { ...item, status: "cancelled" } : item))
      })
    );
    toast.warning(`${event.code} has been cancelled.`);
  }

  function startSession() {
    if (!startEvent) {
      return;
    }
    const updated = { ...startEvent, venue: sessionForm.venue, date: sessionForm.date, startTime: sessionForm.startTime, endTime: sessionForm.endTime };
    setActiveEvent(updated);
    setActiveRows(buildLiveRows(sessionForm.method, updated.code));
    setUiState((current) => startOrganizerSession(current, updated.code));
    setStartEvent(null);
    setSelectedEventForSession(null);
    toast.success(`${updated.code} live session started.`);
    // Per spec, starting a session redirects the organizer to the Live
    // Session interface — handled below by rendering it whenever
    // activeEvent is set, regardless of which tab was previously selected.
  }

  function endSession() {
    setSummaryOpen(true);
  }

  function viewEventRecordFromSummary() {
    if (!activeEvent) {
      return;
    }
    const completed: CompletedRecord = {
      ...activeEvent,
      present: activeCounts.present,
      late: activeCounts.late,
      absent: activeCounts.absent,
      totalRegistered: activeRows.length,
      attendanceRate: `${activeCounts.rate}%`,
      sentiment: { positive: 48, neutral: 35, negative: 17 },
      feedbackComments: ["Session ran a bit long but content was useful.", "Would appreciate printed handouts next time."]
    };
    setUiState((current) => endOrganizerSession(current, activeEvent.code, activeRows));
    setCompletedExtras((current) => [completed, ...current.filter((event) => event.code !== completed.code)]);
    setCompletedModal(completed);
    setActiveEvent(null);
    setActiveRows([]);
    setSummaryOpen(false);
    setActiveTab("today");
    toast.success(`${completed.code} moved to Event Records.`);
  }

  function exportReport(label: string) {
    toast.success(createUiExport(label));
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
      // compact checkbox column
      checkboxSelection: true,
      headerCheckboxSelection: true,
      width: 40,
      pinned: "left",
      lockPosition: true,
      cellClass: "ag-center-cell",
      sortable: false,
      filter: false
    } as ColDef<EventRecord>,
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
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge label={isTodayEvent(row.original) ? "Today" : "Incoming"} tone={isTodayEvent(row.original) ? "success" : "info"} /> }
  ];

  const liveColumns: ColumnDef<AttendanceRow>[] = [
    { accessorKey: "studentName", header: "Student Name" },
    { accessorKey: "checkInTime", header: "Check-in Time" },
    { accessorKey: "attendanceMethod", header: "Attendance Method" },
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
      <Button type="button" variant={activeTab === tab ? "default" : "outline"} className="justify-between gap-3" onClick={() => { setActiveTab(tab); setSelectedEventForSession(null); }}>
        {label}
        <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs text-foreground">{count}</span>
      </Button>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Event Management" title="Event Records" description="Published events appear here after the Create Event workflow; start a session only when the event is ready to run." />


      {activeEvent ? (
        // Per spec: after Start Session, the organizer is redirected to the
        // Live Session interface. It takes over the page until End Session.
        <section className="rounded-lg border bg-surface p-4">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Play className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="text-lg font-semibold">Live Session</h2>
                <StatusBadge label="Active" tone="success" />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeEvent.code} - {activeEvent.name} | {activeEvent.venue} | {sessionForm.method}
              </p>
            </div>
            <Button type="button" variant="destructive" onClick={endSession}>
              <Square className="h-4 w-4" aria-hidden="true" />
              End Session
            </Button>
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <SummaryTile label="Present" value={activeCounts.present.toString()} />
            <SummaryTile label="Late" value={activeCounts.late.toString()} />
            <SummaryTile label="Absent" value={activeCounts.absent.toString()} />
            <SummaryTile label="Attendance Rate" value={`${activeCounts.rate}%`} />
          </div>

          <section className="mb-4 rounded-lg border bg-background/80 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-base font-semibold">Attendance capture</h3>
                <p className="mt-1 text-sm text-muted-foreground">Choose the live method for check-ins and monitor the current capture mode during the session.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={captureMode === "QR Code" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setCaptureMode("QR Code")}
                  aria-pressed={captureMode === "QR Code"}
                >
                  <ScanLine className="h-4 w-4" aria-hidden="true" />
                  QR Code
                </Button>
                <Button
                  type="button"
                  variant={captureMode === "Facial Recognition" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setCaptureMode("Facial Recognition")}
                  aria-pressed={captureMode === "Facial Recognition"}
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  Facial Recognition
                </Button>
                <Button
                  type="button"
                  variant={captureMode === "Manual" ? "default" : "outline"}
                  className="gap-2"
                  onClick={() => setCaptureMode("Manual")}
                  aria-pressed={captureMode === "Manual"}
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  Manual
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-dashed border-primary/20 bg-gradient-to-br from-primary/10 via-background to-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{captureMode ? `Active capture mode: ${captureMode}` : "Select a capture method"}</p>
                  <span className="rounded-full border border-primary/20 bg-background px-3 py-1 text-xs font-medium text-primary">
                    Live session active
                  </span>
                </div>

                <div className="mt-4 rounded-2xl border bg-background/90 p-4 shadow-sm">
                  {captureMode === "QR Code" ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/20 bg-surface p-5 text-center">
                      <div className="grid h-28 w-28 place-items-center rounded-2xl border-2 border-primary/40 bg-white p-3 shadow-inner">
                        <div className="grid h-full w-full grid-cols-3 gap-1 rounded-xl bg-background p-1">
                          {Array.from({ length: 9 }).map((_, index) => (
                            <div key={index} className={`h-full w-full rounded-sm ${index % 2 === 0 ? "bg-primary" : "bg-primary/20"}`} />
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">QR scanner ready</p>
                        <p className="mt-1 text-sm text-muted-foreground">Point the camera at a student QR code to log attendance instantly.</p>
                      </div>
                    </div>
                  ) : captureMode === "Facial Recognition" ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/20 bg-surface p-5 text-center">
                      <div className="relative grid h-28 w-28 place-items-center rounded-full border-4 border-primary/30 bg-primary/10">
                        <div className="h-20 w-20 rounded-full border-4 border-primary/50 bg-background" />
                        <div className="absolute inset-2 rounded-full border border-primary/20" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Face scan ready</p>
                        <p className="mt-1 text-sm text-muted-foreground">Align the student&apos;s face in the frame and verify the match before logging attendance.</p>
                      </div>
                    </div>
                  ) : captureMode === "Manual" ? (
                    <div className="rounded-xl border border-dashed border-primary/20 bg-surface p-5">
                      <p className="text-sm font-semibold text-foreground">Manual attendance entry</p>
                      <p className="mt-1 text-sm text-muted-foreground">Enter student ID or name and record attendance manually.</p>
                      <div className="mt-4 flex flex-col gap-2">
                        <input value={manualInput} onChange={(e) => setManualInput(e.target.value)} placeholder="Student ID or name" className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none" />
                        <div className="flex items-center gap-2">
                          <select value={manualStatus} onChange={(e) => setManualStatus(e.target.value as AttendanceStatus)} className="rounded-md border bg-background px-2 py-1 text-sm">
                            <option value="present">Present</option>
                            <option value="late">Late</option>
                            <option value="absent">Absent</option>
                          </select>
                          <Button
                            type="button"
                            onClick={() => {
                              if (!manualInput.trim() || !activeEvent) {
                                toast.warning("Enter student ID or name first.");
                                return;
                              }
                              const now = new Date();
                              const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                              const newRow: AttendanceRow = {
                                id: `MAN-${Date.now()}`,
                                studentId: manualInput.trim(),
                                studentName: manualInput.trim(),
                                eventCode: activeEvent.code,
                                attendanceMethod: "Manual",
                                checkInTime: time,
                                attendanceStatus: manualStatus
                              };
                              setActiveRows((cur) => [newRow, ...cur]);
                              setManualInput("");
                              toast.success("Manual attendance recorded.");
                            }}
                          >
                            Record
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-primary/20 bg-surface p-5 text-center">
                      <p className="text-sm font-semibold text-foreground">Choose a capture mode</p>
                      <p className="mt-1 text-sm text-muted-foreground">Tap QR Code, Facial Recognition, or Manual to preview the scanner experience.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border bg-surface-muted p-4">
                <p className="text-sm font-semibold">Supported methods</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>• QR Code for fast contactless check-ins</li>
                  <li>• Facial Recognition for hands-free identity confirmation</li>
                  <li>• Automatic late-arrival categories for late check-ins</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {captureMode ? (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      {captureMode}
                    </span>
                  ) : null}
                  <span className="rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground">
                    Preview
                  </span>
                </div>
              </div>
            </div>
          </section>

          <PLPassDataGrid label="Live attendance list" data={activeRows} columns={liveColumns} emptyTitle="No check-ins yet" emptyDescription="Live QR or facial recognition attendance logs will appear here." />
        </section>
      ) : (
        <>
          <section className="rounded-lg border bg-surface p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-2 sm:grid-cols-3">
                <TabButton tab="today" label="Today's Event" count={todayEvents.length} />
                <TabButton tab="incoming" label="Incoming Events" count={incomingEvents.length} />
              </div>
              <div className="w-full max-w-xl">
                <label className="text-sm font-medium" htmlFor="event-record-search">Search events</label>
                <div className="mt-2 flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <input id="event-record-search" className="w-full bg-transparent text-sm outline-none" placeholder="Search by event code, name, venue, or category" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>
            </div>
          </section>

          {activeTab === "today" ? (
            <section className="animate-fade-in-up rounded-lg border bg-surface p-4 transition-all duration-300 hover:animate-hover-lift hover:shadow-lg">
              <PLPassDataGrid label="Today's events" data={todayEvents} columns={incomingColumns} emptyTitle="No events today" emptyDescription="Events scheduled for today will appear here when the date matches." rowSelection="single" checkboxSelection suppressRowClickSelection onSelectionChange={(rows) => setSelectedEventForSession((rows[0] as EventRecord | undefined) ?? null)} toolbarActions={startSessionToolbar} />
            </section>
          ) : activeTab === "incoming" ? (
            <section className="animate-fade-in-up rounded-lg border bg-surface p-4 transition-all duration-300 hover:animate-hover-lift hover:shadow-lg">
              <PLPassDataGrid label="Incoming events" data={incomingEvents} columns={incomingColumns} emptyTitle="No incoming events" emptyDescription="Future published events will appear here." rowSelection="single" checkboxSelection suppressRowClickSelection onSelectionChange={(rows) => setSelectedEventForSession((rows[0] as EventRecord | undefined) ?? null)} toolbarActions={startSessionToolbar} />
            </section>
          ) : null}
        </>
      )}

      {eventModal ? (
        <ModalFrame onClose={() => setEventModal(null)}>
          <EventDetails
            event={eventModal}
            status={getEventLifecycleStatus(eventModal, activeEvent?.code, completedCodes, cancelledCodes)}
            onCancel={() => setConfirmCancelEvent(eventModal)}
          />
        </ModalFrame>
      ) : null}

      {confirmCancelEvent ? (
        <ModalFrame onClose={() => setConfirmCancelEvent(null)} width="max-w-md">
          <h2 className="text-lg font-semibold">Confirm Cancel</h2>
          <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to cancel <span className="font-medium">{confirmCancelEvent.code}</span>? This action cannot be undone.</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmCancelEvent(null)}>Close</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                cancelEvent(confirmCancelEvent);
                setConfirmCancelEvent(null);
                setEventModal(null);
              }}
            >
              Cancel Event
            </Button>
          </div>
        </ModalFrame>
      ) : null}

      {editEvent ? (
        <ModalFrame onClose={() => setEditEvent(null)} width="max-w-2xl">
          <h2 className="text-xl font-semibold">Edit Event</h2>
          <p className="mt-1 text-sm text-muted-foreground">{editEvent.code} - {editEvent.name}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">Venue<input className="w-full rounded-lg border bg-background px-3 py-2" defaultValue={editEvent.venue} /></label>
            <label className="space-y-2 text-sm font-medium">Date<input className="w-full rounded-lg border bg-background px-3 py-2" defaultValue={editEvent.date} /></label>
            <label className="space-y-2 text-sm font-medium">Start Time<input className="w-full rounded-lg border bg-background px-3 py-2" defaultValue={editEvent.startTime} /></label>
            <label className="space-y-2 text-sm font-medium">End Time<input className="w-full rounded-lg border bg-background px-3 py-2" defaultValue={editEvent.endTime} /></label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditEvent(null)}>Cancel</Button>
            <Button type="button" onClick={() => { toast.success(`${editEvent.code} changes saved.`); setEditEvent(null); }}>Save Changes</Button>
          </div>
        </ModalFrame>
      ) : null}

      {startEvent ? (
        <ModalFrame onClose={() => setStartEvent(null)} width="max-w-2xl">
          <h2 className="text-xl font-semibold">Start Session Modal</h2>
          <p className="mt-1 text-sm text-muted-foreground">{startEvent.code} - {startEvent.name}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">Venue<input className="w-full rounded-lg border bg-background px-3 py-2" value={sessionForm.venue} onChange={(event) => setSessionForm((current) => ({ ...current, venue: event.target.value }))} /></label>
            <label className="space-y-2 text-sm font-medium">Schedule Date<input type="date" className="w-full rounded-lg border bg-background px-3 py-2" value={sessionForm.date} onChange={(event) => setSessionForm((current) => ({ ...current, date: event.target.value }))} /></label>
            <label className="space-y-2 text-sm font-medium">Start Time<input type="time" className="w-full rounded-lg border bg-background px-3 py-2" value={sessionForm.startTime} onChange={(event) => setSessionForm((current) => ({ ...current, startTime: event.target.value }))} /></label>
            <label className="space-y-2 text-sm font-medium">End Time<input type="time" className="w-full rounded-lg border bg-background px-3 py-2" value={sessionForm.endTime} onChange={(event) => setSessionForm((current) => ({ ...current, endTime: event.target.value }))} /></label>
          </div>
          <div className="mt-4 rounded-lg border bg-background p-3 text-sm text-muted-foreground">
            Attendance will use QR Code and Facial Recognition automatically during the live session.
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStartEvent(null)}>Cancel</Button>
            <Button type="button" onClick={startSession}><Play className="h-4 w-4" aria-hidden="true" />Start Session</Button>
          </div>
        </ModalFrame>
      ) : null}

      {summaryOpen ? (
        <ModalFrame onClose={() => setSummaryOpen(false)} width="max-w-xl">
          <h2 className="text-xl font-semibold">Session Summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeEvent?.code} - {activeEvent?.name}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryTile label="Total Participants" value={activeRows.length.toString()} />
            <SummaryTile label="Present" value={activeCounts.present.toString()} />
            <SummaryTile label="Late" value={activeCounts.late.toString()} />
            <SummaryTile label="Absent" value={activeCounts.absent.toString()} />
            <SummaryTile label="Attendance Rate" value={`${activeCounts.rate}%`} />
            <SummaryTile label="Feedback Pending" value={activeRows.length.toString()} />
            <div className="rounded-lg border bg-background p-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Most Common Late Arrival Reason</p>
              <p className="mt-1 text-lg font-semibold">{commonLateReason(activeRows)}</p>
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

function EventDetails({ event, status, onCancel }: { event: EventRecord; status: string; onCancel?: () => void }) {
  return (
    <div>
      <p className="text-sm font-semibold text-primary">Event Details</p>
      <h2 className="mt-1 text-2xl font-semibold">{event.code} - {event.name}</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <SummaryTile label="Category" value={event.category} />
        <SummaryTile label="Venue" value={event.venue} />
        <SummaryTile label="Date" value={event.date} />
        <SummaryTile label="Schedule" value={`${event.startTime} - ${event.endTime}`} />
        <SummaryTile label="Status" value={status} />
        <SummaryTile label="Predicted Turnout" value={event.predictedTurnout} />
      </div>
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
      {onCancel ? (
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="destructive" onClick={() => onCancel?.()}>
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Cancel Event
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CompletedEventModal({ record, rows, onClose, onExportReport }: { record: CompletedRecord; rows: AttendanceRow[]; onClose: () => void; onExportReport?: (label: string) => void }) {
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
      <h2 className="mt-1 text-2xl font-semibold">{record.code} - {record.name}</h2>

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
