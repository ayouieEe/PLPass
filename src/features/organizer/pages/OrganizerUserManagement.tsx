import { type ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  BadgeCheck,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  IdCard,
  type LucideIcon,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
  X
} from "lucide-react";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
type StudentStatus = "Active" | "Suspended";
type CredentialStatus = "Ready" | "Needs Review" | "Missing";
type CorrectionStatus = "Pending" | "Approved" | "Rejected";

type ParticipationRecord = {
  eventCode: string;
  eventTitle: string;
  date: string;
  status: "Present" | "Late" | "Absent";
  method: "QR" | "Facial" | "Manual";
};

type CorrectionRequest = {
  id: string;
  eventCode: string;
  type: string;
  status: CorrectionStatus;
};
type StudentAccount = {
  id: string;
  schoolId: string;
  name: string;
  email: string;
  section: string;
  status: StudentStatus;
  attendanceRate: number;
  eventsJoined: number;
  qrStatus: CredentialStatus;
  facialStatus: CredentialStatus;
  participationHistory: ParticipationRecord[];
  correctionRequests: CorrectionRequest[];
};
const STUDENTS: StudentAccount[] = [
  {
    id: "STU-1001",
    schoolId: "2022-10871",
    name: "Uriel Garcia",
    email: "uriel.garcia@plpasig.edu.ph",
    section: "HM2A",
    status: "Active",
    attendanceRate: 92,
    eventsJoined: 5,
    qrStatus: "Needs Review",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-002", eventTitle: "F&B Service Skills Workshop", date: "2026-02-24", status: "Late", method: "Facial" },
      { eventCode: "EVT-2026-005", eventTitle: "Sustainable Tourism Speaker Series", date: "2026-04-02", status: "Present", method: "QR" }
    ],
    correctionRequests: [
      { id: "REQ-504", eventCode: "EVT-2026-002", type: "Correction - Wrong Status", status: "Approved" },
      { id: "REQ-508", eventCode: "EVT-2026-002", type: "Correction - Wrong Status", status: "Pending" }
    ]
  },
  {
    id: "STU-1002",
    schoolId: "2023-10232",
    name: "Ximena Garcia",
    email: "ximena.garcia@plpasig.edu.ph",
    section: "HM4A",
    status: "Active",
    attendanceRate: 86,
    eventsJoined: 4,
    qrStatus: "Ready",
    facialStatus: "Needs Review",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "QR" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1006",
    schoolId: "2023-10236",
    name: "Gwen Castillo",
    email: "gwen.castillo@plpasig.edu.ph",
    section: "HM2A",
    status: "Active",
    attendanceRate: 74,
    eventsJoined: 3,
    qrStatus: "Ready",
    facialStatus: "Missing",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Absent", method: "Manual" },
      { eventCode: "EVT-2026-002", eventTitle: "F&B Service Skills Workshop", date: "2026-02-24", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-004", eventTitle: "Front Office Simulation Day", date: "2026-03-19", status: "Late", method: "QR" }
    ],
    correctionRequests: [
      { id: "REQ-501", eventCode: "EVT-2026-002", type: "Excused Absence", status: "Approved" },
      { id: "REQ-505", eventCode: "EVT-2026-004", type: "Correction - Wrong Status", status: "Approved" }
    ]
  },
  {
    id: "STU-1011",
    schoolId: "2022-10881",
    name: "Odessa Navarro",
    email: "odessa.navarro@plpasig.edu.ph",
    section: "HM2B",
    status: "Active",
    attendanceRate: 81,
    eventsJoined: 4,
    qrStatus: "Needs Review",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "Facial" }
    ],
    correctionRequests: [
      { id: "REQ-502", eventCode: "EVT-2026-003", type: "Correction - Wrong Time-In", status: "Pending" },
      { id: "REQ-506", eventCode: "EVT-2026-004", type: "Correction - Wrong Time-In", status: "Rejected" }
    ]
  },
  {
    id: "STU-1019",
    schoolId: "2022-10889",
    name: "Denise Torres",
    email: "denise.torres@plpasig.edu.ph",
    section: "HM2B",
    status: "Suspended",
    attendanceRate: 58,
    eventsJoined: 2,
    qrStatus: "Ready",
    facialStatus: "Needs Review",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-004", eventTitle: "Front Office Simulation Day", date: "2026-03-19", status: "Late", method: "Manual" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1003",
    schoolId: "2022-10873",
    name: "Angel Bautista",
    email: "angel.bautista@plpasig.edu.ph",
    section: "HM2B",
    status: "Active",
    attendanceRate: 89,
    eventsJoined: 5,
    qrStatus: "Ready",
    facialStatus: "Needs Review",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-002", eventTitle: "F&B Service Skills Workshop", date: "2026-02-24", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "QR" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1004",
    schoolId: "2023-10234",
    name: "Rhea Ramos",
    email: "rhea.ramos@plpasig.edu.ph",
    section: "HM4A",
    status: "Active",
    attendanceRate: 78,
    eventsJoined: 4,
    qrStatus: "Ready",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "Facial" },
      { eventCode: "EVT-2026-004", eventTitle: "Front Office Simulation Day", date: "2026-03-19", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "Facial" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1005",
    schoolId: "2022-10875",
    name: "Ivy Reyes",
    email: "ivy.reyes@plpasig.edu.ph",
    section: "HM2B",
    status: "Active",
    attendanceRate: 83,
    eventsJoined: 4,
    qrStatus: "Ready",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "Facial" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-005", eventTitle: "Sustainable Tourism Speaker Series", date: "2026-04-02", status: "Present", method: "QR" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1007",
    schoolId: "2022-10877",
    name: "Leo Villanueva",
    email: "leo.villanueva@plpasig.edu.ph",
    section: "HM3A",
    status: "Active",
    attendanceRate: 69,
    eventsJoined: 3,
    qrStatus: "Ready",
    facialStatus: "Missing",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-004", eventTitle: "Front Office Simulation Day", date: "2026-03-19", status: "Absent", method: "Manual" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "QR" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1008",
    schoolId: "2023-10238",
    name: "Mika Bautista",
    email: "mika.bautista@plpasig.edu.ph",
    section: "HM4A",
    status: "Active",
    attendanceRate: 76,
    eventsJoined: 4,
    qrStatus: "Needs Review",
    facialStatus: "Needs Review",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-002", eventTitle: "F&B Service Skills Workshop", date: "2026-02-24", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-005", eventTitle: "Sustainable Tourism Speaker Series", date: "2026-04-02", status: "Absent", method: "Manual" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1009",
    schoolId: "2022-10879",
    name: "Leo Ocampo",
    email: "leo.ocampo@plpasig.edu.ph",
    section: "HM2B",
    status: "Active",
    attendanceRate: 72,
    eventsJoined: 3,
    qrStatus: "Ready",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Absent", method: "Manual" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-005", eventTitle: "Sustainable Tourism Speaker Series", date: "2026-04-02", status: "Present", method: "QR" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1010",
    schoolId: "2023-10240",
    name: "Yuri Flores",
    email: "yuri.flores@plpasig.edu.ph",
    section: "HM2A",
    status: "Active",
    attendanceRate: 85,
    eventsJoined: 5,
    qrStatus: "Ready",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-002", eventTitle: "F&B Service Skills Workshop", date: "2026-02-24", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "Facial" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1012",
    schoolId: "2023-10242",
    name: "Ivy Bautista",
    email: "ivy.bautista@plpasig.edu.ph",
    section: "HM4A",
    status: "Active",
    attendanceRate: 80,
    eventsJoined: 4,
    qrStatus: "Ready",
    facialStatus: "Needs Review",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-004", eventTitle: "Front Office Simulation Day", date: "2026-03-19", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "QR" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1013",
    schoolId: "2022-10883",
    name: "Francis Salazar",
    email: "francis.salazar@plpasig.edu.ph",
    section: "HM3B",
    status: "Active",
    attendanceRate: 88,
    eventsJoined: 5,
    qrStatus: "Needs Review",
    facialStatus: "Needs Review",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "QR" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1014",
    schoolId: "2023-10244",
    name: "Kyla Cruz",
    email: "kyla.cruz@plpasig.edu.ph",
    section: "HM2B",
    status: "Active",
    attendanceRate: 79,
    eventsJoined: 4,
    qrStatus: "Ready",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "Facial" },
      { eventCode: "EVT-2026-002", eventTitle: "F&B Service Skills Workshop", date: "2026-02-24", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-004", eventTitle: "Front Office Simulation Day", date: "2026-03-19", status: "Present", method: "Facial" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1015",
    schoolId: "2022-10885",
    name: "Carlo Ramos",
    email: "carlo.ramos@plpasig.edu.ph",
    section: "HM4A",
    status: "Active",
    attendanceRate: 73,
    eventsJoined: 3,
    qrStatus: "Needs Review",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-005", eventTitle: "Sustainable Tourism Speaker Series", date: "2026-04-02", status: "Absent", method: "Manual" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1016",
    schoolId: "2023-10246",
    name: "Mika Salazar",
    email: "mika.salazar@plpasig.edu.ph",
    section: "HM2B",
    status: "Active",
    attendanceRate: 67,
    eventsJoined: 3,
    qrStatus: "Needs Review",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-005", eventTitle: "Sustainable Tourism Speaker Series", date: "2026-04-02", status: "Absent", method: "Manual" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "QR" }
    ],
    correctionRequests: [
      { id: "REQ-503", eventCode: "EVT-2026-005", type: "Correction - Wrong Status", status: "Pending" },
      { id: "REQ-507", eventCode: "EVT-2026-006", type: "Excused Absence", status: "Approved" }
    ]
  },
  {
    id: "STU-1017",
    schoolId: "2022-10887",
    name: "Rhea Fernandez",
    email: "rhea.fernandez@plpasig.edu.ph",
    section: "HM3A",
    status: "Active",
    attendanceRate: 84,
    eventsJoined: 4,
    qrStatus: "Ready",
    facialStatus: "Needs Review",
    participationHistory: [
      { eventCode: "EVT-2026-001", eventTitle: "Hospitality Career Fair", date: "2026-02-10", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-004", eventTitle: "Front Office Simulation Day", date: "2026-03-19", status: "Late", method: "QR" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1018",
    schoolId: "2023-10248",
    name: "Harold Torres",
    email: "harold.torres@plpasig.edu.ph",
    section: "HM4A",
    status: "Active",
    attendanceRate: 91,
    eventsJoined: 5,
    qrStatus: "Ready",
    facialStatus: "Ready",
    participationHistory: [
      { eventCode: "EVT-2026-002", eventTitle: "F&B Service Skills Workshop", date: "2026-02-24", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-003", eventTitle: "AHTOMP General Assembly", date: "2026-03-05", status: "Present", method: "QR" },
      { eventCode: "EVT-2026-006", eventTitle: "Culinary & Mixology Showcase", date: "2026-04-18", status: "Present", method: "Facial" }
    ],
    correctionRequests: []
  },
  {
    id: "STU-1020",
    schoolId: "2023-10250",
    name: "Mika Villanueva",
    email: "mika.villanueva@plpasig.edu.ph",
    section: "HM3B",
    status: "Active",
    attendanceRate: 70,
    eventsJoined: 3,
    qrStatus: "Needs Review",
    facialStatus: "Needs Review",
    participationHistory: [
      { eventCode: "EVT-2026-002", eventTitle: "F&B Service Skills Workshop", date: "2026-02-24", status: "Late", method: "QR" },
      { eventCode: "EVT-2026-004", eventTitle: "Front Office Simulation Day", date: "2026-03-19", status: "Present", method: "Facial" },
      { eventCode: "EVT-2026-005", eventTitle: "Sustainable Tourism Speaker Series", date: "2026-04-02", status: "Absent", method: "Manual" }
    ],
    correctionRequests: []
  }
];
function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function statusClass(status: StudentStatus | CredentialStatus | CorrectionStatus | ParticipationRecord["status"]) {
  if (status === "Active" || status === "Ready" || status === "Approved" || status === "Present") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "Pending" || status === "Late" || status === "Needs Review") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

function StatusBadge({ value }: { value: StudentStatus | CredentialStatus | CorrectionStatus | ParticipationRecord["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${statusClass(value)}`}>
      {value}
    </span>
  );
}
function MetricCard({
  title,
  value,
  detail,
  icon: Icon
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <article className="rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-semibold leading-none text-foreground">{value}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-md border border-primary/15 bg-primary/5 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}
function ExportButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 min-w-20 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function ReportExportGroup({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-none gap-2">{children}</div>
    </div>
  );
}

function DetailTile({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-surface p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="mt-2 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function StudentDetailModal({
  student,
  onClose
}: {
  student: StudentAccount | undefined;
  onClose: () => void;
}) {
  if (!student) {
    return null;
  }

  // Rendered via a portal directly into document.body so the overlay's
  // z-[9999] is evaluated in the root stacking context. Without this, a
  // transformed/filtered ancestor elsewhere in the layout (e.g. a sidebar
  // wrapper) can trap the modal in a local stacking context, letting a
  // sticky/fixed topbar render on top of it and show through as a white bar.
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-700/40 p-6">
      <section
        className="max-h-[86vh] w-full max-w-6xl overflow-hidden rounded-lg border bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
      >
        <div className="border-b border-primary/10 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">Student Account Details</p>
              <h2 id="student-detail-title" className="mt-1 text-2xl font-semibold text-foreground">
                {student.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {student.id} - {student.schoolId} - {student.section}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-md border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Close student details"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="max-h-[calc(86vh-97px)] overflow-y-auto bg-white px-6 pb-10 pt-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailTile label="Account status">
              <StatusBadge value={student.status} />
            </DetailTile>
            <DetailTile label="Attendance rate">
              <div className="flex items-center gap-3">
                <span>{student.attendanceRate}%</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${student.attendanceRate}%` }} />
                </div>
              </div>
            </DetailTile>
            <DetailTile label="Event participation">{student.eventsJoined} events joined</DetailTile>
            <DetailTile label="Correction requests">{student.correctionRequests.length} filed</DetailTile>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <section className="rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2">
                  <IdCard className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="font-semibold text-foreground">Complete Student Profile</h3>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DetailTile label="Student ID">{student.id}</DetailTile>
                  <DetailTile label="School ID">{student.schoolId}</DetailTile>
                  <DetailTile label="Section">{student.section}</DetailTile>
                  <DetailTile label="Email">{student.email}</DetailTile>
                </div>
              </section>

              <section className="rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="font-semibold text-foreground">Full Participation History</h3>
                </div>
                <div className="mt-4 overflow-hidden rounded-md border bg-surface">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Event</th>
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Method</th>
                        <th className="px-3 py-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {student.participationHistory.map((record) => (
                        <tr key={`${record.eventCode}-${record.date}`}>
                          <td className="px-3 py-3">
                            <p className="font-medium text-foreground">{record.eventCode}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{record.eventTitle}</p>
                          </td>
                          <td className="px-3 py-3 text-muted-foreground">{formatDate(record.date)}</td>
                          <td className="px-3 py-3">
                            <span className="rounded-md border bg-background px-2 py-1 text-xs font-medium text-muted-foreground">
                              {record.method}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <StatusBadge value={record.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="font-semibold text-foreground">Credential Status</h3>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-md border bg-surface p-3">
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">QR Credential</p>
                    <StatusBadge value={student.qrStatus} />
                  </div>
                  <div className="rounded-md border bg-surface p-3">
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Facial Credential</p>
                    <StatusBadge value={student.facialStatus} />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="font-semibold text-foreground">Correction Requests</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {student.correctionRequests.length ? (
                    student.correctionRequests.map((request) => (
                      <article key={request.id} className="rounded-md border bg-surface p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-foreground">{request.id}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{request.eventCode}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{request.type}</p>
                          </div>
                          <StatusBadge value={request.status} />
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-md border bg-surface p-3 text-sm text-muted-foreground">
                      No correction requests for this student.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

export function OrganizerUserManagementPage() {
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedStudentId, setSelectedStudentId] = useState(STUDENTS[0]?.id ?? "");
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return STUDENTS.filter((student) => {
      const matchesQuery =
        !normalizedQuery ||
        student.name.toLowerCase().includes(normalizedQuery) ||
        student.id.toLowerCase().includes(normalizedQuery) ||
        student.schoolId.toLowerCase().includes(normalizedQuery) ||
        student.email.toLowerCase().includes(normalizedQuery);
      const matchesSection = sectionFilter === "all" || student.section === sectionFilter;
      const matchesStatus = statusFilter === "all" || student.status === statusFilter;

      return matchesQuery && matchesSection && matchesStatus;
    });
  }, [query, sectionFilter, statusFilter]);

  const selectedStudent = STUDENTS.find((student) => student.id === selectedStudentId) ?? filteredStudents[0] ?? STUDENTS[0];
  const sections = Array.from(new Set(STUDENTS.map((student) => student.section)));
  const averageAttendance = Math.round(STUDENTS.reduce((sum, student) => sum + student.attendanceRate, 0) / STUDENTS.length);
  const totalCorrectionRequests = STUDENTS.reduce((sum, student) => sum + student.correctionRequests.length, 0);
  const studentColumns = useMemo<ColDef<StudentAccount>[]>(
    () => [
      {
        headerName: "Student",
        field: "name",
        minWidth: 220,
        flex: 1.2,
        cellRenderer: ({ data }: ICellRendererParams<StudentAccount>) =>
          data ? (
            <div className="py-1 leading-tight">
              <div className="font-medium text-foreground">{data.name}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{data.id}</div>
            </div>
          ) : null
      },
      {
        headerName: "School ID",
        field: "schoolId",
        minWidth: 140
      },
      {
        headerName: "Section",
        field: "section",
        minWidth: 120,
        maxWidth: 140
      },
      {
        headerName: "Email",
        field: "email",
        minWidth: 240,
        flex: 1.2
      },
      {
        headerName: "Status",
        field: "status",
        minWidth: 130,
        cellRenderer: ({ value }: ICellRendererParams<StudentAccount, StudentStatus>) => <StatusBadge value={value ?? "Suspended"} />
      },
      {
        headerName: "Attendance",
        field: "attendanceRate",
        minWidth: 170,
        cellRenderer: ({ value }: ICellRendererParams<StudentAccount, number>) => {
          const rate = value ?? 0;

          return (
            <div className="flex h-full items-center gap-3">
              <span className="w-10 font-medium text-foreground">{rate}%</span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
              </div>
            </div>
          );
        }
      },
      {
        headerName: "Participation",
        field: "eventsJoined",
        minWidth: 145,
        valueFormatter: ({ value }) => `${value ?? 0} events joined`
      },
      {
        headerName: "Credentials",
        colId: "credentials",
        minWidth: 220,
        valueGetter: ({ data }) => (data ? `${data.qrStatus} ${data.facialStatus}` : ""),
        cellRenderer: ({ data }: ICellRendererParams<StudentAccount>) =>
          data ? (
            <div className="flex h-full items-center gap-2">
              <span className="text-xs text-muted-foreground">QR</span>
              <StatusBadge value={data.qrStatus} />
              <span className="text-xs text-muted-foreground">Face</span>
              <StatusBadge value={data.facialStatus} />
            </div>
          ) : null
      },
      {
        headerName: "Requests",
        colId: "requests",
        minWidth: 120,
        valueGetter: ({ data }) => data?.correctionRequests.length ?? 0,
        valueFormatter: ({ value }) => `${value ?? 0} filed`
      },
      {
        headerName: "View More",
        colId: "viewMore",
        minWidth: 145,
        maxWidth: 160,
        pinned: "right",
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: ICellRendererParams<StudentAccount>) =>
          data ? (
            <button
              type="button"
              onClick={() => {
                setSelectedStudentId(data.id);
                setIsStudentModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              View More
            </button>
          ) : null
      }
    ],
    []
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Organizer</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">User Management</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Manage HM student accounts, credentials, attendance rates, participation history, and correction requests.
          </p>
        </div>
      </header>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Student Accounts" value={STUDENTS.length.toString()} detail="HM student accounts in scope." icon={Users} />
        <MetricCard title="Active Accounts" value={STUDENTS.filter((student) => student.status === "Active").length.toString()} detail="Accounts allowed to join events." icon={UserRoundCheck} />
        <MetricCard title="Avg. Attendance Rate" value={`${averageAttendance}%`} detail="Across listed student accounts." icon={BadgeCheck} />
        <MetricCard title="Correction Requests" value={totalCorrectionRequests.toString()} detail="Filed attendance corrections." icon={ClipboardList} />
      </section>

      <section className="space-y-4">
        <div className="rounded-lg border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Student Accounts Table</h2>
              <p className="mt-1 text-sm text-muted-foreground">Search, filter, and view more account details.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {filteredStudents.length} results
            </span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, student ID, school ID, or email"
                className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <select
              value={sectionFilter}
              onChange={(event) => setSectionFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              aria-label="Filter by section"
            >
              <option value="all">All sections</option>
              {sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              aria-label="Filter by account status"
            >
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
        </div>
        <PLPassDataGrid
          label="Student accounts"
          data={filteredStudents}
          columns={studentColumns}
          emptyTitle="No student accounts"
          emptyDescription="No HM student accounts match the current search and filters."
          enableColumnVisibility
          hideHeader
        />
        <div className="rounded-lg border bg-surface p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Reports</h2>
              <p className="mt-1 text-sm text-muted-foreground">Export the current student list or participation history.</p>
            </div>
            <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">
              XLSX / PDF
            </span>
          </div>
          <div className="grid gap-3">
            <ReportExportGroup title="Student List" description="Account status, credentials, and student profile fields.">
              <ExportButton icon={FileSpreadsheet} label="XLSX" />
              <ExportButton icon={FileText} label="PDF" />
            </ReportExportGroup>
            <ReportExportGroup title="Participation History" description="Attendance rates, events joined, and correction request activity.">
              <ExportButton icon={Download} label="XLSX" />
              <ExportButton icon={FileText} label="PDF" />
            </ReportExportGroup>
          </div>
        </div>
      </section>
      <StudentDetailModal
        student={isStudentModalOpen ? selectedStudent : undefined}
        onClose={() => setIsStudentModalOpen(false)}
      />
    </div>
  );
}