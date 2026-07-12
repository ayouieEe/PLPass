import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ColDef } from "ag-grid-community";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, Camera, Eye, FileDown, Play, ScanLine, Search, Square, X, XCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { APP_ROUTES } from "@/lib/constants/routes";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";

// Event Records is organized around three lifecycle tabs: Today, Incoming,
// and Completed. A live session is a full-page state entered after Start Session.
type EventTab = "today" | "incoming";
type AttendanceMethod = "QR Code" | "Facial Recognition";
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
};

type AttendanceRow = {
  id: string;
  studentId: string;
  studentName: string;
  eventCode: string;
  attendanceMethod: AttendanceMethod;
  checkInTime: string;
  attendanceStatus: AttendanceStatus;
  lateReason?: LateReason;
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

const allEvents: EventRecord[] = [
  {
    code: "EVT-2026-001",
    name: "Hospitality Career Fair & Industry Talk",
    category: "Career Development",
    venue: "PLP Pasig Gymnasium",
    date: new Date().toISOString().slice(0, 10),
    startTime: "08:00 AM",
    endTime: "12:00 PM",
    predictedTurnout: "82%",
    objectives: [
      "Connect HM students with at least 5 partner hotels/restaurants for potential internship slots",
      "Improve student awareness of current industry hiring standards",
      "Gather student interest data for AHTOMP's placement program"
    ]
  },
  {
    code: "EVT-2026-002",
    name: "Food & Beverage Service Skills Workshop",
    category: "Skills Training",
    venue: "PLP HM Training Laboratory",
    date: "2026-02-24",
    startTime: "01:00 PM",
    endTime: "05:00 PM",
    predictedTurnout: "76%",
    objectives: [
      "Demonstrate proper fine-dining table service techniques",
      "Improve student confidence in guest interaction scenarios"
    ]
  },
  {
    code: "EVT-2026-003",
    name: "AHTOMP General Assembly & Orientation",
    category: "General Assembly",
    venue: "PLP Pasig Auditorium",
    date: "2026-03-05",
    startTime: "09:00 AM",
    endTime: "11:00 AM",
    predictedTurnout: "91%",
    objectives: [
      "Orient new HM students on AHTOMP's programs and membership benefits",
      "Present the academic year's event calendar"
    ]
  },
  {
    code: "EVT-2026-004",
    name: "Front Office Operations Simulation Day",
    category: "Skills Training",
    venue: "PLP HM Mock Hotel Lab",
    date: "2026-03-19",
    startTime: "08:30 AM",
    endTime: "03:30 PM",
    predictedTurnout: "69%",
    objectives: [
      "Simulate real front-desk check-in/check-out scenarios",
      "Assess student handling of guest complaints",
      "Evaluate use of a property management system mock-up"
    ]
  },
  {
    code: "EVT-2026-005",
    name: "Sustainable Tourism Speaker Series",
    category: "Seminar",
    venue: "PLP Multi-Purpose Hall",
    date: "2026-04-02",
    startTime: "01:30 PM",
    endTime: "04:00 PM",
    predictedTurnout: "58%",
    objectives: [
      "Introduce sustainable and responsible tourism practices",
      "Encourage student-led sustainability initiatives on campus"
    ]
  },
  {
    code: "EVT-2026-006",
    name: "AHTOMP Culinary & Mixology Showcase",
    category: "Competition",
    venue: "PLP HM Culinary Kitchen",
    date: "2026-04-18",
    startTime: "09:00 AM",
    endTime: "04:00 PM",
    predictedTurnout: "88%",
    objectives: [
      "Showcase student culinary and beverage-crafting competencies",
      "Foster friendly competition among HM sections"
    ]
  }
];

const sessionSummaries: CompletedRecord[] = [
  { ...allEvents[0], present: 142, late: 18, absent: 12, totalRegistered: 172, attendanceRate: "82.6%", sentiment: { positive: 78, neutral: 18, negative: 4 }, feedbackComments: ["Very well organized compared to past AHTOMP events."] },
  { ...allEvents[1], present: 97, late: 14, absent: 23, totalRegistered: 134, attendanceRate: "72.8%", sentiment: { positive: 64, neutral: 27, negative: 9 }, feedbackComments: ["Great networking opportunity with hotel partners.", "The speakers were very informative and approachable."] },
  { ...allEvents[2], present: 203, late: 9, absent: 8, totalRegistered: 220, attendanceRate: "92.7%", sentiment: { positive: 71, neutral: 22, negative: 7 }, feedbackComments: ["Venue was a bit cramped for the number of attendees."] }
];

const attendanceDetails: AttendanceRow[] = [
  { id: "ATT-6001", studentId: "STU-1002", studentName: "Ximena Garcia", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:38 AM", attendanceStatus: "late", lateReason: "Class or Academic Conflict" },
  { id: "ATT-6002", studentId: "STU-1003", studentName: "Angel Bautista", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "07:44 AM", attendanceStatus: "present" },
  { id: "ATT-6003", studentId: "STU-1004", studentName: "Rhea Ramos", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "07:50 AM", attendanceStatus: "late", lateReason: "Class or Academic Conflict" },
  { id: "ATT-6004", studentId: "STU-1005", studentName: "Ivy Reyes", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "08:03 AM", attendanceStatus: "late", lateReason: "Personal / Health" },
  { id: "ATT-6005", studentId: "STU-1006", studentName: "Gwen Castillo", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "-", attendanceStatus: "absent" },
  { id: "ATT-6006", studentId: "STU-1007", studentName: "Leo Villanueva", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:34 AM", attendanceStatus: "late", lateReason: "Other" },
  { id: "ATT-6007", studentId: "STU-1008", studentName: "Mika Bautista", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:17 AM", attendanceStatus: "late", lateReason: "Traffic / Commute" },
  { id: "ATT-6008", studentId: "STU-1009", studentName: "Leo Ocampo", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "-", attendanceStatus: "absent" },
  { id: "ATT-6009", studentId: "STU-1010", studentName: "Yuri Flores", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:32 AM", attendanceStatus: "late", lateReason: "Traffic / Commute" },
  { id: "ATT-6010", studentId: "STU-1011", studentName: "Odessa Navarro", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:16 AM", attendanceStatus: "late", lateReason: "Other" },
  { id: "ATT-6011", studentId: "STU-1012", studentName: "Ivy Bautista", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "07:37 AM", attendanceStatus: "present" },
  { id: "ATT-6012", studentId: "STU-1013", studentName: "Francis Salazar", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "07:40 AM", attendanceStatus: "present" },
  { id: "ATT-6013", studentId: "STU-1014", studentName: "Kyla Cruz", eventCode: "EVT-2026-001", attendanceMethod: "Facial Recognition", checkInTime: "08:38 AM", attendanceStatus: "late", lateReason: "Traffic / Commute" },
  { id: "ATT-6014", studentId: "STU-1015", studentName: "Carlo Ramos", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:30 AM", attendanceStatus: "late", lateReason: "Weather / Force Majeure" },
  { id: "ATT-6015", studentId: "STU-1016", studentName: "Mika Salazar", eventCode: "EVT-2026-001", attendanceMethod: "QR Code", checkInTime: "08:37 AM", attendanceStatus: "late", lateReason: "Personal / Health" }
];

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
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/40 p-4">
      <section className={`max-h-[90vh] w-full overflow-hidden rounded-lg border bg-surface shadow-xl ${width}`} role="dialog" aria-modal="true">
        <div className="flex justify-end border-b px-5 py-3">
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="max-h-[calc(90vh-58px)] overflow-y-auto p-5">{children}</div>
      </section>
    </div>,
    document.body
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

  // Completed events = the seeded dummy summaries plus any sessions the
  // organizer has ended during this browser session.
  const completedEvents = useMemo(
    () => [...completedExtras, ...sessionSummaries].filter((event) => matchesSearch(event, search)),
    [completedExtras, search]
  );
  const completedCodes = useMemo(() => new Set(completedEvents.map((event) => event.code)), [completedEvents]);

  // Today and incoming events are published events that haven't been cancelled,
  // haven't been completed, and aren't currently live. New events appear here automatically.
  const todayEvents = useMemo(
    () =>
      allEvents.filter(
        (event) =>
          !cancelledCodes.includes(event.code) &&
          !completedCodes.has(event.code) &&
          event.code !== activeEvent?.code &&
          isTodayEvent(event) &&
          matchesSearch(event, search)
      ),
    [activeEvent, cancelledCodes, completedCodes, search]
  );

  const incomingEvents = useMemo(
    () =>
      allEvents.filter(
        (event) =>
          !cancelledCodes.includes(event.code) &&
          !completedCodes.has(event.code) &&
          event.code !== activeEvent?.code &&
          !isTodayEvent(event) &&
          matchesSearch(event, search)
      ),
    [activeEvent, cancelledCodes, completedCodes, search]
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
    toast.warning(`${event.code} has been cancelled.`);
  }

  function startSession() {
    if (!startEvent) {
      return;
    }
    const updated = { ...startEvent, venue: sessionForm.venue, date: sessionForm.date, startTime: sessionForm.startTime, endTime: sessionForm.endTime };
    setActiveEvent(updated);
    setActiveRows(buildLiveRows(sessionForm.method, updated.code));
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
    setCompletedExtras((current) => [completed, ...current.filter((event) => event.code !== completed.code)]);
    setCompletedModal(completed);
    setActiveEvent(null);
    setActiveRows([]);
    setSummaryOpen(false);
    setActiveTab("today");
    toast.success(`${completed.code} moved to Event Records.`);
  }

  function exportReport(label: string) {
    toast.success(`${label} export is ready. This is a mock export using the dummy data set.`);
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
      <PageHeader
        eyebrow="Event Management"
        title="Event Records"
        description="Published events appear here after the Create Event workflow; start a session only when the event is ready to run."
        actions={
          <Button type="button" onClick={() => navigate(APP_ROUTES.organizerCreateEvent)}>
            Create Event
          </Button>
        }
      />


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
                  ) : (
                    <div className="rounded-xl border border-dashed border-primary/20 bg-surface p-5 text-center">
                      <p className="text-sm font-semibold text-foreground">Choose a capture mode</p>
                      <p className="mt-1 text-sm text-muted-foreground">Tap QR Code or Facial Recognition to preview the mock scanner experience.</p>
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
                    Mock-up preview
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
            <section className="rounded-lg border bg-surface p-4">
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold">Today's Event</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Published events scheduled for today.</p>
                </div>
              </div>
              <PLPassDataGrid label="Today's events" data={todayEvents} columns={incomingColumns} emptyTitle="No events today" emptyDescription="Events scheduled for today will appear here when the date matches." rowSelection="single" checkboxSelection suppressRowClickSelection onSelectionChange={(rows) => setSelectedEventForSession((rows[0] as EventRecord | undefined) ?? null)} toolbarActions={startSessionToolbar} />
            </section>
          ) : activeTab === "incoming" ? (
            <section className="rounded-lg border bg-surface p-4">
              <div className="mb-4 flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold">Incoming Events</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Published events that have not started yet and are not scheduled for today.</p>
                </div>
              </div>
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
          rows={completedModal.code === "EVT-2026-001" ? attendanceDetails : attendanceDetails.slice(0, 8).map((row) => ({ ...row, eventCode: completedModal.code }))}
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">XLSX / PDF</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onExportReport?.(`Attendance Report: ${record.code}`)}>
              <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />Attendance
            </Button>
            <Button type="button" size="sm" onClick={() => onExportReport?.(`Event Summary Report: ${record.code}`)}>
              <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />Summary
            </Button>
          </div>
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
