import { type ReactNode, useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  IdCard,
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
import { formatDateTime } from "@/lib/utils/date";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { getFacialCredentialDisplayStatus, getQrCredentialDisplayStatus, type CredentialDisplayStatus, type FacialCredentialDisplayStatus } from "@/lib/credentials/status";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSessions,
  useOrganizerProfiles,
  useEvents,
  useUsers,
  useStudentCredentialStatuses,
  useStudents,
  useAuditLogMutations,
  useStudentMutations
  ,useOrganizerAccountMutation, useUpdateOrganizerAccountMutation, useBulkOrganizerAccountMutation, useAdminAccountMutation, useUpdateAdminAccountMutation, useAdminProfiles
} from "@/hooks/useRepositoryQueries";
import Papa from "papaparse";
import { downloadStudentCsvTemplate } from "@/features/organizer/utils/csvTemplate";
import type { CreateAdminInput, CreateOrganizerInput, CreateStudentInput, UpdateOrganizerInput, UpdateStudentInput } from "@/services/contracts";
import type { AdminProfile, AttendanceRecord, AttendanceSession, Event, OrganizerProfile, Section, Semester, Student, User } from "@/types/domain";
import type { ExportOrganizerEventsSection, ExportOrganizerRow } from "@/features/organizer/utils/exportUtils";
import { capitalizePersonName } from "@/lib/utils/names";
import { generateAccountEmail } from "@/lib/utils/accountEmail";
import { formatStudentNumber } from "@/lib/utils/studentNumber";
import { hasCapability } from "@/lib/auth/permissions";
import { repositories } from "@/services/repositories";

function useOrganizerScope() {
  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined),
    [session]
  );
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context, session?.role === "organizer");
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" as const },
    organizerId: organizerQuery.data?.items[0]?.id,
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: organizerQuery.isError
  };
}

type StudentStatus = "Active" | "Deactivated";
type CredentialStatus = CredentialDisplayStatus | FacialCredentialDisplayStatus;
type OrganizerStatus = "Active" | "Inactive";
const studentNameExtensions = ["Jr.", "Sr.", "II", "III", "IV", "V"] as const;
const emptyStudentForm: CreateStudentInput = {
  studentNumber: "",
  email: "",
  firstName: "",
  middleName: "",
  lastName: "",
  nameExtension: undefined,
  programId: "",
  departmentId: "",
  sectionId: "",
  yearLevel: 1
};
type StudentAccount = {
  id: string;
  userId: string;
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
  facialStatus: FacialCredentialDisplayStatus;
};
function normalizeNameFieldValue(key: string, value: string | undefined) {
  return value === undefined || !["firstName", "middleName", "lastName"].includes(key) ? value : capitalizePersonName(value);
}
function nextEmployeeId(items: Array<{ employeeNumber: string }>, prefix: "O" | "A") {
  const highest = items.reduce((max, item) => {
    const match = item.employeeNumber.trim().match(new RegExp(`^${prefix}-(\\d{3})$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}
function statusClass(status: StudentStatus | CredentialStatus | OrganizerStatus) {
  if (status === "Active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "Pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-red-200 bg-red-50 text-red-700";
}

function StatusBadge({ value }: { value: StudentStatus | CredentialStatus | OrganizerStatus }) {
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

function NameExtensionSelect({ value, onChange, id }: { value?: string; onChange: (value: string) => void; id: string }) {
  return <label className="text-sm font-medium" htmlFor={id}>Extension Name (Optional)<select id={id} className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">No extension</option>{studentNameExtensions.map((extension) => <option key={extension} value={extension}>{extension}</option>)}</select></label>;
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
  onEdit,
  onToggleAccountStatus,
  onRevokeSessions,
  isStatusUpdating
}: {
  student: StudentAccount | undefined;
  onClose: () => void;
  onEdit?: (studentId: string) => void;
  onToggleAccountStatus?: (studentId: string, nextStatus: "active" | "inactive") => void;
  onRevokeSessions?: (userId: string, displayName: string) => void;
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
              {onRevokeSessions ? <button type="button" onClick={() => onRevokeSessions(student.userId, student.name)} className="inline-flex h-9 items-center rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100">Revoke all sessions</button> : null}
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
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
  filteredStudents,
  organizerRows,
  organizerEventSections,
  organizerInstitution,
  exportKind = "students",
  onExportAction
}: {
  isOpen: boolean;
  onClose: () => void;
  filteredStudents?: StudentAccount[];
  organizerRows?: ExportOrganizerRow[];
  organizerEventSections?: ExportOrganizerEventsSection[];
  organizerInstitution?: { collegeName?: string; schoolYear?: string };
  exportKind?: "students" | "organizers";
  onExportAction: (action: string, targetType: string, metadata: Record<string, unknown>) => void;
}) {
  const [reportType, setReportType] = useState<"students" | "participation" | "organizerDirectory" | "eventsManaged">(exportKind === "organizers" ? "organizerDirectory" : "students");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [isExportLoading, setIsExportLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setReportType(exportKind === "organizers" ? "organizerDirectory" : "students");
    setExportFormat("xlsx");
  }, [exportKind, isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleExport() {
    const records = exportKind === "organizers" ? organizerRows ?? [] : filteredStudents ?? [];
    if (records.length === 0) {
      toast.warning(`No ${exportKind === "organizers" ? "organizer" : "student"} records match the selected export criteria.`);
      return;
    }

    setIsExportLoading(true);
    try {
      const exportTools = await import("@/features/organizer/utils/exportUtils").catch(() => null);
      if (!exportTools) {
        toast.error("Unable to prepare the export. Please try again.");
        return;
      }

      if (exportKind === "organizers") {
        const data = records as ExportOrganizerRow[];
        if (reportType === "organizerDirectory") {
          if (exportFormat === "xlsx") await exportTools.exportOrganizerDirectoryXlsx(data);
          else await exportTools.exportOrganizerDirectoryPdf(data);
          toast.success(`Exported ${data.length} organizer record(s) as ${exportFormat.toUpperCase()}.`);
        } else {
          const sections = (organizerEventSections ?? []).filter((section) => section.rows.length > 0);
          const managedEventCount = sections.reduce((count, section) => count + section.rows.length, 0);
          if (managedEventCount === 0) {
            toast.warning("No managed events match the selected organizer criteria.");
            return;
          }
          if (exportFormat === "xlsx") await exportTools.exportOrganizerEventsSummaryXlsx(sections, organizerInstitution);
          else await exportTools.exportOrganizerEventsSummaryPdf(sections, organizerInstitution);
          toast.success(`Exported ${managedEventCount} managed event(s) across ${sections.length} organizer(s) as ${exportFormat.toUpperCase()}.`);
        }
      } else if (reportType === "students") {
        const students = records as StudentAccount[];
        const data = students.map((s) => ({
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
          facialStatus: s.facialStatus
        }));

        if (exportFormat === "xlsx") {
          await exportTools.exportStudentListXlsx(data);
          toast.success(`Exported ${data.length} student record(s) as XLSX.`);
        } else {
          await exportTools.exportStudentListPdf(data);
          toast.success(`Exported ${data.length} student record(s) as PDF.`);
        }
      } else {
        const data = (records as StudentAccount[]).map((s) => ({
          studentId: s.studentId,
          name: s.name,
          program: s.program,
          yearLevel: s.yearLevel,
          section: s.section,
          attendanceRate: s.attendanceRate ?? 0,
          eventsJoined: s.eventsJoined
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
        exportKind === "organizers" ? (reportType === "organizerDirectory" ? "Exported Organizer Directory" : "Exported Events Managed Summary") : (reportType === "students" ? "Exported Student Directory" : "Exported Participation Summary"),
        "export_action",
        {
          reportType,
          exportKind,
          format: exportFormat,
          recordCount: records.length,
          filters: "page-filtered"
        }
      );

      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to export the selected records. Please try again.");
    } finally {
      setIsExportLoading(false);
    }
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
        <div className="p-6 space-y-5">
          {/* Step 1: Report Type Cards */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
              1. Report Content
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReportType(exportKind === "organizers" ? "organizerDirectory" : "students")}
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  (exportKind === "organizers" ? reportType === "organizerDirectory" : reportType === "students")
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${(exportKind === "organizers" ? reportType === "organizerDirectory" : reportType === "students") ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <IdCard className="h-4 w-4" />
                  </div>
                  {(exportKind === "organizers" ? reportType === "organizerDirectory" : reportType === "students") && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{exportKind === "organizers" ? "Organizer Directory" : "Student Directory"}</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{exportKind === "organizers" ? "Profiles, department, position, status & events managed." : "Full profiles, contact emails, credentials & status."}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportType(exportKind === "organizers" ? "eventsManaged" : "participation")}
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  (exportKind === "organizers" ? reportType === "eventsManaged" : reportType === "participation")
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${(exportKind === "organizers" ? reportType === "eventsManaged" : reportType === "participation") ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  {(exportKind === "organizers" ? reportType === "eventsManaged" : reportType === "participation") && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{exportKind === "organizers" ? "Events Managed Summary" : "Participation Summary"}</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">{exportKind === "organizers" ? "Aggregate event counts by organizer and department." : "Attendance rates, events joined & request counts."}</p>
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: File Format Selection */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
              2. Download Format
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
              {(exportKind === "organizers" ? organizerRows?.length ?? 0 : filteredStudents?.length ?? 0)} records selected
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
              disabled={(exportKind === "organizers" ? (organizerRows?.length ?? 0) : (filteredStudents?.length ?? 0)) === 0 || isExportLoading}
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
  departments,
  sections,
  fixedDepartmentId
}: {
  isOpen: boolean;
  onClose: () => void;
  mutations: ReturnType<typeof useStudentMutations>;
  programs: { id: string; code: string; departmentId: string }[];
  departments: { id: string; code: string }[];
  sections: Section[];
  fixedDepartmentId?: string;
}) {
  const [formData, setFormData] = useState<CreateStudentInput>(() => ({ ...emptyStudentForm }));
  const [isLoading, setIsLoading] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const availableSections = sections.filter(
    (section) => section.isActive && section.programId === formData.programId && section.yearLevel === formData.yearLevel
  );
  const cleanForm = { ...emptyStudentForm, departmentId: fixedDepartmentId ?? "" };
  const isDirty = JSON.stringify(formData) !== JSON.stringify(cleanForm);
  const generatedEmail = generateAccountEmail(formData.lastName, formData.firstName, formData.middleName, formData.nameExtension);

  useEffect(() => {
    if (isOpen && fixedDepartmentId) {
      setFormData({ ...emptyStudentForm, departmentId: fixedDepartmentId });
    }
  }, [fixedDepartmentId, isOpen]);

  function resetAndClose() {
    setFormData({ ...emptyStudentForm, departmentId: fixedDepartmentId ?? "" });
    setIsDiscardConfirmOpen(false);
    onClose();
  }

  function requestClose() {
    if (isLoading) return;
    if (isDirty) {
      setIsDiscardConfirmOpen(true);
      return;
    }
    resetAndClose();
  }

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitConfirmOpen(true);
  };
  const confirmSubmit = async () => {
    setIsSubmitConfirmOpen(false);
    setIsLoading(true);
    try {
      await mutations.createStudentMutation.mutateAsync({ ...formData, email: generatedEmail, departmentId: fixedDepartmentId ?? formData.departmentId });
      toast.success("Student added successfully");
      resetAndClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={requestClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-r from-primary/[0.08] via-white to-white px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><UserPlus className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Student account</p><h2 className="mt-0.5 text-lg font-semibold text-foreground">Add student</h2></div>
          </div>
          <button type="button" onClick={requestClose} className="grid h-9 w-9 place-items-center rounded-lg border bg-white text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close add student modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-muted/20 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">First Name</label>
              <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: capitalizePersonName(e.target.value) })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Last Name</label>
              <input required type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: capitalizePersonName(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Middle Name (Optional)</label>
            <input type="text" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.middleName} onChange={(e) => setFormData({ ...formData, middleName: capitalizePersonName(e.target.value) })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="student-name-extension">Extension Name (Optional)</label>
            <select id="student-name-extension" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.nameExtension ?? ""} onChange={(e) => setFormData({ ...formData, nameExtension: (e.target.value || undefined) as CreateStudentInput["nameExtension"] })}>
              <option value="">No extension</option>
              {studentNameExtensions.map((extension) => <option key={extension} value={extension}>{extension}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Student Number</label>
            <input required type="text" inputMode="numeric" autoComplete="off" maxLength={8} pattern="\d{2}-\d{5}" placeholder="00-00000" className="h-9 w-full rounded-md border px-3 text-sm" value={formData.studentNumber} onChange={(e) => setFormData({ ...formData, studentNumber: formatStudentNumber(e.target.value) })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Generated email</label>
            <input readOnly aria-readonly="true" type="email" className="h-9 w-full rounded-md border bg-muted px-3 text-sm" value={generatedEmail} placeholder="Enter the name to generate an email" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="student-department">Department</label>
              {fixedDepartmentId ? <input id="student-department" readOnly aria-readonly="true" className="h-9 w-full rounded-md border bg-muted px-3 text-sm" value={departments.find((department) => department.id === fixedDepartmentId)?.code ?? "Your department"} /> : <select id="student-department" required className="h-9 w-full rounded-md border px-3 text-sm" value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value, programId: "", sectionId: "" })}>
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.code}</option>
                ))}
              </select>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="student-program">Program</label>
              <select id="student-program" required className="h-9 w-full rounded-md border px-3 text-sm" value={formData.programId} onChange={(e) => setFormData({ ...formData, programId: e.target.value, sectionId: "" })}>
                <option value="">Select Program</option>
                {programs.filter(p => !formData.departmentId || p.departmentId === formData.departmentId).map((p) => (
                  <option key={p.id} value={p.id}>{p.code}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="student-year-level">Year Level</label>
              <select id="student-year-level" required className="h-9 w-full rounded-md border px-3 text-sm" value={formData.yearLevel} onChange={(e) => setFormData({ ...formData, yearLevel: Number(e.target.value), sectionId: "" })}>
                {[1, 2, 3, 4, 5].map((yearLevel) => <option key={yearLevel} value={yearLevel}>{yearLevel}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="student-section">Section</label>
              <select id="student-section" required disabled={!formData.programId || availableSections.length === 0} className="h-9 w-full rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" value={formData.sectionId} onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}>
                <option value="">{!formData.programId ? "Select a program first" : availableSections.length ? "Select Section" : "No sections available"}</option>
                {availableSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
              </select>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <button type="button" onClick={requestClose} className="h-9 rounded-md border px-4 text-sm font-medium hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isLoading} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50">
              {isLoading ? "Saving..." : "Save Student"}
            </button>
          </div>
        </form>
      </div>
    </div>
    <ConfirmModal
      open={isDiscardConfirmOpen}
      title="Discard student details?"
      description="Your unsaved student account details will be lost."
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      tone="danger"
      onConfirm={resetAndClose}
      onCancel={() => setIsDiscardConfirmOpen(false)}
    />
    <ConfirmModal
      open={isSubmitConfirmOpen}
      title="Create student account?"
      description={`Create ${formData.firstName} ${formData.lastName} and send an invitation to ${generatedEmail}.`}
      confirmLabel="Create student"
      confirmDisabled={isLoading}
      onConfirm={() => void confirmSubmit()}
      onCancel={() => setIsSubmitConfirmOpen(false)}
    />
    </>,
    document.body
  );
}

function AccountDirectoryTabs({ activeTab, onChange, showAdmins = true }: { activeTab: "students" | "organizers" | "admins"; onChange: (tab: "students" | "organizers" | "admins") => void; showAdmins?: boolean }) {
  return <div role="tablist" aria-label="User account type" className={`grid w-full ${showAdmins ? "grid-cols-3" : "grid-cols-2"} rounded-xl border border-border bg-muted/30 p-1`}>
    <button type="button" role="tab" aria-selected={activeTab === "students"} onClick={() => onChange("students")} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === "students" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}>Students</button>
    <button type="button" role="tab" aria-selected={activeTab === "organizers"} onClick={() => onChange("organizers")} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === "organizers" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}>Organizers</button>
    {showAdmins ? <button type="button" role="tab" aria-selected={activeTab === "admins"} onClick={() => onChange("admins")} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${activeTab === "admins" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}>Admins</button> : null}
  </div>;
}

function AdminDirectory({ users, adminProfiles, departments, onAdd, onEdit, canAdd }: { users: Array<{ id: string; displayName: string; email: string; isActive: boolean; role: string }>; adminProfiles: AdminProfile[]; departments: Array<{ id: string; code: string }>; onAdd: () => void; onEdit: (adminId: string) => void; canAdd: boolean }) {
  const admins = users.filter((user) => ["admin", "department_admin"].includes(user.role) && adminProfiles.some((profile) => profile.userId === user.id));
  const departmentById = new Map(departments.map((department) => [department.id, department.code]));
  const columns = useMemo<ColDef<{ id: string; userId: string; role: string; name: string; email: string; accountType: string; department: string; status: string }>[]>(() => [
    { headerName: "Admin", field: "name", minWidth: 240, pinned: "left", flex: 1 },
    { headerName: "Email", field: "email", minWidth: 260, flex: 1.2 },
    { headerName: "Account type", field: "accountType", minWidth: 180 },
    { headerName: "Department", field: "department", minWidth: 150 },
    { headerName: "Status", field: "status", minWidth: 140, cellRenderer: ({ value }: ICellRendererParams) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${value === "Active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{value}</span> }
  ], []);
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Admin directory</h2><p className="mt-1 text-sm text-muted-foreground">Manage university and department administrator accounts.</p></div>{canAdd ? <button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90"><UserPlus className="h-4 w-4" />Add Admin</button> : null}</div><PLPassDataGrid label="Admin accounts" data={admins.map((user) => { const profile = adminProfiles.find((item) => item.userId === user.id); return { id: profile?.id ?? user.id, userId: user.id, role: user.role, name: user.displayName, email: user.email, accountType: user.role === "department_admin" ? "Department admin" : "University admin", department: profile ? (departmentById.get(profile.departmentId) ?? "—") : "—", status: user.isActive ? "Active" : "Inactive" }; })} columns={columns} emptyTitle="No admin accounts" emptyDescription="Create an admin account to give another user administrator access." enableColumnVisibility hideHeader onRowClick={(row) => onEdit(row.id)} /></div>;
}

function RevokeUserSessionsDialog({ target, onClose, onConfirm }: { target: { userId: string; displayName: string } | null; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setReason(""); setError(null); }, [target?.userId]);
  if (!target) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) { setError("A reason is required for the audit record."); return; }
    setWorking(true); setError(null);
    try { await onConfirm(reason.trim()); onClose(); }
    catch (caught) { setError(getErrorMessage(caught)); }
    finally { setWorking(false); }
  };
  return createPortal(<div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/60 p-4" onClick={onClose}><form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-2xl border bg-surface p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><h2 className="text-lg font-semibold">Revoke all sessions</h2><p className="mt-2 text-sm text-muted-foreground">This signs <strong>{target.displayName}</strong> out of future refresh sessions. Existing access tokens expire normally; no account data is deleted.</p><label className="mt-4 block text-sm font-semibold">Reason<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-24 w-full rounded-lg border bg-background p-3 text-sm font-normal" placeholder="Why are these sessions being revoked?" /></label>{error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={working} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={working} className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{working ? "Revoking…" : "Revoke all sessions"}</button></div></form></div>, document.body);
}

function OrganizerDirectoryConsistent({ organizers, users, events, attendanceRecords, attendanceSessions, activeSemester, departments, onAdd, onBulkAdd, onEdit, canAdd, onExportAction }: { organizers: OrganizerProfile[]; users: User[]; events: Event[]; attendanceRecords: AttendanceRecord[]; attendanceSessions: AttendanceSession[]; activeSemester?: Semester; departments: Array<{ id: string; code: string; name?: string }>; onAdd: () => void; onBulkAdd: () => void; onEdit: (organizerId: string) => void; canAdd: boolean; onExportAction: (action: string, targetType: string, metadata: Record<string, unknown>) => void }) {
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const rows = organizers.filter((organizer) => {
    const user = users.find((item) => item.id === organizer.userId);
    return !normalizedQuery || `${user?.displayName ?? ""} ${user?.email ?? ""} ${organizer.employeeNumber} ${organizer.position}`.toLowerCase().includes(normalizedQuery);
  });
  const exportRows: ExportOrganizerRow[] = rows.map((organizer) => {
    const user = users.find((item) => item.id === organizer.userId);
    const department = departments.find((item) => item.id === organizer.departmentId);
    const departmentName = department?.name ?? department?.code ?? "—";
    const collegeName = /^ccs$/i.test(departmentName) ? "College of Computer Studies" : departmentName;
    return { organizerId: organizer.id, name: user?.displayName ?? "", email: user?.email ?? "", employeeNumber: organizer.employeeNumber, department: collegeName, position: organizer.position, status: organizer.employmentStatus === "active" && user?.isActive !== false ? "Active" : "Inactive", eventsManaged: events.filter((event) => event.organizerId === organizer.id).length };
  });
  const sessionEventMap = new Map(attendanceSessions.filter((session) => session.eventId).map((session) => [session.id, session.eventId as string]));
  const attendanceByEvent = new Map<string, { total: number; attended: number }>();
  attendanceRecords.forEach((record) => {
    const eventId = sessionEventMap.get(record.sessionId);
    if (!eventId) return;
    const current = attendanceByEvent.get(eventId) ?? { total: 0, attended: 0 };
    current.total += 1;
    if (record.status === "present" || record.status === "late") current.attended += 1;
    attendanceByEvent.set(eventId, current);
  });
  const schoolYear = activeSemester?.schoolYear;
  const semester = activeSemester?.label ?? "Current Semester";
  const organizerEventSections: ExportOrganizerEventsSection[] = exportRows.map((organizer) => ({
    organizerName: organizer.name || "Unnamed organizer",
    organizerEmail: organizer.email,
    employeeNumber: organizer.employeeNumber,
    department: organizer.department,
    position: organizer.position,
    accountStatus: organizer.status,
    rows: events.filter((event) => event.organizerId === organizer.organizerId).map((event) => ({
      organizerName: organizer.name || "Unnamed organizer",
      organizerEmail: organizer.email,
      employeeNumber: organizer.employeeNumber,
      department: organizer.department,
      position: organizer.position,
      accountStatus: organizer.status,
      college: /^ccs$/i.test(event.collegeOffice ?? "") ? "College of Computer Studies" : (event.collegeOffice || organizer.department),
      schoolYear: schoolYear ?? "Current School Year",
      semester,
      eventCode: event.code,
      eventName: event.title,
      category: event.category,
      venue: event.venue,
      startsAt: formatDateTime(event.startsAt),
      endsAt: formatDateTime(event.endsAt),
      status: event.status,
      priority: event.priorityLevel,
      attendanceRate: (() => { const stats = attendanceByEvent.get(event.id); return stats?.total ? `${Math.round((stats.attended / stats.total) * 100)}%` : "N/A"; })()
    }))
  }));
  const colleges = [...new Set(exportRows.map((organizer) => organizer.department).filter(Boolean))];
  return <><div className="rounded-xl border bg-surface p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Organizer directory</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{rows.length} organizers</span></div><p className="mt-1 text-sm text-muted-foreground">Search, filter, and manage organizer accounts.</p></div><div className="flex flex-wrap gap-2">{canAdd ? <><button type="button" onClick={onAdd} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-primary/90"><UserPlus className="h-4 w-4" />Add Organizer</button><button type="button" onClick={onBulkAdd} className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold hover:bg-muted"><UploadCloud className="h-4 w-4" />Bulk Add</button></> : null}<button type="button" onClick={() => setExportOpen(true)} disabled={!rows.length} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Download className="h-4 w-4" />Export</button></div></div><div className="mt-4"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, ID, or position..." className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus:border-primary focus:ring-2 focus:ring-primary/20" /></label></div></div><PLPassDataGrid label="Organizer accounts" data={rows} columns={[{ headerName: "Organizer", valueGetter: ({ data }) => users.find((user) => user.id === data?.userId)?.displayName ?? "Unnamed organizer", minWidth: 220, flex: 1 }, { headerName: "Email", valueGetter: ({ data }) => users.find((user) => user.id === data?.userId)?.email ?? "—", minWidth: 240, flex: 1 }, { headerName: "Employee ID", field: "employeeNumber", minWidth: 140 }, { headerName: "Department", valueGetter: ({ data }) => departments.find((department) => department.id === data?.departmentId)?.code ?? "—", minWidth: 140 }, { headerName: "Position", field: "position", minWidth: 160 }, { headerName: "Status", valueGetter: ({ data }) => { const user = users.find((item) => item.id === data?.userId); return data?.employmentStatus === "active" && user?.isActive !== false ? "Active" : "Inactive" }, cellRenderer: ({ value }: ICellRendererParams<OrganizerProfile, OrganizerStatus>) => <StatusBadge value={value ?? "Inactive"} />, minWidth: 120 }]} onRowClick={(row) => onEdit(row.id)} emptyTitle="No organizer accounts" emptyDescription="No organizer accounts match the current search." enableColumnVisibility hideHeader /><ReportExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} exportKind="organizers" organizerRows={exportRows} organizerEventSections={organizerEventSections} organizerInstitution={{ collegeName: colleges.length === 1 ? colleges[0] : "All Participating Colleges", schoolYear }} onExportAction={onExportAction} /></>;
}

function EditAdminModal({ isOpen, onClose, admin, user, departments, mutation, canRevokeSessions, onRevokeSessions, onResendInvitation }: { isOpen: boolean; onClose: () => void; admin: AdminProfile | undefined; user: User | undefined; departments: Array<{ id: string; code: string }>; mutation: ReturnType<typeof useUpdateAdminAccountMutation>; canRevokeSessions: boolean; onRevokeSessions: (userId: string, displayName: string) => void; onResendInvitation: (userId: string, displayName: string) => Promise<void> }) {
  const emptyForm = useMemo<import("@/services/contracts").UpdateAdminInput>(() => ({ id: "", profileId: "", email: "", firstName: "", middleName: "", lastName: "", nameExtension: undefined, employeeNumber: "", departmentId: "", officeName: "", accountStatus: "active" }), []);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resendConfirmOpen, setResendConfirmOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  useEffect(() => {
    if (!isOpen || !admin || !user) return;
    const parts = user.displayName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts.shift() ?? "";
    const lastName = parts.pop() ?? "";
    const next = { id: admin.id, profileId: admin.userId, email: user.email, firstName, middleName: parts.join(" "), lastName, nameExtension: user.nameExtension as typeof emptyForm.nameExtension, employeeNumber: admin.employeeNumber, departmentId: admin.departmentId, officeName: user.role === "department_admin" && admin.officeName === "Department Administration" ? "Department Administrator" : admin.officeName, accountStatus: user.isActive ? "active" as const : "inactive" as const };
    setForm(next); setInitialForm(next);
  }, [admin, emptyForm, isOpen, user]);
  if (!isOpen || !admin || !user) return null;
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const requestClose = () => { if (mutation.isPending) return; if (dirty) setConfirmOpen(true); else onClose(); };
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: normalizeNameFieldValue(String(key), value) }));
  const submit = (event: React.FormEvent) => { event.preventDefault(); setSaveConfirmOpen(true); };
  const confirmSubmit = async () => { if (!admin || !user || form.id !== admin.id || form.profileId !== user.id) { setSaveConfirmOpen(false); toast.error("This administrator record changed. Refresh and try again."); return; } try { await mutation.mutateAsync(form); setInitialForm(form); setSaveConfirmOpen(false); onClose(); } catch { /* mutation presents the safe error */ } };
  return createPortal(<><div className="account-edit-overlay fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={requestClose}><div role="dialog" aria-modal="true" aria-labelledby="edit-admin-title" className="account-edit-dialog w-full max-w-5xl overflow-hidden rounded-3xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b px-6 py-5 sm:px-9"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Administrator account</p><h2 id="edit-admin-title" className="text-2xl font-semibold">Edit admin</h2></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${form.accountStatus === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{form.accountStatus === "active" ? "Active" : "Inactive"}</span><button type="button" onClick={requestClose} aria-label="Close edit admin dialog" className="grid h-11 w-11 place-items-center rounded-full border"><X className="h-5 w-5" /></button></div></div><form onSubmit={(event) => void submit(event)} className="account-edit-form grid gap-x-5 gap-y-4 overflow-y-auto p-6 sm:grid-cols-3 sm:px-9 sm:py-7"><h3 className="sm:col-span-3 text-base font-semibold">Personal information</h3><label className="text-sm font-medium">First name<input required className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label><label className="text-sm font-medium">Middle name<input className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.middleName ?? ""} onChange={(event) => update("middleName", event.target.value)} /></label><label className="text-sm font-medium">Last name<input required className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Email<input required type="email" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><NameExtensionSelect id="edit-admin-name-extension" value={form.nameExtension} onChange={(value) => update("nameExtension", value)} /><h3 className="sm:col-span-3 border-t pt-5 text-base font-semibold">Employment</h3><label className="text-sm font-medium">Admin ID<input readOnly className="mt-1.5 h-11 w-full rounded-lg border bg-muted px-3 text-muted-foreground" value={form.employeeNumber} /></label><label className="text-sm font-medium">{user.role === "department_admin" ? "Position" : "Office / unit"}<input required className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.officeName} onChange={(event) => update("officeName", event.target.value)} /></label><label className="text-sm font-medium">Department<select required className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.departmentId} onChange={(event) => update("departmentId", event.target.value)}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label><h3 className="sm:col-span-3 border-t pt-5 text-base font-semibold">Account</h3><div className="account-edit-actions sm:col-span-3"><label className="text-sm font-medium">Account status<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.accountStatus} onChange={(event) => update("accountStatus", event.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><button type="button" onClick={() => setResendConfirmOpen(true)} className="rounded-lg border border-border px-4 py-3 text-sm font-semibold hover:bg-muted">Resend invitation</button>{canRevokeSessions ? <button type="button" onClick={() => onRevokeSessions(user.id, user.displayName)} className="rounded-lg border border-red-500/40 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400">Revoke all sessions</button> : null}</div><div className="account-edit-footer sm:col-span-3"><button type="button" onClick={requestClose} className="rounded-lg border px-5 py-3 text-sm font-semibold">Cancel</button><button type="submit" disabled={mutation.isPending} className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{mutation.isPending ? "Saving…" : "Save changes"}</button></div></form></div></div><ConfirmModal open={resendConfirmOpen} title="Resend activation email?" description="This will send an activation email only when the account is still unactivated. No duplicate account will be created." confirmLabel="Resend invitation" onConfirm={() => { setResendConfirmOpen(false); void onResendInvitation(user.id, user.displayName); }} onCancel={() => setResendConfirmOpen(false)} /><ConfirmModal open={confirmOpen} title="Discard admin changes?" description="Your unsaved admin profile changes will not be saved." confirmLabel="Discard changes" cancelLabel="Keep editing" tone="danger" onConfirm={() => { setConfirmOpen(false); onClose(); }} onCancel={() => setConfirmOpen(false)} /><ConfirmModal open={saveConfirmOpen} title="Save administrator changes?" description="The administrator profile and account access settings will be updated." confirmLabel="Save changes" confirmDisabled={mutation.isPending} onConfirm={() => void confirmSubmit()} onCancel={() => setSaveConfirmOpen(false)} /></>, document.body);
}

function AddAdminModalAutomatic({ isOpen, onClose, mutation, departments, generatedEmployeeId }: { isOpen: boolean; onClose: () => void; mutation: ReturnType<typeof useAdminAccountMutation>; departments: Array<{ id: string; code: string }>; generatedEmployeeId: string }) {
  const [form, setForm] = useState<CreateAdminInput>({ email: "", firstName: "", middleName: "", lastName: "", nameExtension: undefined, employeeNumber: generatedEmployeeId, departmentId: "", officeName: "", adminRole: "admin" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => { if (isOpen) setForm((current) => ({ ...current, employeeNumber: generatedEmployeeId })); }, [generatedEmployeeId, isOpen]);
  if (!isOpen) return null;
  const update = (key: keyof CreateAdminInput, value: string | undefined) => setForm((current) => ({ ...current, [key]: normalizeNameFieldValue(String(key), value) }));
  const generatedEmail = generateAccountEmail(form.lastName, form.firstName, form.middleName, form.nameExtension);
  function submit(event: React.FormEvent) { event.preventDefault(); setConfirmOpen(true); }
  async function confirmSubmit() { try { await mutation.mutateAsync({ ...form, email: generatedEmail, employeeNumber: generatedEmployeeId }); setConfirmOpen(false); onClose(); } catch { /* mutation displays the error */ } }
  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-6 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Administrator account</p><h2 className="text-lg font-semibold">Add admin</h2></div><button type="button" onClick={onClose} aria-label="Close add admin dialog" className="grid h-9 w-9 place-items-center rounded-lg border"><X className="h-5 w-5" /></button></div>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Account type<select required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.adminRole ?? "admin"} onChange={(event) => update("adminRole", event.target.value as CreateAdminInput["adminRole"])}><option value="admin">University admin</option><option value="department_admin">Department admin</option></select><span className="mt-1 block text-xs font-normal text-muted-foreground">Department admins manage department branding and scoped views; they cannot manage or start events.</span></label>
          <label className="text-sm font-medium">First name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label>
          <label className="text-sm font-medium">Middle name <span className="font-normal text-muted-foreground">(optional)</span><input className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.middleName ?? ""} onChange={(event) => update("middleName", event.target.value)} /></label>
          <label className="text-sm font-medium">Last name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label>
          <NameExtensionSelect id="add-admin-name-extension" value={form.nameExtension} onChange={(value) => update("nameExtension", value as CreateAdminInput["nameExtension"])} />
          <label className="text-sm font-medium sm:col-span-2">Generated email<input readOnly aria-readonly="true" type="email" className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value={generatedEmail} placeholder="Enter the name to generate an email" /></label>
          <label className="text-sm font-medium">Admin ID<input readOnly className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value={generatedEmployeeId} /></label>
          <label className="text-sm font-medium sm:col-span-2">Department<select required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.departmentId} onChange={(event) => update("departmentId", event.target.value)}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label>
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground sm:col-span-2">The address is generated from the name and a secure invitation is sent to it.</p>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={mutation.isPending || !generatedEmail} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{mutation.isPending ? "Creating…" : "Create admin"}</button></div>
        </form>
      </div>
    </div>
    <ConfirmModal open={confirmOpen} title="Create administrator account?" description={`Create ${form.firstName} ${form.lastName} and send an invitation to ${generatedEmail}.`} confirmLabel="Create admin" confirmDisabled={mutation.isPending} onConfirm={() => void confirmSubmit()} onCancel={() => setConfirmOpen(false)} />
    </>,
    document.body,
  );
}

type OrganizerCreationForm = Omit<CreateOrganizerInput, "email" | "employeeNumber" | "organizationName">;

function AddOrganizerModal({ isOpen, onClose, mutation, departments, generatedEmployeeId, fixedDepartmentId }: { isOpen: boolean; onClose: () => void; mutation: ReturnType<typeof useOrganizerAccountMutation>; departments: Array<{ id: string; code: string }>; generatedEmployeeId: string; fixedDepartmentId?: string }) {
  const [form, setForm] = useState<OrganizerCreationForm>({ firstName: "", middleName: "", lastName: "", nameExtension: undefined, departmentId: "", position: "Organizer" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => { if (isOpen) setForm((current) => ({ ...current, departmentId: fixedDepartmentId ?? current.departmentId })); }, [fixedDepartmentId, isOpen]);
  if (!isOpen) return null;
  const update = <Key extends keyof OrganizerCreationForm>(key: Key, value: OrganizerCreationForm[Key]) => setForm((current) => ({ ...current, [key]: normalizeNameFieldValue(String(key), value as string | undefined) }));
  const generatedEmail = generateAccountEmail(form.lastName, form.firstName, form.middleName, form.nameExtension);
  const submit = (event: React.FormEvent) => { event.preventDefault(); const departmentId = fixedDepartmentId ?? form.departmentId; const organizationName = departments.find((department) => department.id === departmentId)?.code; if (!organizationName) return; setConfirmOpen(true); };
  const confirmSubmit = async () => { const departmentId = fixedDepartmentId ?? form.departmentId; const organizationName = departments.find((department) => department.id === departmentId)?.code; if (!organizationName) { setConfirmOpen(false); return; } try { await mutation.mutateAsync({ ...form, departmentId, organizationName, email: generatedEmail, employeeNumber: generatedEmployeeId }); setConfirmOpen(false); onClose(); } catch { /* mutation presents the safe error */ } };
  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b bg-primary/5 px-6 py-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Organizer account</p><h2 className="text-lg font-semibold">Add organizer</h2></div><button type="button" onClick={onClose} aria-label="Close add organizer dialog" className="grid h-9 w-9 place-items-center rounded-lg border"><X className="h-5 w-5" /></button></div>
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 p-6 sm:grid-cols-2">
          <label className="text-sm font-medium">First name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label>
          <label className="text-sm font-medium">Middle name <span className="font-normal text-muted-foreground">(optional)</span><input className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.middleName ?? ""} onChange={(event) => update("middleName", event.target.value)} /></label>
          <label className="text-sm font-medium">Last name<input required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label>
          <NameExtensionSelect id="add-organizer-name-extension" value={form.nameExtension} onChange={(value) => update("nameExtension", value as OrganizerCreationForm["nameExtension"])} />
          <label className="text-sm font-medium sm:col-span-2">Generated email<input readOnly aria-readonly="true" type="email" className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value={generatedEmail} placeholder="Enter the name to generate an email" /></label>
          <label className="text-sm font-medium">Employee ID<input readOnly className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value={generatedEmployeeId} /></label>
          <label className="text-sm font-medium">Position<input required readOnly aria-readonly="true" className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value="Organizer" /></label>
          {fixedDepartmentId ? <label className="text-sm font-medium">Department<input readOnly className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border bg-muted px-3 text-muted-foreground" value={departments.find((department) => department.id === fixedDepartmentId)?.code ?? "Your department"} /></label> : <label className="text-sm font-medium">Department<select required className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={form.departmentId ?? ""} onChange={(event) => update("departmentId", event.target.value)}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label>}
          <p className="sm:col-span-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">The address is generated from the name and a secure invitation is sent to it.</p>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={mutation.isPending || !generatedEmail} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{mutation.isPending ? "Creating…" : "Create organizer"}</button></div>
        </form>
      </div>
    </div>
    <ConfirmModal open={confirmOpen} title="Create organizer account?" description={`Create ${form.firstName} ${form.lastName} and send an invitation to ${generatedEmail}.`} confirmLabel="Create organizer" confirmDisabled={mutation.isPending} onConfirm={() => void confirmSubmit()} onCancel={() => setConfirmOpen(false)} />
    </>,
    document.body,
  );
}

function EditOrganizerModal({ isOpen, onClose, organizer, user, departments, mutation, canRevokeSessions, onRevokeSessions, onResendInvitation, fixedDepartmentId }: { isOpen: boolean; onClose: () => void; organizer: OrganizerProfile | undefined; user: User | undefined; departments: Array<{ id: string; code: string }>; mutation: ReturnType<typeof useUpdateOrganizerAccountMutation>; canRevokeSessions: boolean; onRevokeSessions: (userId: string, displayName: string) => void; onResendInvitation: (userId: string, displayName: string) => Promise<void>; fixedDepartmentId?: string }) {
  departments = fixedDepartmentId ? departments.filter((department) => department.id === fixedDepartmentId) : departments;
  const emptyForm: UpdateOrganizerInput = { id: "", profileId: "", email: "", firstName: "", middleName: "", lastName: "", nameExtension: undefined, departmentId: "", organizationName: "", position: "", accountStatus: "active", employmentStatus: "active" };
  const [form, setForm] = useState<UpdateOrganizerInput>(emptyForm);
  const [initialForm, setInitialForm] = useState<UpdateOrganizerInput>(emptyForm);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resendConfirmOpen, setResendConfirmOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  useEffect(() => {
    if (!isOpen || !organizer || !user) return;
    const parts = user.displayName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts.shift() ?? "";
    const lastName = parts.pop() ?? "";
    const next = { id: organizer.id, profileId: organizer.userId, email: user.email, firstName, middleName: parts.join(" "), lastName, nameExtension: user.nameExtension as UpdateOrganizerInput["nameExtension"], departmentId: organizer.departmentId ?? "", organizationName: organizer.organizationName, position: organizer.position, accountStatus: user.isActive ? "active" as const : "inactive" as const, employmentStatus: organizer.employmentStatus === "part_time" ? "part_time" as const : "active" as const };
    setForm(next); setInitialForm(next);
  }, [isOpen, organizer, user]);
  useEffect(() => {
    if (!fixedDepartmentId) return;
    setForm((current) => ({ ...current, departmentId: fixedDepartmentId }));
    setInitialForm((current) => ({ ...current, departmentId: fixedDepartmentId }));
  }, [fixedDepartmentId]);
  if (!isOpen || !organizer || !user) return null;
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const requestClose = () => { if (mutation.isPending) return; if (dirty) setConfirmOpen(true); else onClose(); };
  const update = <Key extends keyof UpdateOrganizerInput>(key: Key, value: UpdateOrganizerInput[Key]) => setForm((current) => ({ ...current, [key]: normalizeNameFieldValue(String(key), value as string | undefined) }));
  const submit = (event: React.FormEvent) => { event.preventDefault(); setSaveConfirmOpen(true); };
  const confirmSubmit = async () => { if (!organizer || !user || form.id !== organizer.id || form.profileId !== user.id) { setSaveConfirmOpen(false); toast.error("This organizer record changed. Refresh and try again."); return; } try { await mutation.mutateAsync({ ...form, organizationName: organizer.organizationName }); setInitialForm(form); setSaveConfirmOpen(false); onClose(); } catch { /* mutation presents the safe error */ } };
  return createPortal(<><div className="account-edit-overlay fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={requestClose}><div role="dialog" aria-modal="true" aria-labelledby="edit-organizer-title" className="account-edit-dialog w-full max-w-5xl rounded-3xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between border-b px-6 py-5 sm:px-9"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Organizer account</p><h2 id="edit-organizer-title" className="text-2xl font-semibold">Edit organizer</h2></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${form.accountStatus === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{form.accountStatus === "active" ? "Active" : "Inactive"}</span><button type="button" onClick={requestClose} aria-label="Close edit organizer dialog" className="grid h-11 w-11 place-items-center rounded-full border"><X className="h-5 w-5" /></button></div></div><form onSubmit={(event) => void submit(event)} className="account-edit-form grid gap-x-5 gap-y-4 overflow-y-auto p-6 sm:grid-cols-3 sm:px-9 sm:py-7"><h3 className="sm:col-span-3 text-base font-semibold">Personal information</h3><label className="text-sm font-medium">First name<input required className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></label><label className="text-sm font-medium">Middle name<input className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.middleName ?? ""} onChange={(event) => update("middleName", event.target.value)} /></label><label className="text-sm font-medium">Last name<input required className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></label><label className="text-sm font-medium sm:col-span-2">Email<input required type="email" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><NameExtensionSelect id="edit-organizer-name-extension" value={form.nameExtension} onChange={(value) => update("nameExtension", value as UpdateOrganizerInput["nameExtension"])} /><h3 className="sm:col-span-3 border-t pt-5 text-base font-semibold">Employment</h3><label className="text-sm font-medium">Employee ID<input readOnly className="mt-1.5 h-11 w-full rounded-lg border bg-muted px-3 text-muted-foreground" value={organizer.employeeNumber} /></label><label className="text-sm font-medium">Position<input required className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.position} onChange={(event) => update("position", event.target.value)} /></label><label className="text-sm font-medium">Department<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.departmentId ?? ""} onChange={(event) => update("departmentId", event.target.value)}><option value="">No linked department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.code}</option>)}</select></label><label className="text-sm font-medium">Employment status<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.employmentStatus} onChange={(event) => update("employmentStatus", event.target.value as UpdateOrganizerInput["employmentStatus"])}><option value="active">Full-Time</option><option value="part_time">Part-Time</option></select></label><h3 className="sm:col-span-3 border-t pt-5 text-base font-semibold">Account</h3><div className="account-edit-actions sm:col-span-3"><label className="text-sm font-medium">Account status<select className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3" value={form.accountStatus} onChange={(event) => update("accountStatus", event.target.value as UpdateOrganizerInput["accountStatus"])}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><button type="button" onClick={() => setResendConfirmOpen(true)} className="rounded-lg border border-border px-4 py-3 text-sm font-semibold hover:bg-muted">Resend invitation</button>{canRevokeSessions ? <button type="button" onClick={() => onRevokeSessions(user.id, user.displayName)} className="rounded-lg border border-red-500/40 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400">Revoke all sessions</button> : null}</div><div className="account-edit-footer sm:col-span-3"><button type="button" onClick={requestClose} className="rounded-lg border px-5 py-3 text-sm font-semibold">Cancel</button><button type="submit" disabled={mutation.isPending} className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{mutation.isPending ? "Saving…" : "Save changes"}</button></div></form></div></div><ConfirmModal open={resendConfirmOpen} title="Resend activation email?" description="This will send an activation email only when the account is still unactivated. No duplicate account will be created." confirmLabel="Resend invitation" onConfirm={() => { setResendConfirmOpen(false); void onResendInvitation(user.id, user.displayName); }} onCancel={() => setResendConfirmOpen(false)} /><ConfirmModal open={confirmOpen} title="Discard organizer changes?" description="Your unsaved organizer profile changes will not be saved." confirmLabel="Discard changes" cancelLabel="Keep editing" tone="danger" onConfirm={() => { setConfirmOpen(false); onClose(); }} onCancel={() => setConfirmOpen(false)} /><ConfirmModal open={saveConfirmOpen} title="Save organizer changes?" description="The organizer profile and account access settings will be updated." confirmLabel="Save changes" confirmDisabled={mutation.isPending} onConfirm={() => void confirmSubmit()} onCancel={() => setSaveConfirmOpen(false)} /></>, document.body);
}

function BulkAddOrganizerModal({ isOpen, onClose, mutation }: { isOpen: boolean; onClose: () => void; mutation: ReturnType<typeof useBulkOrganizerAccountMutation> }) {
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingInputs, setPendingInputs] = useState<CreateOrganizerInput[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setFileError("");
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileError("");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSelectedFile(null);
      setFileError("Please choose a CSV file.");
      return;
    }
    setSelectedFile(file);
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    setFileError("");
    setIsLoading(true);
    Papa.parse<Record<string, string>>(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          if (results.errors.length) throw new Error("The CSV could not be read. Please use the provided template.");
          const required = ["First Name", "Last Name", "College/Department"];
          const missing = required.filter((key) => !results.meta.fields?.includes(key));
          if (missing.length) throw new Error("The CSV headers do not match the provided template.");
          const inputs = results.data.map((row, index) => {
            const missingField = required.find((key) => !row[key]?.trim());
            if (missingField) throw new Error(`Row ${index + 2}: Complete all required fields.`);
            return { firstName: row["First Name"].trim(), middleName: row["Middle Name"]?.trim(), lastName: row["Last Name"].trim(), nameExtension: row["Name Extension"]?.trim() as CreateOrganizerInput["nameExtension"], email: generateAccountEmail(row["Last Name"], row["First Name"], row["Middle Name"], row["Name Extension"]), employeeNumber: "", organizationName: row["College/Department"].trim(), position: "Organizer" };
          });
          if (!inputs.length) throw new Error("The CSV has no organizer records.");
          const duplicateEmail = new Set(inputs.map((input) => input.email.toLowerCase())).size !== inputs.length;
          if (duplicateEmail) throw new Error("The CSV contains duplicate email addresses.");
          setPendingInputs(inputs);
        } catch (error) {
          const message = getErrorMessage(error);
          setFileError(/^(Row \d+: Complete|The CSV |Please choose )/i.test(message) ? message : "The organizer accounts could not be imported. Please check the CSV and try again.");
        } finally {
          setIsLoading(false);
        }
      },
      error: () => {
        setFileError("The CSV could not be read. Please use the provided template.");
        setIsLoading(false);
      }
    });
  };

  const confirmImport = async () => {
    if (!pendingInputs) return;
    setIsLoading(true);
    try {
      const result = await mutation.mutateAsync(pendingInputs);
      if (result.failed > 0) setFileError(`${result.success} organizer account${result.success === 1 ? "" : "s"} added successfully. ${result.failed} failed. Please correct the failed rows and try again.`);
      else { toast.success(`Successfully imported ${result.success} organizer account${result.success === 1 ? "" : "s"}.`); onClose(); }
      setPendingInputs(null);
    } catch (error) { setFileError(getErrorMessage(error)); }
    finally { setIsLoading(false); }
  };

  const downloadTemplate = () => {
    const csv = "First Name,Middle Name,Last Name,Name Extension,College/Department\nJuan,,Dela Cruz,,Student Affairs\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "organizer-accounts-template.csv";
    link.click();
    onClose();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return createPortal(
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-5 sm:px-9">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><UploadCloud className="h-5 w-5" aria-hidden="true" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Organizer accounts</p><h2 className="mt-0.5 text-lg font-semibold text-foreground">Bulk import</h2></div></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border bg-white text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close bulk organizer import modal"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-6 bg-muted/20 p-6">
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600"><p className="mb-3 font-semibold">Instructions:</p><ol className="list-decimal space-y-1 pl-4"><li>Download the template file.</li><li>Fill in organizer details exactly matching the headers.</li><li>Upload the completed CSV file below.</li></ol><button type="button" onClick={downloadTemplate} className="mt-4 flex items-center gap-2 font-medium text-primary hover:underline"><FileDown className="h-4 w-4" />Download Template</button></div>
          {fileError ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fileError}</div> : null}
          <div className="space-y-3">
            {selectedFile ? <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span className="min-w-0 truncate font-medium">{selectedFile.name}</span><button type="button" onClick={removeSelectedFile} disabled={isLoading} className="shrink-0 font-semibold underline disabled:opacity-50">Remove</button></div> : null}
            <div className="flex flex-col items-center gap-2">
              <label className={`flex min-h-12 w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-center transition hover:bg-slate-50 ${isLoading ? "pointer-events-none opacity-50" : ""}`}><UploadCloud className="h-5 w-5 text-slate-400" /><span className="text-xs font-medium text-slate-600">{isLoading ? "Processing..." : selectedFile ? "Choose another CSV" : "Choose CSV file"}</span><input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileSelect} disabled={isLoading} /></label>
              <button type="button" onClick={handleUpload} disabled={!selectedFile || isLoading} className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-lg bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><UploadCloud className="mr-1.5 h-3.5 w-3.5" />{isLoading ? "Uploading..." : "Upload file"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <ConfirmModal open={Boolean(pendingInputs)} title="Import organizer accounts?" description={`${pendingInputs?.length ?? 0} organizer account${pendingInputs?.length === 1 ? "" : "s"} will be created and invitation emails will be sent.`} confirmLabel="Import accounts" confirmDisabled={isLoading || mutation.isPending} onConfirm={() => void confirmImport()} onCancel={() => setPendingInputs(null)} />
    </>,
    document.body
  );
}

function EditStudentModal({
  isOpen,
  onClose,
  mutations,
  programs,
  departments,
  sections,
  student,
  onSuccess,
  fixedDepartmentId
}: {
  isOpen: boolean;
  onClose: () => void;
  mutations: ReturnType<typeof useStudentMutations>;
  programs: { id: string; code: string; departmentId: string }[];
  departments: { id: string; code: string }[];
  sections: Section[];
  student: Student | undefined;
  onSuccess: (action: string, targetType: string, metadata: Record<string, unknown>) => void;
  fixedDepartmentId?: string;
}) {
  const [formData, setFormData] = useState<UpdateStudentInput>({
    id: "",
    profileId: "",
    email: "",
    firstName: "",
    middleName: "",
    lastName: "",
    nameExtension: undefined,
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
        nameExtension: student.nameExtension as UpdateStudentInput["nameExtension"],
        programId: student.programId || "",
        departmentId: fixedDepartmentId ?? student.departmentId ?? "",
        sectionId: sections.find((section) => section.programId === student.programId && section.yearLevel === (student.yearLevel || 1) && section.name === student.section)?.id || student.section || "",
        yearLevel: student.yearLevel || 1,
        accountStatus: student.accountStatus ?? "active"
      });
    }
  }, [fixedDepartmentId, sections, student]);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);

  if (!isOpen) return null;

  const originalSectionId = sections.find((section) => section.programId === student?.programId && section.yearLevel === (student?.yearLevel || 1) && section.name === student?.section)?.id || student?.section || "";
  const isDirty = Boolean(student && (
    formData.email !== (student.email || "") || formData.firstName !== (student.firstName || "") ||
    formData.middleName !== (student.middleName || "") || formData.lastName !== (student.lastName || "") ||
    formData.nameExtension !== student.nameExtension || formData.programId !== (student.programId || "") ||
    formData.departmentId !== (student.departmentId || "") || formData.sectionId !== originalSectionId ||
    formData.yearLevel !== (student.yearLevel || 1) || formData.accountStatus !== (student.accountStatus ?? "active")
  ));
  const requestClose = () => {
    if (isLoading) return;
    if (isDirty) setIsDiscardConfirmOpen(true);
    else onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitConfirmOpen(true);
  };

  const confirmSubmit = async () => {
    setIsSubmitConfirmOpen(false);
    if (!student || formData.id !== student.id || formData.profileId !== student.userId) {
      toast.error("This student record changed. Refresh and try again.");
      return;
    }
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
    <>
    <div className="account-edit-overlay fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6" onClick={requestClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="edit-student-title" className="account-edit-dialog w-full max-w-5xl overflow-hidden rounded-3xl border bg-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-5 sm:px-9">
          <div className="flex items-center gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Student account</p><h2 id="edit-student-title" className="mt-0.5 text-2xl font-semibold text-foreground">Edit student</h2></div>
          </div>
          <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${formData.accountStatus === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{formData.accountStatus === "active" ? "Active" : "Inactive"}</span><button type="button" onClick={requestClose} className="grid h-11 w-11 place-items-center rounded-full border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close edit student modal">
            <X className="h-5 w-5" />
          </button></div>
        </div>
        <form onSubmit={handleSubmit} className="account-edit-student-form space-y-4 overflow-y-auto bg-surface p-6 sm:p-9">
          <h3 className="border-b pb-3 text-base font-semibold">Personal information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">First name</label>
              <input required type="text" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: capitalizePersonName(e.target.value) })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Last name</label>
              <input required type="text" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: capitalizePersonName(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Middle name (optional)</label>
            <input type="text" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.middleName} onChange={(e) => setFormData({ ...formData, middleName: capitalizePersonName(e.target.value) })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="edit-student-name-extension">Extension name (optional)</label>
            <select id="edit-student-name-extension" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.nameExtension ?? ""} onChange={(e) => setFormData({ ...formData, nameExtension: (e.target.value || undefined) as UpdateStudentInput["nameExtension"] })}>
              <option value="">No extension</option>
              {studentNameExtensions.map((extension) => <option key={extension} value={extension}>{extension}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
            <input required type="email" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <h3 className="border-b pb-3 pt-2 text-base font-semibold">Academic information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Department</label>
              {fixedDepartmentId ? <input readOnly aria-readonly="true" className="h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground" value={departments.find((department) => department.id === fixedDepartmentId)?.code ?? "Your department"} /> : <select required className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.departmentId} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value, programId: "", sectionId: "" })}>
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.code}</option>
                ))}
              </select>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Program</label>
              <select required className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.programId} onChange={(e) => setFormData({ ...formData, programId: e.target.value, sectionId: "" })}>
                <option value="">Select Program</option>
                {programs.filter(p => !formData.departmentId || p.departmentId === formData.departmentId).map((p) => (
                  <option key={p.id} value={p.id}>{p.code}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Year level</label>
              <select required id="edit-student-year-level" className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.yearLevel} onChange={(e) => setFormData({ ...formData, yearLevel: Number(e.target.value), sectionId: "" })}>
                {[1, 2, 3, 4, 5].map((yearLevel) => <option key={yearLevel} value={yearLevel}>{yearLevel}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Section</label>
              <select required id="edit-student-section" disabled={!formData.programId || sections.filter((section) => section.isActive && section.programId === formData.programId && section.yearLevel === formData.yearLevel).length === 0} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" value={formData.sectionId} onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}>
                <option value="">{!formData.programId ? "Select a program first" : sections.filter((section) => section.isActive && section.programId === formData.programId && section.yearLevel === formData.yearLevel).length ? "Select Section" : "No sections available"}</option>
                {sections.filter((section) => section.isActive && section.programId === formData.programId && section.yearLevel === formData.yearLevel).map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
              </select>
            </div>
          </div>
          <h3 className="border-b pb-3 pt-2 text-base font-semibold">Account</h3>
          <label className="block text-sm font-medium text-foreground">Account status<select className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" value={formData.accountStatus} onChange={(event) => setFormData({ ...formData, accountStatus: event.target.value as UpdateStudentInput["accountStatus"] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <div className="account-edit-footer">
            <button type="button" onClick={requestClose} className="rounded-lg border px-5 py-3 text-sm font-semibold hover:bg-muted">Cancel</button>
            <button type="submit" disabled={isLoading} className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
    <ConfirmModal open={isDiscardConfirmOpen} title="Discard student changes?" description="Your unsaved student profile changes will not be saved." confirmLabel="Discard changes" cancelLabel="Keep editing" tone="danger" onConfirm={() => { setIsDiscardConfirmOpen(false); onClose(); }} onCancel={() => setIsDiscardConfirmOpen(false)} />
    <ConfirmModal open={isSubmitConfirmOpen} title="Save student changes?" description="The updated student profile and account status will be saved." confirmLabel="Save changes" confirmDisabled={isLoading} onConfirm={() => void confirmSubmit()} onCancel={() => setIsSubmitConfirmOpen(false)} />
    </>,
    document.body
  );
}

function BulkAddStudentModal({
  isOpen,
  onClose,
  mutations,
  programs,
  departments,
  fixedDepartmentId
}: {
  isOpen: boolean;
  onClose: () => void;
  mutations: ReturnType<typeof useStudentMutations>;
  programs: { id: string; code: string; departmentId: string }[];
  departments: { id: string; code: string }[];
  fixedDepartmentId?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingInputs, setPendingInputs] = useState<CreateStudentInput[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setFileError("");
      setIsLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError("");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSelectedFile(null);
      setFileError("Please choose a CSV file.");
      return;
    }
    setSelectedFile(file);
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setFileError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileUpload = () => {
    if (!selectedFile) return;
    setIsLoading(true);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: Papa.ParseResult<Record<string, string>>) => {
        try {
          if (results.errors.length) throw new Error("The CSV could not be read. Please use the provided template.");
          const parsedData = results.data as Record<string, string>[];
          if (!parsedData.length) throw new Error("The CSV has no student records.");
          const inputs: CreateStudentInput[] = parsedData.map((row, index) => {
            const dept = fixedDepartmentId
              ? departments.find((department) => department.id === fixedDepartmentId)
              : departments.find(d => d.code === row["Department Code"]);
            const prog = programs.find(p => p.code === row["Program Code"]);
            if (!dept || !prog) {
              throw new Error(`Row ${index + 2}: Check the Program Code and Department Code.`);
            }
            if (prog.departmentId !== dept.id || (fixedDepartmentId && row["Department Code"] && row["Department Code"].trim().toLowerCase() !== dept.code.toLowerCase())) {
              throw new Error(`Row ${index + 2}: The student must belong to your department and use one of its programs.`);
            }
            return {
              studentNumber: formatStudentNumber(row["Student Number"] ?? ""),
              email: generateAccountEmail(row["Last Name"], row["First Name"], row["Middle Name"], row["Name Extension"]),
              nameExtension: row["Name Extension"]?.trim() as CreateStudentInput["nameExtension"],
              firstName: row["First Name"],
              middleName: row["Middle Name"],
              lastName: row["Last Name"],
              programId: prog.id,
              departmentId: fixedDepartmentId ?? dept.id,
              sectionId: row["Section Name"],
              yearLevel: parseInt(row["Year Level"], 10) || 1
            };
          });

          setPendingInputs(inputs);
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          const isUserFriendlyMessage = /^(Row \d+: (Check the Program Code and Department Code\.|The student must belong to your department)|The CSV |Please choose )/i.test(errorMessage);
          setFileError(isUserFriendlyMessage ? errorMessage : conciseImportError(errorMessage));
        } finally {
          setIsLoading(false);
        }
      },
      error: () => {
        setFileError("The CSV could not be read. Please use the provided template.");
        setIsLoading(false);
      }
    });
  };

  const confirmImport = async () => {
    if (!pendingInputs) return;
    setIsLoading(true);
    try {
      const result = await mutations.bulkCreateStudentsMutation.mutateAsync(pendingInputs);
      if (result.failed > 0) {
        const errorDetails = result.errors.slice(0, 3).map((item) => `${item.row ? `Row ${item.row}: ` : ""}${conciseImportError(item.error, item.studentNumber)}`).join(" ");
        setFileError(`${result.success} student account${result.success === 1 ? "" : "s"} added successfully. ${result.failed} failed.${errorDetails ? ` ${errorDetails}` : ""}`);
        toast.warning(`${result.success} added successfully; ${result.failed} failed.`);
      } else { toast.success(`Successfully imported ${result.success} student account${result.success === 1 ? "" : "s"}.`); onClose(); }
      setPendingInputs(null);
    } catch (error) { setFileError(conciseImportError(getErrorMessage(error))); }
    finally { setIsLoading(false); }
  };

  const conciseImportError = (error: string, studentNumber?: string) => {
    if (/student id|student_id|duplicate key/i.test(error)) {
      return studentNumber ? `Student ID "${studentNumber}" already exists.` : "Student ID already exists.";
    }
    if (/email.*already|already.*email/i.test(error)) return "Email address is already registered.";
    if (/section.*(duplicate|already exists)/i.test(error)) return "Section already exists.";
    return "This row could not be imported.";
  };

  return createPortal(
    <>
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

        <div className="space-y-3">
          {selectedFile ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="min-w-0 truncate font-medium">{selectedFile.name}</span>
              <button type="button" onClick={removeSelectedFile} disabled={isLoading} className="shrink-0 font-semibold underline disabled:opacity-50">Remove</button>
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-2">
            <label className={`flex min-h-12 w-full max-w-xs cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-center transition hover:bg-slate-50 ${isLoading ? "pointer-events-none opacity-50" : ""}`}>
              <UploadCloud className="h-5 w-5 text-slate-400" />
              <span className="text-xs font-medium text-slate-600">{isLoading ? "Processing..." : selectedFile ? "Choose another CSV" : "Choose CSV file"}</span>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileSelect} disabled={isLoading} />
            </label>
            <button type="button" onClick={handleFileUpload} disabled={!selectedFile || isLoading} className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-lg bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
              <UploadCloud className="mr-1.5 h-3.5 w-3.5" />{isLoading ? "Uploading..." : "Upload file"}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
    <ConfirmModal open={Boolean(pendingInputs)} title="Import student accounts?" description={`${pendingInputs?.length ?? 0} student account${pendingInputs?.length === 1 ? "" : "s"} will be created and invitation emails will be sent.`} confirmLabel="Import accounts" confirmDisabled={isLoading || mutations.bulkCreateStudentsMutation.isPending} onConfirm={() => void confirmImport()} onCancel={() => setPendingInputs(null)} />
    </>,
    document.body
  );
}

export function OrganizerUserManagementPage() {
  const scope = useOrganizerScope();
  const { session } = useDevelopmentSession();
  const isDepartmentAdmin = session?.role === "department_admin";
  const studentsQuery = useStudents({ pageSize: 100 }, scope.context, true);
  const academicCatalog = useAcademicCatalog({ pageSize: 100 }, scope.context, true);
  const departmentStudentIds = useMemo(
    () => isDepartmentAdmin
      ? (studentsQuery.data?.items ?? [])
          .filter((student) => student.departmentId === session?.departmentId)
          .map((student) => student.id)
      : undefined,
    [isDepartmentAdmin, session?.departmentId, studentsQuery.data?.items]
  );
  const attendanceRecordsQuery = useAttendanceRecords({ pageSize: 100 }, scope.context);
  const attendanceSessionsQuery = useAttendanceSessions({ pageSize: 500 }, scope.context);
  const credentialStatusesQuery = useStudentCredentialStatuses(scope.context, departmentStudentIds);
  const auditLogMutations = useAuditLogMutations(scope.context);
  const studentMutations = useStudentMutations(scope.context);
  const organizerMutation = useOrganizerAccountMutation(scope.context);
  const updateOrganizerMutation = useUpdateOrganizerAccountMutation(scope.context);
  const bulkOrganizerMutation = useBulkOrganizerAccountMutation(scope.context);
  const adminMutation = useAdminAccountMutation(scope.context);
  const updateAdminMutation = useUpdateAdminAccountMutation(scope.context);
  const organizersQuery = useOrganizerProfiles({ pageSize: 100 }, scope.context);
  const usersQuery = useUsers({ pageSize: 100 }, scope.context);
  const adminProfilesQuery = useAdminProfiles({ pageSize: 100 }, scope.context, !isDepartmentAdmin);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [programFilter, setProgramFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<"students" | "organizers" | "admins">(() => {
    const requestedTab = searchParams.get("tab");
    return requestedTab === "organizers" || (!isDepartmentAdmin && requestedTab === "admins") ? requestedTab : "students";
  });
  const [isAddOrganizerModalOpen, setIsAddOrganizerModalOpen] = useState(false);
  const [isBulkOrganizerModalOpen, setIsBulkOrganizerModalOpen] = useState(false);
  const [isAddAdminModalOpen, setIsAddAdminModalOpen] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [isEditAdminModalOpen, setIsEditAdminModalOpen] = useState(false);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string | null>(null);
  const [isEditOrganizerModalOpen, setIsEditOrganizerModalOpen] = useState(false);
  const [sessionRevocationTarget, setSessionRevocationTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const [resendingInvitationUserId, setResendingInvitationUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isDepartmentAdmin && activeTab === "admins") setActiveTab("students");
  }, [isDepartmentAdmin, activeTab]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "students" || requestedTab === "organizers" || (!isDepartmentAdmin && requestedTab === "admins")) {
      setActiveTab(requestedTab);
    }
  }, [isDepartmentAdmin, searchParams]);

  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const departmentOrganizers = useMemo(
    () => (isDepartmentAdmin && session?.departmentId
      ? (organizersQuery.data?.items ?? []).filter((organizer) => organizer.departmentId === session.departmentId)
      : isDepartmentAdmin ? [] : (organizersQuery.data?.items ?? [])),
    [isDepartmentAdmin, organizersQuery.data?.items, session?.departmentId]
  );
  const selectedOrganizer = departmentOrganizers.find((organizer) => organizer.id === selectedOrganizerId);
  const selectedOrganizerUser = usersQuery.data?.items.find((user) => user.id === selectedOrganizer?.userId);
  const selectedAdmin = adminProfilesQuery.data?.items.find((admin) => admin.id === selectedAdminId);
  const selectedAdminUser = usersQuery.data?.items.find((user) => user.id === selectedAdmin?.userId);
  const canCreateOrganizer = session ? hasCapability(session.role, isDepartmentAdmin ? "users.create.organizer.department" : "users.create.organizer") : false;
  const canCreateStudent = session ? hasCapability(session.role, isDepartmentAdmin ? "users.create.student.department" : "users.create.student") : false;
  const canUpdateStudent = session ? hasCapability(session.role, isDepartmentAdmin ? "users.update.student.department" : "users.update.student") : false;
  const canCreateAdmin = session ? hasCapability(session.role, "users.create.admin") : false;
  const canManageStudentStatus = session ? hasCapability(session.role, isDepartmentAdmin ? "users.status.manage.student.department" : "users.status.manage.student") : false;
  const canRevokeSessions = session ? hasCapability(session.role, isDepartmentAdmin ? "users.sessions.revoke.department" : "users.sessions.revoke") : false;
  const canRevokeStudentSessions = session ? hasCapability(session.role, isDepartmentAdmin ? "users.sessions.revoke.student.department" : "users.sessions.revoke.student") : false;
  const canResendInvitations = session ? hasCapability(session.role, isDepartmentAdmin ? "users.invitation.resend.department" : "users.invitation.resend") : false;

  const requestSessionRevocation = (userId: string, displayName: string) => {
    if (!canRevokeSessions || userId === session?.userId) return;
    setSessionRevocationTarget({ userId, displayName });
  };

  const revokeSessions = async (reason: string) => {
    const target = sessionRevocationTarget;
    if (!target) return;
    const result = await repositories.userManagement.revokeUserSessions({ userId: target.userId, reason }, scope.context);
    toast.success(`${result.revokedSessionCount} session${result.revokedSessionCount === 1 ? "" : "s"} revoked for ${target.displayName}.`);
  };

  const resendInvitation = async (userId: string, displayName: string) => {
    if (!canResendInvitations || resendingInvitationUserId) return;
    setResendingInvitationUserId(userId);
    try {
      await repositories.userManagement.resendUserInvitation({ userId }, scope.context);
      toast.success(`Activation email sent to ${displayName}.`);
    } catch (caught) {
      toast.error(getErrorMessage(caught));
      throw caught;
    } finally {
      setResendingInvitationUserId(null);
    }
  };

  const studentAccounts = useMemo<StudentAccount[]>(() => {
    const rawStudents = (studentsQuery.data?.items ?? []).filter((student) => !isDepartmentAdmin || student.departmentId === session?.departmentId);
    const programsMap = new Map((academicCatalog.programs.data?.items ?? []).map((p) => [p.id, p.code]));
    const credentialMap = new Map((credentialStatusesQuery.data ?? []).map((status) => [status.studentId, status]));

    const dbAccounts = rawStudents.map((student) => {
      const studentRecords = (attendanceRecordsQuery.data?.items ?? []).filter((r) => r.studentId === student.id);
      const attendedCount = studentRecords.filter((r) => r.status === "present" || r.status === "late").length;
      const rate = studentRecords.length > 0 ? Math.round((attendedCount / studentRecords.length) * 100) : null;

      const programCode = student.programCode || programsMap.get(student.programId) || "BSIT";
      const credentials = credentialMap.get(student.id);
      const qrCredential = credentials?.qrCredential;
      const facialProfile = credentials?.facialProfile;
      return {
        id: student.id,
        userId: student.userId,
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
        qrStatus: getQrCredentialDisplayStatus(qrCredential),
        facialStatus: getFacialCredentialDisplayStatus(facialProfile)
      };
    });

    return dbAccounts;
  }, [isDepartmentAdmin, session?.departmentId, studentsQuery.data?.items, academicCatalog.programs.data?.items, attendanceRecordsQuery.data?.items, credentialStatusesQuery.data]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentAccounts[0]?.id ?? "");
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [statusUpdatingStudentId, setStatusUpdatingStudentId] = useState<string | null>(null);
  const [pendingStudentStatus, setPendingStudentStatus] = useState<{ studentId: string; nextStatus: "active" | "inactive"; name: string } | null>(null);

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

  function toggleStudentAccountStatus(studentId: string, nextStatus: "active" | "inactive") {
    const student = studentsQuery.data?.items?.find((item) => item.id === studentId);
    if (!student) {
      toast.error("Student information is no longer available. Refresh the page and try again.");
      return;
    }

    setPendingStudentStatus({ studentId, nextStatus, name: student.formattedName || student.fullName || student.studentNumber });
  }

  async function confirmStudentAccountStatus() {
    if (!pendingStudentStatus) return;
    const { studentId, nextStatus } = pendingStudentStatus;
    const student = studentsQuery.data?.items?.find((item) => item.id === studentId);
    if (!student) {
      setPendingStudentStatus(null);
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
      setPendingStudentStatus(null);
    }
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
    ],
    []
  );

  if (isDepartmentAdmin && !session?.departmentId) {
    return <div className="space-y-4"><PageHeader title="User Management" description="Department scope is required to manage department accounts." /><div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">No department is assigned to this account. No student or organizer records are shown, and management actions are unavailable. Contact a University Admin to correct the account’s department assignment.</div></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" description="Manage student accounts and track participation." />

      {activeTab === "students" ? <>
      <section aria-label="Student account summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Student Accounts" value={studentAccounts.length.toString()} detail="Accounts in scope" icon={Users} />
        <MetricCard
          title="Active Accounts"
          value={studentAccounts.filter((student) => student.status === "Active").length.toString()}
          detail={`${studentAccounts.filter((student) => student.status === "Deactivated").length} deactivated`}
          icon={UserRoundCheck}
        />
        <MetricCard title="Avg. Attendance Rate" value={`${averageAttendance}%`} detail="Average rate" icon={BadgeCheck} />
      </section>
      <AccountDirectoryTabs activeTab={activeTab} onChange={setActiveTab} showAdmins={!isDepartmentAdmin} />
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
              disabled={!canCreateStudent}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary bg-primary px-3 text-xs font-semibold text-white transition hover:border-primary/90 hover:bg-primary/90"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Student
            </button>
            {canCreateStudent ? <button
              type="button"
              onClick={() => setIsBulkAddModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              Bulk Add
            </button> : null}
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
        <section aria-label="Organizer account summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard title="Organizer Accounts" value={`${departmentOrganizers.length}`} detail={isDepartmentAdmin ? "In your department" : "Accounts in scope"} icon={Users} />
          <MetricCard title="Active Organizers" value={`${departmentOrganizers.filter((organizer) => organizer.employmentStatus === "active" && usersQuery.data?.items.find((user) => user.id === organizer.userId)?.isActive !== false).length}`} detail={`${Math.max(0, departmentOrganizers.length - departmentOrganizers.filter((organizer) => organizer.employmentStatus === "active" && usersQuery.data?.items.find((user) => user.id === organizer.userId)?.isActive !== false).length)} deactivated`} icon={UserRoundCheck} />
          <MetricCard title="Events Managed" value={`${eventsQuery.data?.items.length ?? 0}`} detail={isDepartmentAdmin ? "Across department organizers" : "Across all organizers"} icon={CalendarCheck} />
        </section>
        <AccountDirectoryTabs activeTab={activeTab} onChange={setActiveTab} showAdmins={!isDepartmentAdmin} />
        <div className="organizer-directory-page">
          <OrganizerDirectoryConsistent organizers={departmentOrganizers} users={usersQuery.data?.items ?? []} events={eventsQuery.data?.items ?? []} attendanceRecords={attendanceRecordsQuery.data?.items ?? []} attendanceSessions={attendanceSessionsQuery.data?.items ?? []} activeSemester={academicCatalog.semesters.data?.items.find((semester) => semester.isActive)} departments={academicCatalog.departments.data?.items ?? []} onAdd={() => setIsAddOrganizerModalOpen(true)} onBulkAdd={() => setIsBulkOrganizerModalOpen(true)} onEdit={(organizerId) => { setSelectedOrganizerId(organizerId); setIsEditOrganizerModalOpen(true); }} canAdd={canCreateOrganizer} onExportAction={(action, targetType, metadata) => { void auditLogMutations.logExportActionMutation.mutateAsync({ action, targetType, metadata }); }} />
        </div>
      </> : <>
        <AccountDirectoryTabs activeTab={activeTab} onChange={setActiveTab} />
        <AdminDirectory users={usersQuery.data?.items ?? []} adminProfiles={adminProfilesQuery.data?.items ?? []} departments={academicCatalog.departments.data?.items ?? []} onAdd={() => setIsAddAdminModalOpen(true)} onEdit={(adminId) => { setSelectedAdminId(adminId); setIsEditAdminModalOpen(true); }} canAdd={canCreateAdmin} />
      </>}

      {activeTab === "students" ? <>
      <StudentDetailModal
        student={isStudentModalOpen ? selectedStudent : undefined}
        onClose={() => setIsStudentModalOpen(false)}
        onToggleAccountStatus={canManageStudentStatus ? toggleStudentAccountStatus : undefined}
        onRevokeSessions={canRevokeStudentSessions ? requestSessionRevocation : undefined}
        isStatusUpdating={statusUpdatingStudentId === selectedStudent?.id}
        onEdit={canUpdateStudent ? (id) => {
          setSelectedStudentId(id);
          setIsEditModalOpen(true);
        } : undefined}
      />
      <ReportExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        filteredStudents={filteredStudents}
        onExportAction={(action, targetType, metadata) => {
          void auditLogMutations.logExportActionMutation.mutateAsync({
            action,
            targetType,
            metadata
          });
        }}
      />
      {canCreateStudent ? <AddStudentModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        mutations={studentMutations}
        programs={academicCatalog.programs.data?.items ?? []}
        departments={academicCatalog.departments.data?.items ?? []}
        sections={academicCatalog.sections.data?.items ?? []}
        fixedDepartmentId={isDepartmentAdmin ? session?.departmentId : undefined}
      /> : null}
      {canCreateStudent ? <BulkAddStudentModal
        isOpen={isBulkAddModalOpen}
        onClose={() => setIsBulkAddModalOpen(false)}
        mutations={studentMutations}
        programs={academicCatalog.programs.data?.items ?? []}
        departments={academicCatalog.departments.data?.items ?? []}
        fixedDepartmentId={isDepartmentAdmin ? session?.departmentId : undefined}
      /> : null}
      {canUpdateStudent ? <EditStudentModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        mutations={studentMutations}
        programs={academicCatalog.programs.data?.items ?? []}
        departments={academicCatalog.departments.data?.items ?? []}
        sections={academicCatalog.sections.data?.items ?? []}
        fixedDepartmentId={isDepartmentAdmin ? session?.departmentId : undefined}
        student={rawStudent}
        onSuccess={(action, targetType, metadata) => {
          void auditLogMutations.logActionMutation.mutateAsync({
            action,
            targetType,
            metadata
          });
        }}
      /> : null}
      </> : null}
      {canCreateOrganizer ? <AddOrganizerModal isOpen={isAddOrganizerModalOpen} onClose={() => setIsAddOrganizerModalOpen(false)} mutation={organizerMutation} departments={academicCatalog.departments.data?.items ?? []} generatedEmployeeId={nextEmployeeId(departmentOrganizers, "O")} fixedDepartmentId={isDepartmentAdmin ? session?.departmentId : undefined} /> : null}
      <EditOrganizerModal isOpen={isEditOrganizerModalOpen} onClose={() => setIsEditOrganizerModalOpen(false)} organizer={selectedOrganizer} user={selectedOrganizerUser} departments={academicCatalog.departments.data?.items ?? []} mutation={updateOrganizerMutation} canRevokeSessions={canRevokeSessions && selectedOrganizerUser?.id !== session?.userId} onRevokeSessions={requestSessionRevocation} onResendInvitation={resendInvitation} fixedDepartmentId={isDepartmentAdmin ? session?.departmentId : undefined} />
      {canCreateOrganizer ? <BulkAddOrganizerModal isOpen={isBulkOrganizerModalOpen} onClose={() => setIsBulkOrganizerModalOpen(false)} mutation={bulkOrganizerMutation} /> : null}
      {canCreateAdmin ? <AddAdminModalAutomatic isOpen={isAddAdminModalOpen} onClose={() => setIsAddAdminModalOpen(false)} mutation={adminMutation} departments={academicCatalog.departments.data?.items ?? []} generatedEmployeeId={nextEmployeeId(adminProfilesQuery.data?.items ?? [], "A")} /> : null}
      <EditAdminModal isOpen={isEditAdminModalOpen} onClose={() => setIsEditAdminModalOpen(false)} admin={selectedAdmin} user={selectedAdminUser} departments={academicCatalog.departments.data?.items ?? []} mutation={updateAdminMutation} canRevokeSessions={canRevokeSessions && selectedAdminUser?.id !== session?.userId} onRevokeSessions={requestSessionRevocation} onResendInvitation={resendInvitation} />
      <RevokeUserSessionsDialog target={sessionRevocationTarget} onClose={() => setSessionRevocationTarget(null)} onConfirm={revokeSessions} />
      <ConfirmModal
        open={Boolean(pendingStudentStatus)}
        title={pendingStudentStatus?.nextStatus === "active" ? "Reactivate student account?" : "Deactivate student account?"}
        description={pendingStudentStatus ? `${pendingStudentStatus.name} will be ${pendingStudentStatus.nextStatus === "active" ? "able to sign in again" : "unable to sign in"}. Existing credentials and attendance history will be preserved.` : undefined}
        confirmLabel={pendingStudentStatus?.nextStatus === "active" ? "Reactivate account" : "Deactivate account"}
        tone={pendingStudentStatus?.nextStatus === "active" ? "default" : "danger"}
        confirmDisabled={Boolean(statusUpdatingStudentId)}
        onCancel={() => setPendingStudentStatus(null)}
        onConfirm={() => void confirmStudentAccountStatus()}
      />
    </div>
  );
}
