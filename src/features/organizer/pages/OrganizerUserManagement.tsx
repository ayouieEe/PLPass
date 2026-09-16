/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  BadgeCheck,
  CalendarCheck,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
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
  X,
  UserPlus,
  UploadCloud,
  FileDown,
  Edit
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils/errors";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { PageHeader } from "@/components/shared/PageHeader";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useCorrectionRequests,
  useOrganizerProfiles,
  useEvents,
  useUsers,
  useStudentCredentialMutations,
  useStudentCredentialStatuses,
  useStudents,
  useAuditLogMutations,
  useStudentMutations
  ,useOrganizerAccountMutation, useUpdateOrganizerAccountMutation, useBulkOrganizerAccountMutation, useAdminAccountMutation, useAdminProfiles
} from "@/hooks/useRepositoryQueries";
import Papa from "papaparse";
import { downloadStudentCsvTemplate } from "@/features/organizer/utils/csvTemplate";
import type { CreateAdminInput, CreateOrganizerInput, CreateStudentInput, UpdateOrganizerInput, UpdateStudentInput } from "@/services/contracts";
import type { OrganizerProfile, Student, User } from "@/types/domain";
import { exportReportPdf, exportReportXlsx } from "@/lib/exports/reportExport";

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

type StudentStatus = "Active" | "Deactivated";
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
  accountStatus: "active" | "inactive" | "suspended";
  attendanceRate: number | null;
  eventsJoined: number;
  qrStatus: CredentialStatus;
  facialStatus: CredentialStatus;
  participationHistory: ParticipationRecord[];
  correctionRequests: CorrectionRequest[];
};
type OrganizerDirectoryRow = {
  id: string;
  name: string;
  email: string;
  employeeNumber: string;
  organizationName: string;
  position: string;
  status: "Active" | "Inactive";
  eventsManaged: number;
};
function formatEmployeeIdInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 12);
}
function nextEmployeeId(items: Array<{ employeeNumber: string }>, prefix: "O" | "A") {
  const highest = items.reduce((max, item) => {
    const match = item.employeeNumber.match(new RegExp(`^${prefix}-(\\d{3})$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
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
  detail,
  icon: Icon
}: {
  title: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
}) {
  return (
    <article className="rounded-xl border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold leading-none text-foreground">{value}</p>
          {detail ? <p className="mt-2 text-xs font-medium text-muted-foreground">{detail}</p> : null}
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
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
    <div className="rounded-xl border bg-surface p-3.5">
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
    <div className={`rounded-xl border bg-surface p-3.5 ${colSpan}`}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}

function StudentDetailModal({
  student,
  onClose,
  onApproveCorrection,
  onRejectCorrection,
  onEdit,
  onToggleAccountStatus,
  isStatusUpdating
}: {
  student: StudentAccount | undefined;
  onClose: () => void;
  onApproveCorrection: (requestId: string) => void;
  onRejectCorrection: (requestId: string) => void;
  onEdit?: (studentId: string) => void;
  onToggleAccountStatus?: (studentId: string, nextStatus: "active" | "inactive") => void;
  isStatusUpdating?: boolean;
}) {
  if (!student) {
    return null;
  }
  const initials = student.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const attendanceRate = student.attendanceRate ?? null;

  // Rendered via a portal directly into document.body so the overlay's
  // z-[9999] is evaluated in the root stacking context. Without this, a
  // transformed/filtered ancestor elsewhere in the layout (e.g. a sidebar
  // wrapper) can trap the modal in a local stacking context, letting a
  // sticky/fixed topbar render on top of it and show through as a white bar.
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-700/40 p-6" onClick={onClose}>
      <section
        className="max-h-[86vh] w-full max-w-6xl overflow-hidden rounded-2xl border bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-primary/10 bg-gradient-to-r from-primary/[0.08] via-white to-white px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm">{initials}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Student account</p>
                <h2 id="student-detail-title" className="mt-0.5 truncate text-2xl font-semibold text-foreground">{student.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{student.studentId}</span>
                  <span aria-hidden="true">•</span>
                  <span>{student.program} · Year {student.yearLevel} · Section {student.section}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(student.id)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  Edit Information
                </button>
              )}
              {onToggleAccountStatus ? (
                <button
                  type="button"
                  disabled={isStatusUpdating}
                  onClick={() => onToggleAccountStatus(student.id, student.accountStatus === "active" ? "inactive" : "active")}
                  className={`inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                    student.accountStatus === "active"
                      ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100"
                  }`}
                >
                  {isStatusUpdating ? "Updating..." : student.accountStatus === "active" ? "Deactivate" : "Reactivate"}
                </button>
              ) : null}
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
        </div>

        <div className="max-h-[calc(86vh-97px)] overflow-y-auto bg-muted/20 px-5 pb-8 pt-5 sm:px-6 sm:pt-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DetailTile label="Account status">
              <StatusBadge value={student.status} />
            </DetailTile>
            <DetailTile label="Attendance rate">
              <div className="flex items-center gap-3">
                <span>{attendanceRate === null ? "N/A" : `${attendanceRate}%`}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${attendanceRate ?? 0}%` }} />
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
                  <ProfileCardTile label="Student Name" colSpan="sm:col-span-2 lg:col-span-4">{student.name}</ProfileCardTile>
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
                {student.participationHistory.length ? (
                  <div className="mt-4 overflow-hidden rounded-xl border bg-surface">
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
                            <td className="px-3 py-3"><span className="rounded-md border bg-background px-2 py-1 text-xs font-medium text-muted-foreground">{record.method}</span></td>
                            <td className="px-3 py-3 text-right"><StatusBadge value={record.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4 flex min-h-28 items-center gap-3 rounded-xl border border-dashed bg-surface px-4 text-sm text-muted-foreground">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><History className="h-4 w-4" aria-hidden="true" /></span>
                    <div><p className="font-medium text-foreground">No participation history yet</p><p className="mt-0.5">Attendance from completed events will appear here.</p></div>
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-4">
              <section className="rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <h3 className="font-semibold text-foreground">Credential Status</h3>
                </div>
                <div className="mt-4 divide-y overflow-hidden rounded-xl border bg-surface">
                  <div className="flex items-center justify-between gap-4 p-4">
                    <p className="text-xs font-medium uppercase text-muted-foreground">QR Credential</p>
                    <StatusBadge value={student.qrStatus} />
                  </div>
                  <div className="flex items-center justify-between gap-4 p-4">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Facial Credential</p>
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
  activeStatusFilter,
  activeSearch,
  onExportAction
}: {
  isOpen: boolean;
  onClose: () => void;
  studentAccounts: StudentAccount[];
  programs: string[];
  sections: string[];
  activeProgramFilter: string;
  activeSectionFilter: string;
  activeStatusFilter: string;
  activeSearch: string;
  onExportAction: (action: string, targetType: string, metadata: Record<string, unknown>) => void;
}) {
  const [reportType, setReportType] = useState<"students" | "participation">("students");
  const [exportProgram, setExportProgram] = useState(activeProgramFilter);
  const [exportSection, setExportSection] = useState(activeSectionFilter);
  const [exportStatus, setExportStatus] = useState(activeStatusFilter);
  const [exportSearch, setExportSearch] = useState(activeSearch);
  const [exportAttendance, setExportAttendance] = useState("all");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [isExportLoading, setIsExportLoading] = useState(false);

  if (!isOpen) {
    return null;
  }

  const filteredStudents = studentAccounts.filter((s) => {
    const normalizedSearch = exportSearch.trim().toLowerCase();
    const matchSearch = !normalizedSearch || `${s.name} ${s.email} ${s.studentId} ${s.program} ${s.section}`.toLowerCase().includes(normalizedSearch);
    const matchProg = exportProgram === "all" || s.program === exportProgram;
    const matchSec = exportSection === "all" || s.section === exportSection;
    const matchStat = exportStatus === "all" || s.status === exportStatus;
    let matchAtt = true;
    if (exportAttendance === "low") matchAtt = (s.attendanceRate ?? 0) < 75;
    else if (exportAttendance === "high") matchAtt = (s.attendanceRate ?? 0) >= 75;

    return matchSearch && matchProg && matchSec && matchStat && matchAtt;
  });

  function handleResetFilters() {
    setExportProgram("all");
    setExportSection("all");
    setExportStatus("all");
    setExportAttendance("all");
    setExportSearch("");
  }

  async function handleExport() {
    if (filteredStudents.length === 0) {
      toast.warning("No student records match the selected export criteria.");
      return;
    }

    setIsExportLoading(true);
    const exportTools = await import("@/features/organizer/utils/exportUtils")
      .catch(() => {
        toast.error("Unable to prepare the export. Please try again.");
        return null;
      })
      .finally(() => setIsExportLoading(false));
    if (!exportTools) return;

    if (reportType === "students") {
      const data = filteredStudents.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        email: s.email,
        program: s.program,
        yearLevel: s.yearLevel,
        section: s.section,
        status: s.status,
        attendanceRate: s.attendanceRate ?? 0,
        eventsJoined: s.eventsJoined,
        qrStatus: s.qrStatus,
        facialStatus: s.facialStatus,
        correctionRequests: s.correctionRequests.length
      }));

      if (exportFormat === "xlsx") {
        await exportTools.exportStudentListXlsx(data);
        toast.success(`Exported ${data.length} student record(s) as XLSX.`);
      } else {
        await exportTools.exportStudentListPdf(data);
        toast.success(`Exported ${data.length} student record(s) as PDF.`);
      }
    } else {
      const data = filteredStudents.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        program: s.program,
        yearLevel: s.yearLevel,
        section: s.section,
        attendanceRate: s.attendanceRate ?? 0,
        eventsJoined: s.eventsJoined,
        correctionRequests: s.correctionRequests.length
      }));

      if (exportFormat === "xlsx") {
        await exportTools.exportParticipationHistoryXlsx(data);
        toast.success(`Exported participation summary for ${data.length} student(s) as XLSX.`);
      } else {
        await exportTools.exportParticipationHistoryPdf(data);
        toast.success(`Exported participation summary for ${data.length} student(s) as PDF.`);
      }
    }

    onExportAction(
      reportType === "students" ? "Exported Student Directory" : "Exported Participation Summary",
      "export_action",
      {
        reportType,
        format: exportFormat,
        recordCount: filteredStudents.length,
        filters: {
          program: exportProgram,
          section: exportSection,
          status: exportStatus,
          attendance: exportAttendance
        }
      }
    );

    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <section
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        onClick={(event) => event.stopPropagation()}
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
              <div className="col-span-2">
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Search students</label>
                <input value={exportSearch} onChange={(e) => setExportSearch(e.target.value)} placeholder="Name, email, student ID, program, or section" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800" />
              </div>
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
                  <option value="Deactivated">Deactivated</option>
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
              disabled={filteredStudents.length === 0 || isExportLoading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExportLoading ? "Preparing export..." : `Export ${exportFormat.toUpperCase()}`}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

function AddStudentModal({
  isOpen,
  onClose,
  mutations,
  programs,
  departments
}: {
  isOpen: boolean;
  onClose: () => void;
  mutations: ReturnType<typeof useStudentMutations>;
  programs: { id: string; code: string; departmentId: string }[];
  departments: { id: string; code: string }[];
}) {
  const [formData, setFormData] = useState<CreateStudentInput>({
    studentNumber: "",
    email: "",
    firstName: "",
    middleName: "",
    lastName: "",
    programId: "",
    departmentId: "",
    sectionId: "",
    yearLevel: 1
  });
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await mutations.createStudentMutation.mutateAsync(formData);
      toast.success("Student added successfully");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-r from-primary/[0.08] via-white to-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><UserPlus className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Student account</p><h2 className="mt-0.5 text-lg font-semibold text-foreground">Add student</h2></div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border bg-white text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close add student modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-muted/20 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">First Name</label>
              <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Last Name</label>
              <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Middle Name (Optional)</label>
            <input type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.middleName} onChange={(e) => setFormData({ ...formData, middleName: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Student Number</label>
            <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.studentNumber} onChange={(e) => setFormData({ ...formData, studentNumber: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input required type="email" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
              <select required className="h-9 w-full rounded-md border px-3 text-sm" value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}>
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Program</label>
              <select required className="h-9 w-full rounded-md border px-3 text-sm" value={formData.programId} onChange={(e) => setFormData({ ...formData, programId: e.target.value })}>
                <option value="">Select Program</option>
                {programs.filter(p => !formData.departmentId || p.departmentId === formData.departmentId).map((p) => (
                  <option key={p.id} value={p.id}>{p.code}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Year Level</label>
              <input required type="number" min="1" max="5" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.yearLevel || ""} onChange={(e) => { const v = parseInt(e.target.value, 10); setFormData({ ...formData, yearLevel: isNaN(v) ? 0 : v }); }} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Section</label>
              <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.sectionId} onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })} />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {isLoading ? "Saving..." : "Save Student"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function AccountDirectoryTabs({ activeTab, onChange }: { activeTab: "students" | "organizers" | "admins"; onChange: (tab: "students" | "organizers" | "admins") => void }) {
  return <div role="tablist" aria-label="User account type" className="grid w-full grid-cols-3 rounded-xl border border-border bg-muted/30 p-1">
    <button type="button" role="tab" aria-selected={activeTab === "students"} onClick={() => onChange("students")} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === "students" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}>Students</button>
    <button type="button" role="tab" aria-selected={activeTab === "organizers"} onClick={() => onChange("organizers")} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === "organizers" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}>Organizers</button>
    <button type="button" role="tab" aria-selected={activeTab === "admins"} onClick={() => onChange("admins")} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === "admins" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}>Admins</button>
  </div>;
}

function OrganizerDirectoryStyledModern({ organizers, users, events, onAdd, onBulkAdd }: { organizers: Array<{ id: string; employeeNumber: string; organizationName: string; position: string; employmentStatus: string; userId: string }>; users: Array<{ id: string; displayName: string; email: string; isActive: boolean }>; events: Array<{ organizerId: string }>; onAdd: () => void; onBulkAdd: () => void }) {
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("all");
  const [status, setStatus] = useState("all");
  const counts = new Map<string, number>();
  events.forEach((event) => counts.set(event.organizerId, (counts.get(event.organizerId) ?? 0) + 1));
  const filtered = organizers.filter((organizer) => { const user = users.find((item) => item.id === organizer.userId); const active = user?.isActive !== false && organizer.employmentStatus === "active"; const haystack = `${user?.displayName ?? ""} ${user?.email ?? ""} ${organizer.employeeNumber} ${organizer.organizationName} ${organizer.position}`.toLowerCase(); return haystack.includes(search.toLowerCase()) && (college === "all" || organizer.organizationName === college) && (status === "all" || (status === "active" ? active : !active)); });
  const activeCount = organizers.filter((organizer) => organizer.employmentStatus === "active" && users.find((user) => user.id === organizer.userId)?.isActive !== false).length;
  const exportCsv = async () => { if (!filtered.length) return; await exportReportXlsx({ title: "PLPass Organizer Directory Report", rows: filtered.map((row) => { const user = users.find((item) => item.id === row.userId); return { Organizer: user?.displayName ?? "", Email: user?.email ?? "", "Employee ID": row.employeeNumber, "College / Department": row.organizationName, Position: row.position, Status: row.employmentStatus, "Events Managed": counts.get(row.id) ?? 0 }; }), fileName: "plpass-organizer-directory-" + new Date().toISOString().slice(0, 10) }); };
  const colleges = Array.from(new Set(organizers.map((organizer) => organizer.organizationName))).sort();
  return <div className="space-y-6"><section aria-label="Organizer account summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Organizer Accounts" value={`${organizers.length}`} detail="Accounts in scope" icon={Users} /><MetricCard title="Active Accounts" value={`${activeCount}`} detail="Currently active" icon={UserRoundCheck} /><MetricCard title="Inactive Accounts" value={`${organizers.length - activeCount}`} detail="Require attention" icon={ShieldCheck} /><MetricCard title="Events Managed" value={`${events.length}`} detail="Across all organizers" icon={CalendarCheck} /></section><div className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Organizer directory</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{filtered.length} organizers</span></div><p className="mt-1 text-sm text-muted-foreground">Search, filter, and manage organizer accounts.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90"><UserPlus className="h-4 w-4" />Add Organizer</button><button type="button" onClick={onBulkAdd} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-muted"><UploadCloud className="h-4 w-4" />Bulk Add</button><button type="button" onClick={exportCsv} disabled={!filtered.length} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Download className="h-4 w-4" />Export XLSX</button><button type="button" onClick={exportCsv} disabled={!filtered.length} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"><Download className="h-4 w-4" />Export XLSX</button></div></div><div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_160px]"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, ID, college..." className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><select value={college} onChange={(event) => setCollege(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Filter by college"><option value="all">All colleges</option>{colleges.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Filter by status"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div><section className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6"><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Organizer</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Employee ID</th><th className="px-4 py-3">College / department</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Events managed</th></tr></thead><tbody className="divide-y divide-border/70">{filtered.map((organizer) => { const user = users.find((item) => item.id === organizer.userId); const active = user?.isActive !== false && organizer.employmentStatus === "active"; return <tr key={organizer.id} className="hover:bg-primary/5"><td className="px-4 py-3 font-medium">{user?.displayName || "Unnamed organizer"}</td><td className="px-4 py-3 text-muted-foreground">{user?.email || "—"}</td><td className="px-4 py-3">{organizer.employeeNumber}</td><td className="px-4 py-3">{organizer.organizationName}</td><td className="px-4 py-3 text-muted-foreground">{organizer.position}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}`}>{active ? "Active" : "Inactive"}</span></td><td className="px-4 py-3 font-medium">{counts.get(organizer.id) ?? 0}</td></tr>; })}</tbody></table>{!filtered.length ? <p className="p-8 text-center text-sm text-muted-foreground">No organizer accounts match the current filters.</p> : null}</div></section></div>;
}

function OrganizerDirectoryPaginated({ organizers, users, events, onAdd, onBulkAdd, onEdit }: { organizers: Array<{ id: string; employeeNumber: string; organizationName: string; position: string; employmentStatus: string; userId: string }>; users: Array<{ id: string; displayName: string; email: string; isActive: boolean }>; events: Array<{ organizerId: string }>; onAdd: () => void; onBulkAdd: () => void; onEdit: (organizerId: string) => void }) {
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("all");
  const [status, setStatus] = useState("all");
  const eventCounts = new Map<string, number>();
  events.forEach((event) => eventCounts.set(event.organizerId, (eventCounts.get(event.organizerId) ?? 0) + 1));
  const filtered = organizers.filter((organizer) => {
    const user = users.find((item) => item.id === organizer.userId);
    const active = user?.isActive !== false && organizer.employmentStatus === "active";
    const haystack = `${user?.displayName ?? ""} ${user?.email ?? ""} ${organizer.employeeNumber} ${organizer.organizationName} ${organizer.position}`.toLowerCase();
    return haystack.includes(search.toLowerCase()) && (college === "all" || organizer.organizationName === college) && (status === "all" || (status === "active" ? active : !active));
  });
  const rows: OrganizerDirectoryRow[] = filtered.map((organizer) => {
    const user = users.find((item) => item.id === organizer.userId);
    return {
      id: organizer.id,
      name: user?.displayName || "Unnamed organizer",
      email: user?.email || "—",
      employeeNumber: organizer.employeeNumber,
      organizationName: organizer.organizationName,
      position: organizer.position,
      status: user?.isActive !== false && organizer.employmentStatus === "active" ? "Active" : "Inactive",
      eventsManaged: eventCounts.get(organizer.id) ?? 0
    };
  });
  const columns = useMemo<ColDef<OrganizerDirectoryRow>[]>(() => [
    { headerName: "Organizer", field: "name", minWidth: 220, pinned: "left", flex: 1.2, cellRenderer: ({ data }: ICellRendererParams<OrganizerDirectoryRow>) => data ? <div className="py-1 leading-tight"><div className="font-medium text-foreground">{data.name}</div><div className="mt-1 font-mono text-xs text-muted-foreground">{data.employeeNumber}</div></div> : null },
    { headerName: "Email", field: "email", minWidth: 220, flex: 1.1 },
    { headerName: "Employee ID", field: "employeeNumber", minWidth: 140 },
    { headerName: "College / department", field: "organizationName", minWidth: 220, flex: 1 },
    { headerName: "Position", field: "position", minWidth: 180 },
    { headerName: "Status", field: "status", minWidth: 120, cellRenderer: ({ value }: ICellRendererParams<OrganizerDirectoryRow, OrganizerDirectoryRow["status"]>) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${value === "Active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>{value}</span> },
    { headerName: "Events managed", field: "eventsManaged", minWidth: 150, valueFormatter: ({ value }) => `${value ?? 0} events` }
  ], []);
  const colleges = Array.from(new Set(organizers.map((organizer) => organizer.organizationName))).sort();
  const exportRows = rows.map((row) => ({ Organizer: row.name, Email: row.email, "Employee ID": row.employeeNumber, "College / Department": row.organizationName, Position: row.position, Status: row.status, "Events Managed": row.eventsManaged }));
  const exportCsv = async () => { if (!exportRows.length) return; await exportReportXlsx({ title: "PLPass Organizer Directory Report", rows: exportRows, fileName: "plpass-organizer-directory-" + new Date().toISOString().slice(0, 10) }); };
  const exportPdf = async () => { if (!exportRows.length) return; await exportReportPdf({ title: "PLPass Organizer Directory Report", rows: exportRows, fileName: "plpass-organizer-directory-" + new Date().toISOString().slice(0, 10) }); };
  return <div className="space-y-4"><div className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Organizer directory</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{rows.length} organizers</span></div><p className="mt-1 text-sm text-muted-foreground">Search, filter, and manage organizer accounts.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90"><UserPlus className="h-4 w-4" />Add Organizer</button><button type="button" onClick={onBulkAdd} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-muted"><UploadCloud className="h-4 w-4" />Bulk Add</button><button type="button" onClick={exportCsv} disabled={!rows.length} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Download className="h-4 w-4" />Export XLSX</button></div></div><div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_160px]"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, ID, college..." className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" /></label><select value={college} onChange={(event) => setCollege(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Filter by college"><option value="all">All colleges</option>{colleges.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm" aria-label="Filter by status"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div><PLPassDataGrid label="Organizer accounts" data={rows} columns={columns} onRowClick={(row) => onEdit(row.id)} emptyTitle="No organizer accounts" emptyDescription="No organizer accounts match the current search and filters." enableColumnVisibility hideHeader /></div>;
}

function OrganizerDirectoryStyled({ organizers, users, onAdd }: { organizers: Array<{ id: string; employeeNumber: string; organizationName: string; position: string; employmentStatus: string; userId: string }>; users: Array<{ id: string; displayName: string; email: string; isActive: boolean }>; onAdd: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = organizers.filter((organizer) => { const account = users.find((user) => user.id === organizer.userId); const value = `${account?.displayName ?? ""} ${account?.email ?? ""} ${organizer.employeeNumber} ${organizer.organizationName} ${organizer.position}`.toLowerCase(); return value.includes(search.trim().toLowerCase()); });
  const active = organizers.filter((organizer) => organizer.employmentStatus === "active" && users.find((user) => user.id === organizer.userId)?.isActive !== false).length;
  return <div className="space-y-6"><section aria-label="Organizer account summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Organizer Accounts" value={organizers.length.toString()} detail="Accounts in scope" icon={Users} /><MetricCard title="Active Accounts" value={active.toString()} detail={`${organizers.length - active} inactive`} icon={UserRoundCheck} /><MetricCard title="Colleges / Units" value={new Set(organizers.map((organizer) => organizer.organizationName)).size.toString()} detail="Organizations represented" icon={Building2} /><MetricCard title="Account Role" value="Organizer" detail="Event management access" icon={ShieldCheck} /></section><div className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-foreground">Organizer directory</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{filtered.length} {filtered.length === 1 ? "organizer" : "organizers"}</span></div><p className="mt-1 text-sm text-muted-foreground">Search and manage organizer accounts.</p></div><button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><UserPlus className="h-4 w-4" />Add Organizer</button></div><label className="relative mt-4 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email, employee ID, college..." className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label></div><section className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6"><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Organizer</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Employee ID</th><th className="px-4 py-3">College / department</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-border/70">{filtered.map((organizer) => { const account = users.find((user) => user.id === organizer.userId); const isActive = account?.isActive !== false && organizer.employmentStatus === "active"; return <tr key={organizer.id} className="hover:bg-primary/5"><td className="px-4 py-3 font-medium">{account?.displayName || "Unnamed organizer"}</td><td className="px-4 py-3 text-muted-foreground">{account?.email || "—"}</td><td className="px-4 py-3">{organizer.employeeNumber}</td><td className="px-4 py-3">{organizer.organizationName}</td><td className="px-4 py-3 text-muted-foreground">{organizer.position}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isActive ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}`}>{isActive ? "Active" : "Inactive"}</span></td></tr>; })}</tbody></table>{filtered.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No organizer accounts match your search.</p> : null}</div></section></div>;
}

function OrganizerDirectory({ organizers, users, onAdd }: { organizers: Array<{ id: string; employeeNumber: string; organizationName: string; position: string; employmentStatus: string; userId: string }>; users: Array<{ id: string; displayName: string; email: string; isActive: boolean }>; onAdd: () => void }) {
  return <section className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Organizer accounts</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{organizers.length} accounts</span></div><p className="mt-1 text-sm text-muted-foreground">All organizer accounts are displayed here after they are created.</p></div><button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><UserPlus className="h-4 w-4" />Add Organizer</button></div><div className="mt-5 overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Organizer</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Employee ID</th><th className="px-4 py-3">College / department</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-border/70">{organizers.map((organizer) => { const account = users.find((user) => user.id === organizer.userId); return <tr key={organizer.id} className="hover:bg-primary/5"><td className="px-4 py-3 font-medium">{account?.displayName || "Unnamed organizer"}</td><td className="px-4 py-3 text-muted-foreground">{account?.email || "—"}</td><td className="px-4 py-3">{organizer.employeeNumber}</td><td className="px-4 py-3">{organizer.organizationName}</td><td className="px-4 py-3 text-muted-foreground">{organizer.position}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${account?.isActive && organizer.employmentStatus === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}`}>{account?.isActive && organizer.employmentStatus === "active" ? "Active" : "Inactive"}</span></td></tr>; })}</tbody></table>{organizers.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No organizer accounts found.</p> : null}</div></section>;
}

function AdminDirectory({ users, onAdd }: { users: Array<{ id: string; displayName: string; email: string; isActive: boolean; role: string }>; onAdd: () => void }) {
  const admins = users.filter((user) => user.role === "admin");
  const columns = useMemo<ColDef<{ id: string; name: string; email: string; status: string }>[]>(() => [
    { headerName: "Admin", field: "name", minWidth: 240, pinned: "left", flex: 1 },
    { headerName: "Email", field: "email", minWidth: 260, flex: 1.2 },
    { headerName: "Status", field: "status", minWidth: 140, cellRenderer: ({ value }: ICellRendererParams) => <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{value}</span> }
  ], []);
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Admin directory</h2><p className="mt-1 text-sm text-muted-foreground">Manage administrator accounts with institution-wide access.</p></div><button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90"><UserPlus className="h-4 w-4" />Add Admin</button></div><PLPassDataGrid label="Admin accounts" data={admins.map((user) => ({ id: user.id, name: user.displayName, email: user.email, status: user.isActive ? "Active" : "Inactive" }))} columns={columns} emptyTitle="No admin accounts" emptyDescription="Create an admin account to give another user administrator access." enableColumnVisibility hideHeader /></div>;
}

function AddAdminModalAutomatic({ isOpen, onClose, mutation, departments, generatedEmployeeId }: { isOpen: boolean; onClose: () => void; mutation: ReturnType<typeof useAdminAccountMutation>; departments: Array<{ id: string; code: string }>; generatedEmployeeId: string }) {
  const [form, setForm] = useState<CreateAdminInput>({ email: "", firstName: "", middleName: "", lastName: "", employeeNumber: generatedEmployeeId, departmentId: "", officeName: "" });
  useEffect(() => { if (isOpen) setForm((current) => ({ ...current, employeeNumber: generatedEmployeeId })); }, [generatedEmployeeId, isOpen]);
  if (!isOpen) return null;
  const update = (key: keyof CreateAdminInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) { event.preventDefault(); try { await mutation.mutateAsync({ ...form, employeeNumber: generatedEmployeeId }); onClose(); } catch { /* mutation displays the error */ } }
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}><div className="w-full max-w-lg rounded-2xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b px-6 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Administrator account</p><h2 className="text-lg font-semibold">Add admin</h2></div><button type="button" onClick={onClose} aria-label="Close add admin dialog" className="grid h-9 w-9 place-items-center rounded-lg border"><X className="h-5 w-5" /></button></div><form onSubmit={(event) => void submit(event)} className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium">First name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label><label className="text-sm font-medium">Last name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Email<input required type="email" className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label className="text-sm font-medium">Admin ID<input readOnly className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value={generatedEmployeeId} /></label><label className="text-sm font-medium">Office<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.officeName} onChange={(event) => update("officeName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Department<select required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.departmentId} onChange={(event) => update("departmentId", event.target.value)}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label><p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground sm:col-span-2">A secure invitation will be sent to the administrator's email. No password is exposed to the admin creating the account.</p><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={mutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? "Creating…" : "Create admin"}</button></div></form></div></div>, document.body);
}

function AddAdminModal({ isOpen, onClose, mutation, departments, generatedEmployeeId }: { isOpen: boolean; onClose: () => void; mutation: ReturnType<typeof useAdminAccountMutation>; departments: Array<{ id: string; code: string }>; generatedEmployeeId: string }) {
  const [form, setForm] = useState<CreateAdminInput>({ email: "", firstName: "", middleName: "", lastName: "", employeeNumber: generatedEmployeeId, departmentId: "", officeName: "" });
  useEffect(() => { if (isOpen) setForm((current) => ({ ...current, employeeNumber: generatedEmployeeId })); }, [generatedEmployeeId, isOpen]);
  if (!isOpen) return null;
  const update = (key: keyof CreateAdminInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) { event.preventDefault(); try { await mutation.mutateAsync(form); onClose(); setForm({ email: "", firstName: "", middleName: "", lastName: "", employeeNumber: "", departmentId: "", officeName: "" }); } catch { /* mutation displays the error */ } }
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}><div className="w-full max-w-lg rounded-2xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b px-6 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Administrator account</p><h2 className="text-lg font-semibold">Add admin</h2></div><button type="button" onClick={onClose} aria-label="Close add admin dialog" className="grid h-9 w-9 place-items-center rounded-lg border"><X className="h-5 w-5" /></button></div><form onSubmit={(event) => void submit(event)} className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium">First name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label><label className="text-sm font-medium">Last name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Email<input required type="email" className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label className="text-sm font-medium">Admin ID<input required inputMode="numeric" pattern="[0-9]{3,}" placeholder="001" className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.employeeNumber} onChange={(event) => update("employeeNumber", formatEmployeeIdInput(event.target.value))} onBlur={() => update("employeeNumber", form.employeeNumber.padStart(3, "0"))} /><span className="mt-1 block text-xs text-muted-foreground">Use 001, 002, 003…</span></label><label className="text-sm font-medium">Office<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.officeName} onChange={(event) => update("officeName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Department<select required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.departmentId} onChange={(event) => update("departmentId", event.target.value)}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label><p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground sm:col-span-2">A secure invitation will be sent to the administrator's email. No password is exposed to the admin creating the account.</p><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={mutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? "Creating…" : "Create admin"}</button></div></form></div></div>, document.body);
}

function AddOrganizerModal({ isOpen, onClose, mutation, departments, generatedEmployeeId }: { isOpen: boolean; onClose: () => void; mutation: ReturnType<typeof useOrganizerAccountMutation>; departments: Array<{ id: string; code: string }>; generatedEmployeeId: string }) {
  const [form, setForm] = useState<CreateOrganizerInput>({ email: "", firstName: "", middleName: "", lastName: "", employeeNumber: generatedEmployeeId, departmentId: "", organizationName: "", position: "Organizer" });
  useEffect(() => { if (isOpen) setForm((current) => ({ ...current, employeeNumber: generatedEmployeeId })); }, [generatedEmployeeId, isOpen]);
  if (!isOpen) return null;
  const update = (key: keyof CreateOrganizerInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) { event.preventDefault(); try { await mutation.mutateAsync({ ...form, employeeNumber: generatedEmployeeId }); onClose(); setForm({ email: "", firstName: "", middleName: "", lastName: "", employeeNumber: generatedEmployeeId, departmentId: "", organizationName: "", position: "Organizer" }); } catch { /* mutation displays the error */ } }
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}><div className="w-full max-w-lg overflow-hidden rounded-2xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b bg-primary/5 px-6 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Organizer account</p><h2 className="text-lg font-semibold">Add organizer</h2></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border bg-surface text-muted-foreground hover:bg-muted" aria-label="Close add organizer dialog"><X className="h-5 w-5" /></button></div><form onSubmit={(event) => void submit(event)} className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium">First name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label><label className="text-sm font-medium">Last name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Email<input required type="email" className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label className="text-sm font-medium">Employee ID<input readOnly aria-readonly="true" className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value={generatedEmployeeId} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Assigned automatically when the account is created.</span></label><label className="text-sm font-medium">Position<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.position} onChange={(event) => update("position", event.target.value)} /></label><label className="text-sm font-medium">College / department<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.organizationName} onChange={(event) => update("organizationName", event.target.value)} /></label><label className="text-sm font-medium">Department<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.departmentId} onChange={(event) => update("departmentId", event.target.value)}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label><p className="sm:col-span-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">A secure invitation will be sent to the organizer's email. The employee ID is only an identifier, never a password.</p><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={mutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{mutation.isPending ? "Creating…" : "Create organizer"}</button></div></form></div></div>, document.body);
}

function EditOrganizerModal({ isOpen, onClose, organizer, user, departments, mutation }: { isOpen: boolean; onClose: () => void; organizer: OrganizerProfile | undefined; user: User | undefined; departments: Array<{ id: string; code: string }>; mutation: ReturnType<typeof useUpdateOrganizerAccountMutation> }) {
  const [form, setForm] = useState<UpdateOrganizerInput>({ id: "", profileId: "", email: "", firstName: "", middleName: "", lastName: "", departmentId: "", organizationName: "", position: "", accountStatus: "active", employmentStatus: "active" });

  useEffect(() => {
    if (!isOpen || !organizer || !user) return;
    const nameParts = user.displayName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() ?? "";
    const lastName = nameParts.length ? nameParts.pop() ?? "" : "";
    setForm({ id: organizer.id, profileId: organizer.userId, email: user.email, firstName, middleName: nameParts.join(" "), lastName, departmentId: organizer.departmentId ?? "", organizationName: organizer.organizationName, position: organizer.position, accountStatus: user.isActive ? "active" : "inactive", employmentStatus: organizer.employmentStatus });
  }, [isOpen, organizer, user]);

  if (!isOpen || !organizer || !user) return null;
  const update = <Key extends keyof UpdateOrganizerInput>(key: Key, value: UpdateOrganizerInput[Key]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => { event.preventDefault(); try { await mutation.mutateAsync(form); onClose(); } catch { /* mutation presents the safe error */ } };

  return createPortal(<div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}><div className="w-full max-w-lg overflow-hidden rounded-2xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b bg-primary/5 px-6 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Edit className="h-5 w-5" /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Organizer account</p><h2 className="text-lg font-semibold">Edit organizer</h2></div></div><button type="button" onClick={onClose} aria-label="Close edit organizer dialog" className="grid h-9 w-9 place-items-center rounded-lg border bg-surface text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button></div><form onSubmit={(event) => void submit(event)} className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-medium">First name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label><label className="text-sm font-medium">Last name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Middle name <span className="font-normal text-muted-foreground">(optional)</span><input className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.middleName ?? ""} onChange={(event) => update("middleName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Email<input required type="email" className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label className="text-sm font-medium">Employee ID<input readOnly aria-readonly="true" className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value={organizer.employeeNumber} /><span className="mt-1 block text-xs font-normal text-muted-foreground">Employee IDs stay fixed, like student numbers.</span></label><label className="text-sm font-medium">Position<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.position} onChange={(event) => update("position", event.target.value)} /></label><label className="text-sm font-medium">College / department<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.organizationName} onChange={(event) => update("organizationName", event.target.value)} /></label><label className="text-sm font-medium">Department<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.departmentId ?? ""} onChange={(event) => update("departmentId", event.target.value)}><option value="">No linked department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label><label className="text-sm font-medium">Account access<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.accountStatus} onChange={(event) => update("accountStatus", event.target.value as UpdateOrganizerInput["accountStatus"])}><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></select></label><label className="text-sm font-medium">Employment status<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.employmentStatus} onChange={(event) => update("employmentStatus", event.target.value as UpdateOrganizerInput["employmentStatus"])}><option value="active">Active</option><option value="part_time">Part time</option><option value="on_leave">On leave</option><option value="separated">Separated</option></select></label><div className="flex justify-end gap-2 pt-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={mutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{mutation.isPending ? "Saving…" : "Save changes"}</button></div></form></div></div>, document.body);
}

function BulkAddOrganizerModal({ isOpen, onClose, mutation }: { isOpen: boolean; onClose: () => void; mutation: ReturnType<typeof useBulkOrganizerAccountMutation> }) {
  const [error, setError] = useState("");
  const downloadTemplate = () => { const csv = "First Name,Middle Name,Last Name,Email,College/Department,Position\nJuan,,Dela Cruz,juan@example.com,Student Affairs,Events Coordinator\n"; const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = "organizer-accounts-template.csv"; link.click(); URL.revokeObjectURL(url); };
  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.currentTarget.files?.[0]; if (!file) return; setError(""); Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: true, complete: async (results) => { try { const required = ["First Name", "Last Name", "Email", "College/Department", "Position"]; const missing = required.filter((key) => !results.meta.fields?.includes(key)); if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`); const inputs = results.data.map((row, index) => { const missingRow = required.find((key) => !row[key]?.trim()); if (missingRow) throw new Error(`Row ${index + 2}: ${missingRow} is required.`); return { firstName: row["First Name"].trim(), middleName: row["Middle Name"]?.trim(), lastName: row["Last Name"].trim(), email: row.Email.trim(), employeeNumber: "", organizationName: row["College/Department"].trim(), position: row.Position.trim() }; }); const duplicateEmail = new Set(inputs.map((input) => input.email.toLowerCase())).size !== inputs.length; if (duplicateEmail) throw new Error("The CSV contains duplicate email addresses."); const result = await mutation.mutateAsync(inputs); if (result.failed) setError(`${result.success} created, ${result.failed} failed. ${result.errors.map((item) => `Row ${item.row}: ${item.error}`).join(" ")}`); else onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } }, error: () => setError("The CSV file could not be read.") }); };
  if (!isOpen) return null;
  return createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}><div className="w-full max-w-lg overflow-hidden rounded-2xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b bg-primary/5 px-6 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Organizer accounts</p><h2 className="text-lg font-semibold">Bulk add organizers</h2></div><button type="button" onClick={onClose} aria-label="Close bulk organizer dialog" className="grid h-9 w-9 place-items-center rounded-lg border bg-surface text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button></div><div className="space-y-5 p-6"><div className="rounded-xl border bg-muted/30 p-4 text-sm"><p className="font-semibold">Use the CSV template</p><p className="mt-1 text-muted-foreground">Each organizer receives a secure invitation email. Employee IDs are identifiers only. Employee IDs are generated automatically during import.</p><button type="button" onClick={downloadTemplate} className="mt-3 inline-flex items-center gap-2 font-semibold text-primary hover:underline"><FileDown className="h-4 w-4" />Download template</button></div>{error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 text-center hover:bg-primary/10"><UploadCloud className="h-8 w-8 text-primary" /><span className="mt-2 text-sm font-semibold">Choose CSV file</span><span className="mt-1 text-xs text-muted-foreground">Invitation emails are sent after each account is created.</span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleUpload} disabled={mutation.isPending} /></label><div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Close</button></div></div></div></div>, document.body);
}

function EditStudentModal({
  isOpen,
  onClose,
  mutations,
  programs,
  departments,
  student,
  onSuccess
}: {
  isOpen: boolean;
  onClose: () => void;
  mutations: ReturnType<typeof useStudentMutations>;
  programs: { id: string; code: string; departmentId: string }[];
  departments: { id: string; code: string }[];
  student: Student | undefined;
  onSuccess: (action: string, targetType: string, metadata: Record<string, unknown>) => void;
}) {
  const [formData, setFormData] = useState<UpdateStudentInput>({
    id: "",
    profileId: "",
    email: "",
    firstName: "",
    middleName: "",
    lastName: "",
    programId: "",
    departmentId: "",
    sectionId: "",
    yearLevel: 1,
    accountStatus: "active"
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (student) {
      setFormData({
        id: student.id,
        profileId: student.userId,
        email: student.email || "",
        firstName: student.firstName || "",
        middleName: student.middleName || "",
        lastName: student.lastName || "",
        programId: student.programId || "",
        departmentId: student.departmentId || "",
        sectionId: student.section || "",
        yearLevel: student.yearLevel || 1,
        accountStatus: student.accountStatus ?? "active"
      });
    }
  }, [student]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await mutations.updateStudentMutation.mutateAsync(formData);
      toast.success("Student updated successfully");
      onSuccess("Updated Student Details", "student", { studentId: student?.studentNumber });
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-r from-primary/[0.08] via-white to-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><Edit className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Student account</p><h2 className="mt-0.5 text-lg font-semibold text-foreground">Edit student</h2></div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border bg-white text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close edit student modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-muted/20 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">First Name</label>
              <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Last Name</label>
              <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Middle Name (Optional)</label>
            <input type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.middleName} onChange={(e) => setFormData({ ...formData, middleName: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input required type="email" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
              <select required className="h-9 w-full rounded-md border px-3 text-sm" value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value, programId: "" })}>
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Program</label>
              <select required className="h-9 w-full rounded-md border px-3 text-sm" value={formData.programId} onChange={(e) => setFormData({ ...formData, programId: e.target.value })}>
                <option value="">Select Program</option>
                {programs.filter(p => !formData.departmentId || p.departmentId === formData.departmentId).map((p) => (
                  <option key={p.id} value={p.id}>{p.code}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Year Level</label>
              <input required type="number" min="1" max="5" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.yearLevel || ""} onChange={(e) => { const v = parseInt(e.target.value, 10); setFormData({ ...formData, yearLevel: isNaN(v) ? 0 : v }); }} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Section</label>
              <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.sectionId} onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })} />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function BulkAddStudentModal({
  isOpen,
  onClose,
  mutations,
  programs,
  departments
}: {
  isOpen: boolean;
  onClose: () => void;
  mutations: ReturnType<typeof useStudentMutations>;
  programs: { id: string; code: string; departmentId: string }[];
  departments: { id: string; code: string }[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState("");

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError("");
    setIsLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: Papa.ParseResult<Record<string, string>>) => {
        try {
          const parsedData = results.data as Record<string, string>[];
          const inputs: CreateStudentInput[] = parsedData.map(row => {
            const dept = departments.find(d => d.code === row["Department Code"]);
            const prog = programs.find(p => p.code === row["Program Code"]);
            if (!dept || !prog) {
              throw new Error(`Invalid department or program code for student ${row["Student Number"]}`);
            }
            return {
              studentNumber: row["Student Number"],
              email: row["Email"],
              firstName: row["First Name"],
              middleName: row["Middle Name"],
              lastName: row["Last Name"],
              programId: prog.id,
              departmentId: dept.id,
              sectionId: row["Section Name"],
              yearLevel: parseInt(row["Year Level"], 10) || 1
            };
          });

          await mutations.bulkCreateStudentsMutation.mutateAsync(inputs);
          toast.success(`Successfully imported ${inputs.length} students`);
          onClose();
        } catch (error) {
          setFileError(getErrorMessage(error));
        } finally {
          setIsLoading(false);
        }
      },
      error: () => {
        setFileError("Error reading the CSV file.");
        setIsLoading(false);
      }
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-r from-primary/[0.08] via-white to-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><UploadCloud className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Student accounts</p><h2 className="mt-0.5 text-lg font-semibold text-foreground">Bulk import</h2></div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border bg-white text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close bulk import modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-6 bg-muted/20 p-6">
        <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
          <p className="mb-3 font-semibold">Instructions:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Download the template file.</li>
            <li>Fill in student details exactly matching the headers.</li>
            <li>Use existing Program/Department codes.</li>
            <li>Upload the completed CSV file below.</li>
          </ol>
          <button type="button" onClick={downloadStudentCsvTemplate} className="mt-4 flex items-center gap-2 text-primary hover:underline font-medium">
            <FileDown className="h-4 w-4" /> Download Template
          </button>
        </div>

        {fileError && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {fileError}
          </div>
        )}

        <div className="flex justify-center">
          <label className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition hover:bg-slate-50 ${isLoading ? "opacity-50 pointer-events-none" : ""}`}>
            <UploadCloud className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <span className="text-sm font-medium text-slate-600">{isLoading ? "Processing..." : "Click to select CSV file"}</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
          </label>
        </div>
        </div>
      </div>
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
  const credentialStatusesQuery = useStudentCredentialStatuses(scope.context);
  const credentialMutations = useStudentCredentialMutations(scope.context);
  const auditLogMutations = useAuditLogMutations(scope.context);
  const studentMutations = useStudentMutations(scope.context);
  const organizerMutation = useOrganizerAccountMutation(scope.context);
  const updateOrganizerMutation = useUpdateOrganizerAccountMutation(scope.context);
  const bulkOrganizerMutation = useBulkOrganizerAccountMutation(scope.context);
  const adminMutation = useAdminAccountMutation(scope.context);
  const organizersQuery = useOrganizerProfiles({ pageSize: 100 }, scope.context);
  const usersQuery = useUsers({ pageSize: 100 }, scope.context);
  const adminProfilesQuery = useAdminProfiles({ pageSize: 100 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);

  const [query, setQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"students" | "organizers" | "admins">("students");
  const [isAddOrganizerModalOpen, setIsAddOrganizerModalOpen] = useState(false);
  const [isBulkOrganizerModalOpen, setIsBulkOrganizerModalOpen] = useState(false);
  const [isAddAdminModalOpen, setIsAddAdminModalOpen] = useState(false);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string | null>(null);
  const [isEditOrganizerModalOpen, setIsEditOrganizerModalOpen] = useState(false);

  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const selectedOrganizer = organizersQuery.data?.items.find((organizer) => organizer.id === selectedOrganizerId);
  const selectedOrganizerUser = usersQuery.data?.items.find((user) => user.id === selectedOrganizer?.userId);

  const studentAccounts = useMemo<StudentAccount[]>(() => {
    const rawStudents = studentsQuery.data?.items ?? [];
    const programsMap = new Map((academicCatalog.programs.data?.items ?? []).map((p) => [p.id, p.code]));
    const credentialMap = new Map((credentialStatusesQuery.data ?? []).map((status) => [status.studentId, status]));

    const dbAccounts = rawStudents.map((student) => {
      const studentRecords = (attendanceRecordsQuery.data?.items ?? []).filter((r) => r.studentId === student.id);
      const attendedCount = studentRecords.filter((r) => r.status === "present" || r.status === "late").length;
      const rate = studentRecords.length > 0 ? Math.round((attendedCount / studentRecords.length) * 100) : null;

      const studentCorrections = (correctionRequestsQuery.data?.items ?? [])
        .filter((r) => r.studentId === student.id)
        .map((r) => ({
          id: r.id,
          eventCode: r.eventId ?? "EVT",
          type: r.requestedStatus === "excused" ? "Excuse" : "Correction",
          status: (r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending") as CorrectionStatus
        }));

      const programCode = student.programCode || programsMap.get(student.programId) || "BSIT";
      const credentials = credentialMap.get(student.id);
      const qrCredential = credentials?.qrCredential;
      const facialProfile = credentials?.facialProfile;
      const qrExpired = Boolean(qrCredential?.expiresAt && new Date(qrCredential.expiresAt).getTime() <= Date.now());

      return {
        id: student.id,
        studentId: student.studentNumber,
        name: student.formattedName || student.fullName || student.studentNumber,
        email: student.email || `${student.studentNumber}@plpasig.edu.ph`,
        program: programCode,
        yearLevel: student.yearLevel,
        section: student.section,
        accountStatus: student.accountStatus ?? "active",
        status: student.accountStatus === "active" && student.status === "enrolled" ? ("Active" as StudentStatus) : ("Deactivated" as StudentStatus),
        attendanceRate: rate,
        eventsJoined: attendedCount,
        qrStatus: (!qrCredential ? "Missing" : qrExpired || qrCredential.revokedAt || qrCredential.status !== "activated" ? "Inactive" : "Ready") as CredentialStatus,
        facialStatus: (!facialProfile ? "Missing" : facialProfile.status === "activated" ? "Ready" : facialProfile.status === "inactive" ? "Inactive" : "Needs Review") as CredentialStatus,
        participationHistory: [],
        correctionRequests: studentCorrections
      };
    });

    return dbAccounts;
  }, [studentsQuery.data?.items, academicCatalog.programs.data?.items, attendanceRecordsQuery.data?.items, correctionRequestsQuery.data?.items, credentialStatusesQuery.data]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentAccounts[0]?.id ?? "");
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [statusUpdatingStudentId, setStatusUpdatingStudentId] = useState<string | null>(null);

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
  const rawStudent = studentsQuery.data?.items?.find((s) => s.id === selectedStudentId);
  const programs = useMemo(() => Array.from(new Set(studentAccounts.map((student) => student.program))), [studentAccounts]);
  const sections = useMemo(() => Array.from(new Set(studentAccounts.map((student) => student.section))), [studentAccounts]);
  const studentsWithRate = studentAccounts.filter((s) => s.attendanceRate !== null);
  const averageAttendance = studentsWithRate.length ? Math.round(studentsWithRate.reduce((sum, student) => sum + (student.attendanceRate ?? 0), 0) / studentsWithRate.length) : 0;
  const totalCorrectionRequests = studentAccounts.reduce((sum, student) => sum + student.correctionRequests.length, 0);

  async function regenerateQrCredential(studentId: string) {
    try {
      await credentialMutations.issueQrCredentialMutation.mutateAsync({ studentId });
      toast.success("QR credential issued in Supabase.");
    } catch {
      // The repository mutation reports the backend error; never simulate success locally.
    }
  }

  async function markFacialReady(studentId: string) {
    try {
      await credentialMutations.setCredentialStatusMutation.mutateAsync({ studentId, credentialType: "facial", status: "activated" });
      toast.success("Facial credential activated in Supabase.");
    } catch {
      // The repository mutation reports the backend error; never simulate success locally.
    }
  }

  async function toggleStudentAccountStatus(studentId: string, nextStatus: "active" | "inactive") {
    const student = studentsQuery.data?.items?.find((item) => item.id === studentId);
    if (!student) {
      toast.error("Student information is no longer available. Refresh the page and try again.");
      return;
    }

    setStatusUpdatingStudentId(studentId);
    try {
      await studentMutations.updateStudentMutation.mutateAsync({
        id: student.id,
        profileId: student.userId,
        email: student.email ?? "",
        firstName: student.firstName ?? "",
        middleName: student.middleName ?? "",
        lastName: student.lastName ?? "",
        programId: student.programId,
        departmentId: student.departmentId,
        sectionId: student.section,
        yearLevel: student.yearLevel,
        accountStatus: nextStatus,
        statusOnly: true
      });
      toast.success(nextStatus === "active" ? "Student account reactivated." : "Student account deactivated. QR and facial credentials were kept.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setStatusUpdatingStudentId(null);
    }
  }

  async function approveCorrection(requestId: string) {
    await correctionRequestsQuery.reviewMutation.mutateAsync({
      requestId,
      status: "approved",
      reason: "Approved from organizer user management."
    });
  }

  async function rejectCorrection(requestId: string) {
    await correctionRequestsQuery.reviewMutation.mutateAsync({
      requestId,
      status: "rejected",
      reason: "Rejected from organizer user management."
    });
  }
  const studentColumns = useMemo<ColDef<StudentAccount>[]>(
    () => [
      {
        headerName: "Student",
        field: "name",
        minWidth: 200,
        pinned: "left",
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
        cellRenderer: ({ value }: ICellRendererParams<StudentAccount, StudentStatus>) => <StatusBadge value={value ?? "Deactivated"} />
      },
      {
        headerName: "Attendance",
        field: "attendanceRate",
        minWidth: 170,
        cellRenderer: ({ value }: ICellRendererParams<StudentAccount, number | null>) => {
          if (value === null || value === undefined) {
            return (
              <div className="flex h-full items-center">
                <span className="font-medium text-muted-foreground text-sm">N/A</span>
              </div>
            );
          }
          
          const rate = value;
          const colorClass = rate >= 75 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-red-500";
          const textClass = rate >= 75 ? "text-emerald-700" : rate >= 50 ? "text-amber-700" : "text-red-700";

          return (
            <div className="flex h-full items-center gap-3">
              <span className={`w-10 font-bold ${textClass}`}>{rate}%</span>
              <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${rate}%` }} />
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
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description="Manage student accounts, track participation, and handle requests." />

      {activeTab === "students" ? <>
      <section aria-label="Student account summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Student Accounts" value={studentAccounts.length.toString()} detail="Accounts in scope" icon={Users} />
        <MetricCard
          title="Active Accounts"
          value={studentAccounts.filter((student) => student.status === "Active").length.toString()}
          detail={`${studentAccounts.filter((student) => student.status === "Deactivated").length} deactivated`}
          icon={UserRoundCheck}
        />
        <MetricCard title="Avg. Attendance Rate" value={`${averageAttendance}%`} detail="Average rate" icon={BadgeCheck} />
        <MetricCard title="Correction Requests" value={totalCorrectionRequests.toString()} detail="Filed requests" icon={ClipboardList} />
      </section>
      <AccountDirectoryTabs activeTab={activeTab} onChange={setActiveTab} />
      <div className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Student directory</h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{filteredStudents.length} {filteredStudents.length === 1 ? "student" : "students"}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Search, filter, and manage student accounts.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddStudentModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary bg-primary px-3 text-xs font-semibold text-white transition hover:border-primary/90 hover:bg-primary/90"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Student
            </button>
            <button
              type="button"
              onClick={() => setIsBulkAddModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              Bulk Add
            </button>
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
            <option value="Deactivated">Deactivated</option>
          </select>
        </div>
      </div>

      <section className="space-y-4">
        {filteredStudents.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-8 text-center animate-in fade-in-50">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Search className="h-8 w-8 text-primary/60" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No students found</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              We couldn't find any student accounts matching your current search and filters. Try adjusting your criteria.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setProgramFilter("all");
                setSectionFilter("all");
                setStatusFilter("all");
              }}
              className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <PLPassDataGrid
            label="Student accounts"
            data={filteredStudents}
            columns={studentColumns}
            emptyTitle="No student accounts"
            emptyDescription="No student accounts match the current search and filters."
            enableColumnVisibility
            hideHeader
            onRowClick={(student) => {
              setSelectedStudentId(student.id);
              setIsStudentModalOpen(true);
            }}
          />
        )}
      </section>
      </> : activeTab === "organizers" ? <>
        <section aria-label="Organizer account summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Organizer Accounts" value={`${organizersQuery.data?.items.length ?? 0}`} detail="Accounts in scope" icon={Users} />
          <MetricCard title="Active Accounts" value={`${organizersQuery.data?.items.filter((organizer) => organizer.employmentStatus === "active" && usersQuery.data?.items.find((user) => user.id === organizer.userId)?.isActive !== false).length ?? 0}`} detail="Currently active" icon={UserRoundCheck} />
          <MetricCard title="Inactive Accounts" value={`${Math.max(0, (organizersQuery.data?.items.length ?? 0) - (organizersQuery.data?.items.filter((organizer) => organizer.employmentStatus === "active" && usersQuery.data?.items.find((user) => user.id === organizer.userId)?.isActive !== false).length ?? 0))}`} detail="Require attention" icon={ShieldCheck} />
          <MetricCard title="Events Managed" value={`${eventsQuery.data?.items.length ?? 0}`} detail="Across all organizers" icon={CalendarCheck} />
        </section>
        <AccountDirectoryTabs activeTab={activeTab} onChange={setActiveTab} />
        <div className="[&>div>section:first-child]:hidden">
          <OrganizerDirectoryPaginated organizers={organizersQuery.data?.items ?? []} users={usersQuery.data?.items ?? []} events={eventsQuery.data?.items ?? []} onAdd={() => setIsAddOrganizerModalOpen(true)} onBulkAdd={() => setIsBulkOrganizerModalOpen(true)} onEdit={(organizerId) => { setSelectedOrganizerId(organizerId); setIsEditOrganizerModalOpen(true); }} />
        </div>
      </> : <>
        <AccountDirectoryTabs activeTab={activeTab} onChange={setActiveTab} />
        <AdminDirectory users={usersQuery.data?.items ?? []} onAdd={() => setIsAddAdminModalOpen(true)} />
      </>}

      {activeTab === "students" ? <>
      <StudentDetailModal
        student={isStudentModalOpen ? selectedStudent : undefined}
        onClose={() => setIsStudentModalOpen(false)}
        onApproveCorrection={approveCorrection}
        onRejectCorrection={rejectCorrection}
        onToggleAccountStatus={toggleStudentAccountStatus}
        isStatusUpdating={statusUpdatingStudentId === selectedStudent?.id}
        onEdit={(id) => {
          setSelectedStudentId(id);
          setIsEditModalOpen(true);
        }}
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
        activeSearch={query}
        onExportAction={(action, targetType, metadata) => {
          void auditLogMutations.logActionMutation.mutateAsync({
            action,
            targetType,
            metadata
          });
        }}
      />
      <AddStudentModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        mutations={studentMutations}
        programs={academicCatalog.programs.data?.items ?? []}
        departments={academicCatalog.departments.data?.items ?? []}
      />
      <BulkAddStudentModal
        isOpen={isBulkAddModalOpen}
        onClose={() => setIsBulkAddModalOpen(false)}
        mutations={studentMutations}
        programs={academicCatalog.programs.data?.items ?? []}
        departments={academicCatalog.departments.data?.items ?? []}
      />
      <EditStudentModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        mutations={studentMutations}
        programs={academicCatalog.programs.data?.items ?? []}
        departments={academicCatalog.departments.data?.items ?? []}
        student={rawStudent}
        onSuccess={(action, targetType, metadata) => {
          void auditLogMutations.logActionMutation.mutateAsync({
            action,
            targetType,
            metadata
          });
        }}
      />
      </> : null}
      <AddOrganizerModal isOpen={isAddOrganizerModalOpen} onClose={() => setIsAddOrganizerModalOpen(false)} mutation={organizerMutation} departments={academicCatalog.departments.data?.items ?? []} generatedEmployeeId={nextEmployeeId(organizersQuery.data?.items ?? [], "O")} />
      <EditOrganizerModal isOpen={isEditOrganizerModalOpen} onClose={() => setIsEditOrganizerModalOpen(false)} organizer={selectedOrganizer} user={selectedOrganizerUser} departments={academicCatalog.departments.data?.items ?? []} mutation={updateOrganizerMutation} />
      <BulkAddOrganizerModal isOpen={isBulkOrganizerModalOpen} onClose={() => setIsBulkOrganizerModalOpen(false)} mutation={bulkOrganizerMutation} />
      <AddAdminModalAutomatic isOpen={isAddAdminModalOpen} onClose={() => setIsAddAdminModalOpen(false)} mutation={adminMutation} departments={academicCatalog.departments.data?.items ?? []} generatedEmployeeId={nextEmployeeId(adminProfilesQuery.data?.items ?? [], "A")} />
    </div>
  );
}
