/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useMemo, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AlertCircle, Camera, CheckCircle2, ChevronDown, Download, FileSpreadsheet, FileText, Filter, QrCode, ScanLine, Search, UserCheck, UserRound, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { Button } from "@/components/ui/button";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { PageHeader } from "@/components/shared/PageHeader";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useOrganizerProfiles, useStudentCredentialMutations, useStudentCredentialStatuses, useStudents, useAuditLogMutations } from "@/hooks/useRepositoryQueries";
import { useQrCredentialDataUrl } from "@/hooks/useQrCredentialDataUrl";
import type { ExportQrCredentialRow, ExportFacialProfileRow } from "@/features/organizer/utils/exportUtils";
import { getFacialCredentialDisplayStatus, getQrCredentialDisplayStatus, type CredentialDisplayStatus, type FacialCredentialDisplayStatus } from "@/lib/credentials/status";
import { formatDateTime } from "@/lib/utils/date";

type FacialStatus = FacialCredentialDisplayStatus;
type QRStatus = "Active" | "Deactivated";
type AuthenticationStatusFilter = "All" | "Active" | "Pending" | "Deactivated";
type ActiveTab = "facial" | "qr";

type QrRow = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  credentialId: string;
  status: QRStatus;
  dateGenerated: string;
  lastUsed: string;
};

function OrganizerQrPreview({ student }: { student?: QrRow | null }) {
  const value = student?.credentialId ? student.studentNumber : "";
  const qrDataUrl = useQrCredentialDataUrl(student?.status === "Active", value);

  return (
    <div className="rounded-md border border-dashed border-border bg-background p-3">
      <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-lg bg-primary/10 p-3 text-primary">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`PLPass QR credential for ${student?.studentName ?? "student"}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <QrCode className="h-12 w-12" aria-hidden="true" />
        )}
      </div>
      <div className="mt-3 space-y-1 text-center">
        <p className="font-semibold text-foreground">{student?.studentName}</p>
        <p>QR status: {student?.status || "Active"}</p>
        <p>Issued: {student?.dateGenerated || new Date().toISOString().slice(0, 10)}</p>
      </div>
    </div>
  );
}

function CredentialMetric({ label, value, icon, accent = "default" }: { label: string; value: number; icon: ReactNode; accent?: "default" | "success" | "warning" | "danger" }) {
  const accentClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700"
  }[accent];

  return (
    <article className="group relative overflow-hidden rounded-xl border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/35" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        </div>
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${accentClass}`}>{icon}</span>
      </div>
    </article>
  );
}

type FacialRow = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  enrollmentDate: string;
  status: FacialStatus;
  lastScan: string;
};

function useOrganizerScope() {
  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  return {
    context,
    organizerProfile: organizerQuery.data?.items[0]
  };
}

function facialTone(status: FacialStatus) {
  return status === "Active" ? "success" as const : "danger" as const;
}

function qrTone(status: QRStatus) {
  return status === "Active" ? "success" as const : "danger" as const;
}

function FacialActionsRenderer({
  data,
  onViewFacial,
  onToggleFacialStatus
}: {
  data: FacialRow;
  onViewFacial: (studentName: string) => void;
  onToggleFacialStatus: (studentName: string, currentStatus: FacialStatus) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.right - 192
      });
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (buttonRef.current && buttonRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    }
    function handleScrollOrResize() {
      if (isOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + 4,
          left: rect.right - 192
        });
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen]);

  if (!data) return null;

  const isFacialActive = data.status === "Active";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 border-border bg-background shadow-xs"
        onClick={() => onViewFacial(data.studentName)}
      >
        <UserRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        View
      </Button>

      <Button
        ref={buttonRef}
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 shadow-xs"
        onClick={toggleMenu}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        Manage
        <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
      </Button>

      {isOpen && menuPos && createPortal(
        <div
          role="menu"
          style={{
            position: "fixed",
            top: `${menuPos.top}px`,
            left: `${menuPos.left}px`,
            zIndex: 99999
          }}
          className="w-48 rounded-md border border-border bg-popover p-1 shadow-lg animate-in fade-in-50 zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onToggleFacialStatus(data.studentName, data.status);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs font-medium text-popover-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {isFacialActive ? (
              <>
                <X className="h-3.5 w-3.5 text-destructive" />
                Deactivate Facial
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Activate Facial
              </>
            )}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

function ReportExportModal({
  isOpen,
  onClose,
  qrRows,
  facialRows,
  activeTab,
  activeSearch,
  activeStatusFilter,
  onExportAction
}: {
  isOpen: boolean;
  onClose: () => void;
  qrRows: QrRow[];
  facialRows: FacialRow[];
  activeTab: ActiveTab;
  activeSearch: string;
  activeStatusFilter: AuthenticationStatusFilter;
  onExportAction: (action: string, targetType: string, metadata: Record<string, unknown>) => void;
}) {
  const [reportType, setReportType] = useState<"qr" | "facial">(activeTab === "facial" ? "facial" : "qr");
  const [statusFilter, setStatusFilter] = useState(activeStatusFilter === "All" ? "all" : activeStatusFilter);
  const [exportSearch, setExportSearch] = useState(activeSearch);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [isExportLoading, setIsExportLoading] = useState(false);

  if (!isOpen) return null;

  const filteredQr = qrRows.filter((r) => (!exportSearch.trim() || `${r.studentName} ${r.studentId}`.toLowerCase().includes(exportSearch.trim().toLowerCase())) && (statusFilter === "all" || r.status === statusFilter));
  const filteredFacial = facialRows.filter((r) => (!exportSearch.trim() || `${r.studentName} ${r.studentId}`.toLowerCase().includes(exportSearch.trim().toLowerCase())) && (statusFilter === "all" || r.status === statusFilter));
  const count = reportType === "qr" ? filteredQr.length : filteredFacial.length;

  function handleResetFilters() {
    setStatusFilter("all");
    setExportSearch("");
  }

  async function handleExport() {
    if (count === 0) {
      toast.warning("No records match the selected export criteria.");
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

    if (reportType === "qr") {
      const data: ExportQrCredentialRow[] = filteredQr.map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        status: r.status,
        dateGenerated: r.dateGenerated,
        lastUsed: r.lastUsed
      }));
      if (exportFormat === "xlsx") {
        await exportTools.exportQrCredentialsXlsx(data);
        toast.success(`Exported ${data.length} QR credential record(s) as XLSX.`);
      } else {
        await exportTools.exportQrCredentialsPdf(data);
        toast.success(`Exported ${data.length} QR credential record(s) as PDF.`);
      }
    } else {
      const data: ExportFacialProfileRow[] = filteredFacial.map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        status: r.status,
        enrollmentDate: r.enrollmentDate,
        lastScan: r.lastScan
      }));
      if (exportFormat === "xlsx") {
        await exportTools.exportFacialProfilesXlsx(data);
        toast.success(`Exported ${data.length} facial enrollment record(s) as XLSX.`);
      } else {
        await exportTools.exportFacialProfilesPdf(data);
        toast.success(`Exported ${data.length} facial enrollment record(s) as PDF.`);
      }
    }

    onExportAction(
      reportType === "qr" ? "Exported QR Credentials" : "Exported Facial Profiles",
      "export_action",
      {
        reportType,
        format: exportFormat,
        recordCount: count,
        filters: {
          status: statusFilter
        }
      }
    );

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
                Export Authentication Report
              </h2>
              <p className="text-xs text-slate-500 font-medium">Select method type, status filter, and download format.</p>
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
          {/* Step 1: Report Content Cards */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
              1. Authentication Method
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReportType("qr")}
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  reportType === "qr"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${reportType === "qr" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <QrCode className="h-4 w-4" />
                  </div>
                  {reportType === "qr" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">QR Credentials</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">Student QR status, generation dates & usage history.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportType("facial")}
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  reportType === "facial"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${reportType === "facial" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <Camera className="h-4 w-4" />
                  </div>
                  {reportType === "facial" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Facial Recognition</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">Enrollment status, last scan dates & issues.</p>
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

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Search students</label>
              <input value={exportSearch} onChange={(e) => setExportSearch(e.target.value)} placeholder="Name or student ID" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
              >
                <option value="all">All statuses</option>
                <option value="Active">Active</option>
                <option value="Deactivated">Deactivated</option>
              </select>
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
              {count} records selected
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
              disabled={count === 0 || isExportLoading}
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

export function AuthenticationMethodsPage() {
  const scope = useOrganizerScope();
  const studentsQuery = useStudents({ pageSize: 100 }, scope.context);
  const credentialStatusesQuery = useStudentCredentialStatuses(scope.context);
  const credentialMutations = useStudentCredentialMutations(scope.context);
  const auditLogMutations = useAuditLogMutations(scope.context);

  const rawStudents = useMemo(() => studentsQuery.data?.items ?? [], [studentsQuery.data?.items]);

  const [activeTab, setActiveTab] = useState<ActiveTab>("qr");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AuthenticationStatusFilter>("All");

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<null | {
    type: "qr" | "facial";
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
    studentName?: string;
  }>(null);

  const credentialMap = useMemo(
    () => new Map((credentialStatusesQuery.data ?? []).map((status) => [status.studentId, status])),
    [credentialStatusesQuery.data]
  );

  const qrRows = useMemo<QrRow[]>(() => rawStudents.map((student) => {
    const credential = credentialMap.get(student.id)?.qrCredential;
    return {
      studentId: student.id,
      studentName: student.formattedName || student.fullName || student.studentNumber,
      studentNumber: student.studentNumber,
      credentialId: credential?.id ?? "",
      status: getQrCredentialDisplayStatus(credential) === "Active" ? "Active" : "Deactivated",
      dateGenerated: credential?.issuedAt?.slice(0, 10) ?? "-",
      lastUsed: credential?.lastSuccessfulCheckInAt ? formatDateTime(credential.lastSuccessfulCheckInAt, "-") : "-"
    };
  }), [credentialMap, rawStudents]);

  const facialRows = useMemo<FacialRow[]>(() => rawStudents.map((student) => {
    const profile = credentialMap.get(student.id)?.facialProfile;
    return {
      studentId: student.id,
      studentName: student.formattedName || student.fullName || student.studentNumber,
      studentNumber: student.studentNumber,
      enrollmentDate: profile?.enrolledAt?.slice(0, 10) ?? "-",
      status: getFacialCredentialDisplayStatus(profile),
      lastScan: profile?.lastVerifiedAt?.slice(0, 10) ?? "-"
    };
  }), [credentialMap, rawStudents]);

  const filteredQrRows = useMemo(() => {
    return qrRows.filter((r) => {
      const matchesSearch =
        !searchQuery.trim() ||
        r.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.studentNumber.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === "Active") {
        matchesStatus = r.status === "Active";
      } else if (statusFilter === "Deactivated") {
        matchesStatus = r.status === "Deactivated";
      } else if (statusFilter === "Pending") {
        matchesStatus = false;
      }

      return matchesSearch && matchesStatus;
    });
  }, [qrRows, searchQuery, statusFilter]);

  const filteredFacialRows = useMemo(() => {
    return facialRows.filter((r) => {
      const matchesSearch =
        !searchQuery.trim() ||
        r.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.studentNumber.toLowerCase().includes(searchQuery.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === "Active") {
        matchesStatus = r.status === "Active";
      } else if (statusFilter === "Deactivated") {
        matchesStatus = r.status === "Deactivated";
      }

      return matchesSearch && matchesStatus;
    });
  }, [facialRows, searchQuery, statusFilter]);

  const handleDisableQr = useCallback((studentName: string) => {
    setActiveModal({
      type: "qr",
      title: "Disable QR credential",
      description: `Temporarily disable the QR credential for ${studentName}? This action can be reversed later.`,
      confirmLabel: "Disable credential",
      cancelLabel: "Cancel",
      tone: "danger",
      studentName
    });
  }, []);

  const handleActivateQr = useCallback((studentName: string) => {
    setActiveModal({
      type: "qr",
      title: "Enable QR credential",
      description: `Activate the QR credential for ${studentName}?`,
      confirmLabel: "Enable credential",
      cancelLabel: "Cancel",
      tone: "default",
      studentName
    });
  }, []);

  const handleRegenerateQr = useCallback((studentName: string) => {
    setActiveModal({
      type: "qr",
      title: "Regenerate QR credential",
      description: `A fresh QR code will be generated and assigned to ${studentName}.`,
      confirmLabel: "Regenerate QR",
      cancelLabel: "Cancel",
      studentName
    });
  }, []);

  const handleToggleQrStatus = useCallback((studentName: string, currentStatus: QRStatus) => {
    if (currentStatus === "Active") {
      handleDisableQr(studentName);
    } else {
      handleActivateQr(studentName);
    }
  }, [handleDisableQr, handleActivateQr]);

  const handleViewQr = useCallback((student: QrRow) => {
    const isActive = student.status === "Active";
    const canManage = Boolean(student.credentialId);
    setActiveModal({
      type: "qr",
      title: "QR credential details",
      description: `Review the current QR credential for ${student.studentName}.`,
      confirmLabel: canManage ? (isActive ? "Disable credential" : "Enable credential") : "Close",
      cancelLabel: canManage ? "Cancel" : "Close",
      tone: canManage && isActive ? "danger" : "default",
      studentName: student.studentName
    });
  }, []);

  const handleViewFacial = useCallback((studentName: string) => {
    setActiveModal({
      type: "facial",
      title: "Facial enrollment details",
      description: `Review the current facial enrollment for ${studentName}.`,
      confirmLabel: "Close",
      studentName
    });
  }, []);

  const handleDeactivateFacial = useCallback((studentName: string) => {
    setActiveModal({
      type: "facial",
      title: "Deactivate facial credential",
      description: `Deactivate the facial recognition credential for ${studentName}? This will block future facial check-ins.`,
      confirmLabel: "Deactivate",
      cancelLabel: "Cancel",
      tone: "danger",
      studentName
    });
  }, []);

  const handleActivateFacial = useCallback((studentName: string) => {
    setActiveModal({
      type: "facial",
      title: "Activate facial credential",
      description: `Activate the facial recognition credential for ${studentName}?`,
      confirmLabel: "Activate",
      cancelLabel: "Cancel",
      tone: "default",
      studentName
    });
  }, []);

  const handleToggleFacialStatus = useCallback((studentName: string, currentStatus: FacialStatus) => {
    if (currentStatus === "Active") {
      handleDeactivateFacial(studentName);
    } else {
      handleActivateFacial(studentName);
    }
  }, [handleDeactivateFacial, handleActivateFacial]);

  async function confirmModalAction() {
    if (!activeModal) return;

    if (activeModal.type === "qr" && activeModal.studentName) {
      const student = qrRows.find((row) => row.studentName === activeModal.studentName);
      if (!student) {
        toast.error("Student credential could not be found.");
        setActiveModal(null);
        return;
      }
      if (activeModal.title.includes("Disable") || (activeModal.title === "QR credential details" && student.status === "Active" && Boolean(student.credentialId))) {
        await credentialMutations.setCredentialStatusMutation.mutateAsync({
          studentId: student.studentId,
          credentialType: "qr",
          status: "inactive"
        });
        toast.success(`QR credential disabled for ${activeModal.studentName}.`);
      } else if (activeModal.title.includes("Enable") || activeModal.title.includes("Activate") || activeModal.title.includes("Regenerate") || (activeModal.title === "QR credential details" && student.status !== "Active" && Boolean(student.credentialId))) {
        await credentialMutations.setCredentialStatusMutation.mutateAsync({
          studentId: student.studentId,
          credentialType: "qr",
          status: "activated"
        });
        toast.success(`QR credential updated for ${activeModal.studentName}.`);
      }
    }

    if (activeModal.type === "facial" && activeModal.studentName) {
      const student = facialRows.find((row) => row.studentName === activeModal.studentName);
      if (!student) {
        toast.error("Student facial credential could not be found.");
        setActiveModal(null);
        return;
      }
      if (activeModal.title.includes("Deactivate")) {
        await credentialMutations.setCredentialStatusMutation.mutateAsync({
          studentId: student.studentId,
          credentialType: "facial",
          status: "inactive"
        });
        toast.success(`Facial enrollment deactivated for ${activeModal.studentName}.`);
      } else if (activeModal.title.includes("Activate")) {
        await credentialMutations.setCredentialStatusMutation.mutateAsync({
          studentId: student.studentId,
          credentialType: "facial",
          status: "activated"
        });
        toast.success(`Facial enrollment activated for ${activeModal.studentName}.`);
      } else {
        toast.success(`Facial enrollment for ${activeModal.studentName} opened.`);
      }
    }

    setActiveModal(null);
  }

  const selectedStudentQrInfo = useMemo(() => {
    if (!activeModal?.studentName) return null;
    return qrRows.find((r) => r.studentName === activeModal.studentName);
  }, [activeModal?.studentName, qrRows]);

  const selectedStudentFacialInfo = useMemo(() => {
    if (!activeModal?.studentName) return null;
    return facialRows.find((r) => r.studentName === activeModal.studentName);
  }, [activeModal?.studentName, facialRows]);

  const qrColumns = useMemo<ColDef<QrRow>[]>(() => [
    {
      headerName: "Student",
      colId: "student",
      minWidth: 240,
      flex: 1,
      valueGetter: ({ data }) => data ? `${data.studentName} ${data.studentNumber}` : "",
      cellRenderer: ({ data }: ICellRendererParams<QrRow>) => data ? (
        <div className="py-1 leading-tight">
          <div className="font-medium text-foreground">{data.studentName}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{data.studentNumber}</div>
        </div>
      ) : null
    },
    {
      headerName: "QR Status",
      field: "status",
      minWidth: 130,
      cellRenderer: ({ value }: ICellRendererParams<QrRow, QRStatus>) => (
        <StatusBadge label={value ?? "Deactivated"} tone={qrTone(value ?? "Deactivated")} />
      )
    },
    { headerName: "Date Generated", field: "dateGenerated", minWidth: 150 },
    { headerName: "Last Used", field: "lastUsed", minWidth: 150 },
  ], []);

  const facialColumns = useMemo<ColDef<FacialRow>[]>(() => [
    {
      headerName: "Student",
      colId: "student",
      minWidth: 240,
      flex: 1,
      valueGetter: ({ data }) => data ? `${data.studentName} ${data.studentNumber}` : "",
      cellRenderer: ({ data }: ICellRendererParams<FacialRow>) => data ? (
        <div className="py-1 leading-tight">
          <div className="font-medium text-foreground">{data.studentName}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{data.studentNumber}</div>
        </div>
      ) : null
    },
    { headerName: "Enrollment Date", field: "enrollmentDate", minWidth: 150 },
    {
      headerName: "Status",
      field: "status",
      minWidth: 130,
      cellRenderer: ({ value }: ICellRendererParams<FacialRow, FacialStatus>) => (
        <StatusBadge label={value ?? "Deactivated"} tone={facialTone(value ?? "Deactivated")} />
      )
    },
    { headerName: "Last Scan", field: "lastScan", minWidth: 150 }
  ], []);

  return (
    <div className="space-y-6">
      <PageHeader title="Authentication Methods" description="Manage QR codes and facial recognition credentials for all students." />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Credential overview">
        {activeTab === "qr" ? (
          <>
            <CredentialMetric label="QR credentials" value={qrRows.length} icon={<QrCode className="h-4 w-4" />} />
            <CredentialMetric label="Active" value={qrRows.filter((row) => row.status === "Active").length} icon={<UserCheck className="h-4 w-4" />} accent="success" />
            <CredentialMetric label="Deactivated" value={qrRows.filter((row) => row.status === "Deactivated").length} icon={<QrCode className="h-4 w-4" />} accent="danger" />
          </>
        ) : (
          <>
            <CredentialMetric label="Enrolled" value={facialRows.length} icon={<Camera className="h-4 w-4" />} />
            <CredentialMetric label="Active" value={facialRows.filter((row) => row.status === "Active").length} icon={<UserCheck className="h-4 w-4" />} accent="success" />
            <CredentialMetric label="Deactivated" value={facialRows.filter((row) => row.status === "Deactivated").length} icon={<Camera className="h-4 w-4" />} accent="danger" />
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab("qr")}
          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-xs ${activeTab === "qr" ? "bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <QrCode className="h-4 w-4" />
          QR Code
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("facial")}
          className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-xs ${activeTab === "facial" ? "bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <Camera className="h-4 w-4" />
          Facial Recognition
        </button>
      </div>

      <section className="space-y-3 rounded-xl border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Credential directory</h2>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Filter className="h-3 w-3" aria-hidden="true" />
              {activeTab === "qr" ? filteredQrRows.length : filteredFacialRows.length} results
            </span>
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
        <div className="mt-3 grid grid-cols-1 items-end gap-3 border-t border-border/50 pt-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by student name or Student ID..."
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-xs shadow-xs transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="credential-status-filter" className="text-[11px] font-medium text-muted-foreground">Credential status</label>
            <select
              id="credential-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="All">All statuses</option>
              <option value="Active">Active</option>
              <option value="Deactivated">Deactivated</option>
            </select>
          </div>
          <div className="flex min-h-9 items-center lg:justify-end">
            {searchQuery || statusFilter !== "All" ? (
              <Button type="button" variant="ghost" size="sm" className="px-0 text-xs" onClick={() => { setSearchQuery(""); setStatusFilter("All"); }}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <ConfirmModal
        open={Boolean(activeModal)}
        title={activeModal?.title ?? "Action"}
        description={activeModal?.description}
        confirmLabel={activeModal?.confirmLabel}
        cancelLabel={activeModal?.cancelLabel}
        tone={activeModal?.tone}
        onConfirm={confirmModalAction}
        onCancel={() => setActiveModal(null)}
      >
        {activeModal?.type === "qr" && activeModal.studentName ? (
          <div className="space-y-4 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-surface to-surface p-4 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">QR credential preview</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Use this credential for event attendance.</p>
              </div>
              <StatusBadge label={selectedStudentQrInfo?.status ?? "Deactivated"} tone={qrTone(selectedStudentQrInfo?.status ?? "Deactivated")} />
            </div>
            <OrganizerQrPreview student={selectedStudentQrInfo} />
            <p>
              {activeModal.title.includes("Regenerate")
                ? "A fresh QR code will be generated and assigned to this student for the next event." 
                : "This preview shows the student’s current QR credential details before attendance check-in."}
            </p>
          </div>
        ) : null}

        {activeModal?.type === "facial" && activeModal.studentName ? (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">Facial profile preview</p>
              <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                Current profile
              </span>
            </div>
            <div className="rounded-md border border-dashed border-border bg-background p-3">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-10 w-10" />
              </div>
              <div className="mt-3 space-y-1 text-center">
                <p className="font-semibold text-foreground">{activeModal.studentName}</p>
                <p>Last verified: {selectedStudentFacialInfo?.lastScan && selectedStudentFacialInfo.lastScan !== "-" ? selectedStudentFacialInfo.lastScan : new Date().toISOString().slice(0, 10)}</p>
                <p>Status: {selectedStudentFacialInfo?.status || "Deactivated"}</p>
              </div>
            </div>
            <p>
              This preview shows the stored facial profile and recent verification activity for the student.
            </p>
            {activeModal.title === "Facial enrollment details" && selectedStudentFacialInfo ? (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
                <Button
                  type="button"
                  variant={selectedStudentFacialInfo.status === "Active" ? "destructive" : "default"}
                  size="sm"
                  onClick={() => handleToggleFacialStatus(selectedStudentFacialInfo.studentName, selectedStudentFacialInfo.status)}
                >
                  {selectedStudentFacialInfo.status === "Active" ? "Deactivate facial" : "Activate facial"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

      </ConfirmModal>

      {activeTab === "qr" ? (
        <div className="space-y-6">
          <PLPassDataGrid
            label="Student QR Credentials"
            data={filteredQrRows}
            columns={qrColumns}
            isLoading={studentsQuery.isLoading}
            emptyTitle="No QR credentials found"
            emptyDescription="There are no student QR credentials matching your criteria."
            onRowClick={handleViewQr}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <PLPassDataGrid
            label="Facial Enrollment Records"
            data={filteredFacialRows}
            columns={facialColumns}
            isLoading={studentsQuery.isLoading}
            emptyTitle="No facial enrollment records found"
            emptyDescription="There are no facial enrollment records matching your criteria."
            onRowClick={(row) => handleViewFacial(row.studentName)}
          />

        </div>
      )}

      <ReportExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        qrRows={qrRows}
        facialRows={facialRows}
        activeTab={activeTab}
        activeSearch={searchQuery}
        activeStatusFilter={statusFilter}
        onExportAction={(action, targetType, metadata) => {
          void auditLogMutations.logActionMutation.mutateAsync({
            action,
            targetType,
            metadata
          });
        }}
      />
    </div>
  );
}
