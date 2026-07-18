/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Eye, FileDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  createMockExport,
  loadOrganizerMockState,
  type OrganizerCompletedEvent,
  type OrganizerEvent,
  type OrganizerAttendanceRow,
  type AttendanceMethod
} from "@/features/organizer/data/organizerMockStore";
type AttendanceMethodLocal = AttendanceMethod;
type AttendanceStatus = "present" | "late" | "absent";
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

const allEvents: EventRecord[] = [
  {
    code: "EVT-2026-001",
    name: "Hospitality Career Fair & Industry Talk",
    category: "Career Development",
    venue: "PLP Pasig Gymnasium",
    date: "2026-02-10",
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

export function EventRecordsPage() {
  const [mockState] = useState(() => loadOrganizerMockState());
  const [search, setSearch] = useState("");
  const [completedModal, setCompletedModal] = useState<CompletedRecord | null>(null);
  const completedRows = useMemo(() => mockState.completedEvents.map(completedFromStore), [mockState.completedEvents]);
  const pastEvents = useMemo(
    () => completedRows.filter((event) => matchesSearch(event, search)),
    [completedRows, search]
  );

  function exportReport(label: string) {
    toast.success(createMockExport(label));
  }

  const pastColumns: ColumnDef<CompletedRecord>[] = [
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
    <div className="space-y-6">
      <PageHeader eyebrow="Event Management" title="Event Records" description="Review completed attendance sessions, event details, feedback sentiment, and export reports." />

      <section className="rounded-lg border bg-surface p-4">
        <div className="w-full max-w-xl">
          <label className="text-sm font-medium" htmlFor="event-record-search">Search completed events</label>
          <div className="mt-2 flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input id="event-record-search" className="w-full bg-transparent text-sm outline-none" placeholder="Search by event code, name, venue, or category" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
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
          rows={mockState.attendanceRows.filter((row) => row.eventCode === completedModal.code)}
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
