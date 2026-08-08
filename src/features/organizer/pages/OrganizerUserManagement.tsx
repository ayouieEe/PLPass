/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  History,
  IdCard,
  Layers,
  Mail,
  type LucideIcon,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
  X
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useCorrectionRequests,
  useOrganizerProfiles,
  useStudents
} from "@/hooks/useRepositoryQueries";
import {
  approveOrganizerCorrectionRequest,
  loadOrganizerUiState,
  regenerateOrganizerQr,
  rejectOrganizerCorrectionRequest,
  updateOrganizerFacialStatus,
  type AttendanceMethod,
  type OrganizerUiState,
  type OrganizerStudent
} from "@/features/organizer/data/organizerUiStore";
import {
  exportStudentListXlsx,
  exportStudentListPdf,
  exportParticipationHistoryXlsx,
  exportParticipationHistoryPdf
} from "@/features/organizer/utils/exportUtils";

function useOrganizerScope() {
  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" as const },
    organizerId: organizerQuery.data?.items[0]?.id,
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: organizerQuery.isError
  };
}

type StudentStatus = "Active" | "Suspended";
type CredentialStatus = "Ready" | "Needs Review" | "Missing" | "Generated" | "Regeneration Requested" | "Activated" | "Inactive" | "Damaged";
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
  studentId: string;
  name: string;
  email: string;
  program: string;
  yearLevel: number | string;
  section: string;
  status: StudentStatus;
  attendanceRate: number;
  eventsJoined: number;
  qrStatus: CredentialStatus;
  facialStatus: CredentialStatus;
  participationHistory: ParticipationRecord[];
  correctionRequests: CorrectionRequest[];
};
const STUDENTS: StudentAccount[] = [];

function titleCaseStatus(status: "present" | "late" | "absent"): "Present" | "Late" | "Absent" {
  if (status === "present") return "Present";
  if (status === "late") return "Late";
  return "Absent";
}

function compactMethod(method: AttendanceMethod): "QR" | "Facial" | "Manual" {
  if (method === "Manual") {
    return "Manual";
  }
  return method === "QR Code" ? "QR" : "Facial";
}

function buildStudentAccounts(state: OrganizerUiState): StudentAccount[] {
  const eventsByCode = new Map(state.events.map((event) => [event.code, event]));
  const sourceStudents = state.students || [];

  return sourceStudents.map((student: OrganizerStudent) => {
    const rows = state.attendanceRows.filter((row) => row.studentId === student.id);
    const attendedRows = rows.filter((row) => row.attendanceStatus === "present" || row.attendanceStatus === "late");
    const correctionRequests = state.correctionRequests
      .filter((request) => request.studentName === student.name)
      .map((request) => ({
        id: request.id,
        eventCode: request.eventCode,
        type: request.requestType,
        status: request.status
      }));

    return {
      id: student.id,
      studentId: student.schoolId || student.id,
      name: student.name,
      email: student.email,
      program: student.program ?? "BSIT",
      yearLevel: student.yearLevel ?? 3,
      section: student.section,
      status: student.accountStatus,
      attendanceRate: rows.length ? Math.round((attendedRows.length / rows.length) * 100) : 0,
      eventsJoined: attendedRows.length,
      qrStatus: student.qrStatus,
      facialStatus: student.facialStatus,
      participationHistory: rows.map((row) => {
        const event = eventsByCode.get(row.eventCode);
        return {
          eventCode: row.eventCode,
          eventTitle: event?.name ?? row.eventCode,
          date: event?.date ?? "",
          status: titleCaseStatus(row.attendanceStatus),
          method: compactMethod(row.attendanceMethod)
        };
      }),
      correctionRequests
    };
  });
}
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
  icon: Icon
}: {
  title: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
}) {
  return (
    <article className="rounded-lg border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-foreground">{value}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-md border border-primary/15 bg-primary/5 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}
function ExportButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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

function ProfileCardTile({
  label,
  children,
  colSpan = ""
}: {
  label: string;
  children: ReactNode;
  colSpan?: string;
}) {
  return (
    <div className={`rounded-md border bg-surface p-3 ${colSpan}`}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function StudentDetailModal({
  student,
  onClose,
  onRegenerateQr,
  onMarkFacialReady,
  onApproveCorrection,
  onRejectCorrection
}: {
  student: StudentAccount | undefined;
  onClose: () => void;
  onRegenerateQr: (studentId: string) => void;
  onMarkFacialReady: (studentId: string) => void;
  onApproveCorrection: (requestId: string) => void;
  onRejectCorrection: (requestId: string) => void;
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
                Student ID: {student.studentId} • {student.program} {student.yearLevel}-{student.section}
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

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ProfileCardTile label="Full Name" colSpan="sm:col-span-2 lg:col-span-4">{student.name}</ProfileCardTile>
                  <ProfileCardTile label="Student ID">{student.studentId}</ProfileCardTile>
                  <ProfileCardTile label="Program">{student.program}</ProfileCardTile>
                  <ProfileCardTile label="Year Level">{`Year ${student.yearLevel}`}</ProfileCardTile>
                  <ProfileCardTile label="Section">{student.section}</ProfileCardTile>
                  <ProfileCardTile label="Email" colSpan="sm:col-span-2 lg:col-span-4">{student.email}</ProfileCardTile>
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
                    <button
                      type="button"
                      onClick={() => onRegenerateQr(student.id)}
                      className="mt-3 h-8 rounded-md border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
                    >
                      Regenerate QR
                    </button>
                  </div>
                  <div className="rounded-md border bg-surface p-3">
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Facial Credential</p>
                    <StatusBadge value={student.facialStatus} />
                    <button
                      type="button"
                      onClick={() => onMarkFacialReady(student.id)}
                      className="mt-3 h-8 rounded-md border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
                    >
                      Mark Ready
                    </button>
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
                        {request.status === "Pending" ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onApproveCorrection(request.id)}
                              className="h-8 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => onRejectCorrection(request.id)}
                              className="h-8 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              Reject
                            </button>
                          </div>
                        ) : null}
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

function ReportExportModal({
  isOpen,
  onClose,
  studentAccounts,
  programs,
  sections,
  activeProgramFilter,
  activeSectionFilter,
  activeStatusFilter
}: {
  isOpen: boolean;
  onClose: () => void;
  studentAccounts: StudentAccount[];
  programs: string[];
  sections: string[];
  activeProgramFilter: string;
  activeSectionFilter: string;
  activeStatusFilter: string;
}) {
  const [reportType, setReportType] = useState<"students" | "participation">("students");
  const [exportProgram, setExportProgram] = useState(activeProgramFilter);
  const [exportSection, setExportSection] = useState(activeSectionFilter);
  const [exportStatus, setExportStatus] = useState(activeStatusFilter);
  const [exportAttendance, setExportAttendance] = useState("all");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");

  if (!isOpen) {
    return null;
  }

  const filteredStudents = studentAccounts.filter((s) => {
    const matchProg = exportProgram === "all" || s.program === exportProgram;
    const matchSec = exportSection === "all" || s.section === exportSection;
    const matchStat = exportStatus === "all" || s.status === exportStatus;
    let matchAtt = true;
    if (exportAttendance === "low") matchAtt = s.attendanceRate < 75;
    else if (exportAttendance === "high") matchAtt = s.attendanceRate >= 75;

    return matchProg && matchSec && matchStat && matchAtt;
  });

  function handleResetFilters() {
    setExportProgram("all");
    setExportSection("all");
    setExportStatus("all");
    setExportAttendance("all");
  }

  function handleExport() {
    if (filteredStudents.length === 0) {
      toast.warning("No student records match the selected export criteria.");
      return;
    }

    if (reportType === "students") {
      const data = filteredStudents.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        email: s.email,
        program: s.program,
        yearLevel: s.yearLevel,
        section: s.section,
        status: s.status,
        attendanceRate: s.attendanceRate,
        eventsJoined: s.eventsJoined,
        qrStatus: s.qrStatus,
        facialStatus: s.facialStatus,
        correctionRequests: s.correctionRequests.length
      }));

      if (exportFormat === "xlsx") {
        exportStudentListXlsx(data);
        toast.success(`Exported ${data.length} student record(s) as CSV.`);
      } else {
        exportStudentListPdf(data);
        toast.success(`Exported ${data.length} student record(s) as PDF.`);
      }
    } else {
      const data = filteredStudents.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        program: s.program,
        yearLevel: s.yearLevel,
        section: s.section,
        attendanceRate: s.attendanceRate,
        eventsJoined: s.eventsJoined,
        correctionRequests: s.correctionRequests.length
      }));

      if (exportFormat === "xlsx") {
        exportParticipationHistoryXlsx(data);
        toast.success(`Exported participation summary for ${data.length} student(s) as CSV.`);
      } else {
        exportParticipationHistoryPdf(data);
        toast.success(`Exported participation summary for ${data.length} student(s) as PDF.`);
      }
    }

    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <section
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        {/* Header */}
        <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-xs">
              <Download className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="export-modal-title" className="text-base font-bold text-slate-900">
                Export Report
              </h2>
              <p className="text-xs text-slate-500 font-medium">Select report type, criteria, and download format.</p>
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
        <div className="p-6 space-y-5">
          {/* Step 1: Report Type Cards */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
              1. Report Content
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReportType("students")}
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  reportType === "students"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${reportType === "students" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <IdCard className="h-4 w-4" />
                  </div>
                  {reportType === "students" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Student Directory</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">Full profiles, contact emails, credentials & status.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportType("participation")}
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  reportType === "participation"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${reportType === "participation" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  {reportType === "participation" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Participation Summary</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">Attendance rates, events joined & request counts.</p>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Filters Grid */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                2. Scope & Filters
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-semibold text-slate-500 hover:text-primary transition"
              >
                Reset filters
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Program</label>
                <select
                  value={exportProgram}
                  onChange={(e) => setExportProgram(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">All programs</option>
                  {programs.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Section</label>
                <select
                  value={exportSection}
                  onChange={(e) => setExportSection(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">All sections</option>
                  {sections.map((sec) => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Account Status</label>
                <select
                  value={exportStatus}
                  onChange={(e) => setExportStatus(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">All statuses</option>
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Attendance Level</label>
                <select
                  value={exportAttendance}
                  onChange={(e) => setExportAttendance(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">All attendance rates</option>
                  <option value="high">75% & above</option>
                  <option value="low">Below 75% (At-risk)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Step 3: File Format Selection */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
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
                  <p className="text-[10px] text-slate-500 font-normal">Excel / CSV format</p>
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
                  <p className="text-[10px] text-slate-500 font-normal">Printable PDF report</p>
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
              {filteredStudents.length} records selected
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
              disabled={filteredStudents.length === 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
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

export function OrganizerUserManagementPage() {
  const scope = useOrganizerScope();
  const studentsQuery = useStudents({ pageSize: 100 }, scope.context);
  const academicCatalog = useAcademicCatalog({ pageSize: 100 }, scope.context);
  const attendanceRecordsQuery = useAttendanceRecords({ pageSize: 100 }, scope.context);
  const correctionRequestsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);

  const [uiState, setUiState] = useState(() => loadOrganizerUiState());
  const [query, setQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const studentAccounts = useMemo<StudentAccount[]>(() => {
    const rawStudents = studentsQuery.data?.items ?? [];
    const programsMap = new Map((academicCatalog.programs.data?.items ?? []).map((p) => [p.id, p.code]));

    const dbAccounts = rawStudents.map((student) => {
      const studentRecords = (attendanceRecordsQuery.data?.items ?? []).filter((r) => r.studentId === student.id);
      const attendedCount = studentRecords.filter((r) => r.status === "present" || r.status === "late").length;
      const rate = studentRecords.length ? Math.round((attendedCount / studentRecords.length) * 100) : 100;

      const studentCorrections = (correctionRequestsQuery.data?.items ?? [])
        .filter((r) => r.studentId === student.id)
        .map((r) => ({
          id: r.id,
          eventCode: r.eventId ?? "EVT",
          type: r.requestedStatus === "excused" ? "Excuse" : "Correction",
          status: (r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending") as CorrectionStatus
        }));

      const programCode = student.programCode || programsMap.get(student.programId) || "BSIT";

      return {
        id: student.id,
        studentId: student.studentNumber,
        name: student.formattedName || student.fullName || student.studentNumber,
        email: student.email || `${student.studentNumber}@plpasig.edu.ph`,
        program: programCode,
        yearLevel: student.yearLevel,
        section: student.section,
        status: student.status === "enrolled" ? ("Active" as StudentStatus) : ("Suspended" as StudentStatus),
        attendanceRate: rate,
        eventsJoined: attendedCount,
        qrStatus: "Ready" as CredentialStatus,
        facialStatus: "Ready" as CredentialStatus,
        participationHistory: [],
        correctionRequests: studentCorrections
      };
    });

    const storeAccounts = buildStudentAccounts(uiState);
    const combined = [...dbAccounts, ...storeAccounts];
    const seen = new Set<string>();
    return combined.filter((account) => {
      if (seen.has(account.id) || seen.has(account.studentId)) return false;
      seen.add(account.id);
      seen.add(account.studentId);
      return true;
    });
  }, [studentsQuery.data?.items, academicCatalog.programs.data?.items, attendanceRecordsQuery.data?.items, correctionRequestsQuery.data?.items, uiState]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentAccounts[0]?.id ?? "");
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return studentAccounts.filter((student) => {
      const matchesQuery =
        !normalizedQuery ||
        student.name.toLowerCase().includes(normalizedQuery) ||
        student.id.toLowerCase().includes(normalizedQuery) ||
        student.studentId.toLowerCase().includes(normalizedQuery) ||
        student.email.toLowerCase().includes(normalizedQuery) ||
        student.program.toLowerCase().includes(normalizedQuery) ||
        String(student.yearLevel).toLowerCase().includes(normalizedQuery) ||
        student.section.toLowerCase().includes(normalizedQuery);
      const matchesProgram = programFilter === "all" || student.program === programFilter;
      const matchesSection = sectionFilter === "all" || student.section === sectionFilter;
      const matchesStatus = statusFilter === "all" || student.status === statusFilter;

      return matchesQuery && matchesProgram && matchesSection && matchesStatus;
    });
  }, [query, programFilter, sectionFilter, statusFilter, studentAccounts]);

  const selectedStudent = studentAccounts.find((student) => student.id === selectedStudentId) ?? filteredStudents[0] ?? studentAccounts[0];
  const programs = useMemo(() => Array.from(new Set(studentAccounts.map((student) => student.program))), [studentAccounts]);
  const sections = useMemo(() => Array.from(new Set(studentAccounts.map((student) => student.section))), [studentAccounts]);
  const averageAttendance = studentAccounts.length ? Math.round(studentAccounts.reduce((sum, student) => sum + student.attendanceRate, 0) / studentAccounts.length) : 0;
  const totalCorrectionRequests = studentAccounts.reduce((sum, student) => sum + student.correctionRequests.length, 0);

  function regenerateQrCredential(studentId: string) {
    setUiState((current) => regenerateOrganizerQr(current, studentId));
    toast.success("QR credential regenerated locally.");
  }

  function markFacialReady(studentId: string) {
    setUiState((current) => updateOrganizerFacialStatus(current, studentId, "Ready"));
    toast.success("Facial credential marked ready locally.");
  }

  function approveCorrection(requestId: string) {
    setUiState((current) => approveOrganizerCorrectionRequest(current, requestId, "Approved from organizer user management."));
    toast.success(`${requestId} approved locally.`);
  }

  function rejectCorrection(requestId: string) {
    setUiState((current) => rejectOrganizerCorrectionRequest(current, requestId, "Rejected from organizer user management."));
    toast.warning(`${requestId} rejected locally.`);
  }
  const studentColumns = useMemo<ColDef<StudentAccount>[]>(
    () => [
      {
        headerName: "Student",
        field: "name",
        minWidth: 200,
        flex: 1.2,
        cellRenderer: ({ data }: ICellRendererParams<StudentAccount>) =>
          data ? (
            <div className="py-1 leading-tight">
              <div className="font-medium text-foreground">{data.name}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{data.studentId}</div>
            </div>
          ) : null
      },
      {
        headerName: "Program",
        field: "program",
        minWidth: 110,
        maxWidth: 130
      },
      {
        headerName: "Year",
        field: "yearLevel",
        minWidth: 90,
        maxWidth: 110,
        valueFormatter: ({ value }) => `Year ${value ?? 1}`
      },
      {
        headerName: "Section",
        field: "section",
        minWidth: 100,
        maxWidth: 120
      },
      {
        headerName: "Email",
        field: "email",
        minWidth: 220,
        flex: 1.1
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
    <div className="space-y-4">
      <PageHeader
        title="User Management"
        actions={
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export Report
          </button>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Student Accounts" value={studentAccounts.length.toString()} detail="Accounts in scope" icon={Users} />
        <MetricCard title="Active Accounts" value={studentAccounts.filter((student) => student.status === "Active").length.toString()} detail="Active" icon={UserRoundCheck} />
        <MetricCard title="Avg. Attendance Rate" value={`${averageAttendance}%`} detail="Average rate" icon={BadgeCheck} />
        <MetricCard title="Correction Requests" value={totalCorrectionRequests.toString()} detail="Filed requests" icon={ClipboardList} />
      </section>

      <section className="space-y-4">
        <div className="rounded-lg border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 border-l-2 border-primary pl-3">
              <div className="grid h-8 w-8 place-items-center rounded-md border border-primary/15 bg-primary/5 text-primary">
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70">User Management</p>
                <h2 className="text-sm font-bold text-foreground">Student Accounts</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" aria-hidden="true" />
                {filteredStudents.length} results
              </span>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_140px_140px_140px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, ID, program, year, section..."
                className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <select
              value={programFilter}
              onChange={(event) => setProgramFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              aria-label="Filter by program"
            >
              <option value="all">All programs</option>
              {programs.map((program) => (
                <option key={program} value={program}>
                  {program}
                </option>
              ))}
            </select>
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
          emptyDescription="No student accounts match the current search and filters."
          enableColumnVisibility
          hideHeader
        />
      </section>
      <StudentDetailModal
        student={isStudentModalOpen ? selectedStudent : undefined}
        onClose={() => setIsStudentModalOpen(false)}
        onRegenerateQr={regenerateQrCredential}
        onMarkFacialReady={markFacialReady}
        onApproveCorrection={approveCorrection}
        onRejectCorrection={rejectCorrection}
      />
      <ReportExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        studentAccounts={studentAccounts}
        programs={programs}
        sections={sections}
        activeProgramFilter={programFilter}
        activeSectionFilter={sectionFilter}
        activeStatusFilter={statusFilter}
      />
    </div>
  );
}
