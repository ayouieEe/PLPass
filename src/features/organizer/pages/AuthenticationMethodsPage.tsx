/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CheckCircle2, Download, FileSpreadsheet, FileText, QrCode, RefreshCw, ScanLine, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useCredentialRequests, useOrganizerProfiles, useStudents } from "@/hooks/useRepositoryQueries";
import {
  exportQrCredentialsXlsx,
  exportQrCredentialsPdf,
  exportFacialProfilesXlsx,
  exportFacialProfilesPdf,
  type ExportQrCredentialRow,
  type ExportFacialProfileRow
} from "@/features/organizer/utils/exportUtils";

type FacialStatus = "Activated" | "Damaged" | "Inactive";
type QRStatus = "Active" | "Expired" | "Disabled";
type ActiveTab = "facial" | "qr";

type QrRow = {
  studentId: string;
  studentName: string;
  status: QRStatus;
  dateGenerated: string;
  lastUsed: string;
};

type FacialRow = {
  studentId: string;
  studentName: string;
  enrollmentDate: string;
  status: FacialStatus;
  lastScan: string;
};

type RegenerationRequest = {
  id: string;
  rawId: string;
  studentName: string;
  dateRequested: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
};

type FacialEnrollmentRequest = {
  id: string;
  rawId: string;
  studentName: string;
  issue: string;
  dateRequested: string;
  status: "Pending" | "Approved" | "Rejected";
};

function formatRequestId(id: string, index?: number): string {
  if (!id) return "RQ-26-00000";
  if (id.startsWith("RQ-")) return id;
  const num = (index !== undefined ? index + 1 : 1).toString().padStart(5, "0");
  return `RQ-26-${num}`;
}

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
  if (status === "Activated") {
    return "success" as const;
  }
  if (status === "Inactive") {
    return "warning" as const;
  }
  return "danger" as const;
}

function qrTone(status: QRStatus) {
  if (status === "Active") {
    return "success" as const;
  }
  if (status === "Disabled") {
    return "danger" as const;
  }
  return "warning" as const;
}

function ReportExportModal({
  isOpen,
  onClose,
  qrRows,
  facialRows,
  activeTab
}: {
  isOpen: boolean;
  onClose: () => void;
  qrRows: QrRow[];
  facialRows: FacialRow[];
  activeTab: ActiveTab;
}) {
  const [reportType, setReportType] = useState<"qr" | "facial">(activeTab === "facial" ? "facial" : "qr");
  const [statusFilter, setStatusFilter] = useState("all");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");

  if (!isOpen) return null;

  const filteredQr = qrRows.filter((r) => statusFilter === "all" || r.status === statusFilter);
  const filteredFacial = facialRows.filter((r) => statusFilter === "all" || r.status === statusFilter);
  const count = reportType === "qr" ? filteredQr.length : filteredFacial.length;

  function handleResetFilters() {
    setStatusFilter("all");
  }

  function handleExport() {
    if (count === 0) {
      toast.warning("No records match the selected export criteria.");
      return;
    }

    if (reportType === "qr") {
      const data: ExportQrCredentialRow[] = filteredQr.map((r) => ({
        studentId: r.studentId,
        studentName: r.studentName,
        status: r.status,
        dateGenerated: r.dateGenerated,
        lastUsed: r.lastUsed
      }));
      if (exportFormat === "xlsx") {
        exportQrCredentialsXlsx(data);
        toast.success(`Exported ${data.length} QR credential record(s) as CSV.`);
      } else {
        exportQrCredentialsPdf(data);
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
        exportFacialProfilesXlsx(data);
        toast.success(`Exported ${data.length} facial enrollment record(s) as CSV.`);
      } else {
        exportFacialProfilesPdf(data);
        toast.success(`Exported ${data.length} facial enrollment record(s) as PDF.`);
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
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
              >
                <option value="all">All statuses</option>
                {reportType === "qr" ? (
                  <>
                    <option value="Active">Active</option>
                    <option value="Expired">Expired</option>
                    <option value="Disabled">Disabled</option>
                  </>
                ) : (
                  <>
                    <option value="Activated">Activated</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Inactive">Inactive</option>
                  </>
                )}
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
              disabled={count === 0}
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

export function AuthenticationMethodsPage() {
  const scope = useOrganizerScope();
  const studentsQuery = useStudents({ pageSize: 100 }, scope.context);
  const credentialRequestsQuery = useCredentialRequests({ pageSize: 100 }, scope.context);

  const rawStudents = studentsQuery.data?.items ?? [];
  const rawRequests = credentialRequestsQuery.data?.items ?? [];

  const studentMap = useMemo(() => {
    const map = new Map<string, { name: string; studentNumber: string }>();
    rawStudents.forEach((s) => {
      const name = s.formattedName || s.fullName || s.studentNumber;
      map.set(s.id, { name, studentNumber: s.studentNumber });
      map.set(s.userId, { name, studentNumber: s.studentNumber });
      map.set(s.studentNumber, { name, studentNumber: s.studentNumber });
    });
    return map;
  }, [rawStudents]);

  const [activeTab, setActiveTab] = useState<ActiveTab>("qr");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<null | {
    type: "qr" | "facial" | "request";
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "default" | "danger";
    studentName?: string;
    requestId?: string;
  }>(null);

  const [qrRows, setQrRows] = useState<QrRow[]>([]);
  const [facialRows, setFacialRows] = useState<FacialRow[]>([]);

  useEffect(() => {
    if (rawStudents.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      setQrRows(
        rawStudents.map((student) => ({
          studentId: student.studentNumber || student.id,
          studentName: student.formattedName || student.fullName || student.studentNumber,
          status: student.status === "enrolled" ? "Active" : "Disabled",
          dateGenerated: student.createdAt ? student.createdAt.slice(0, 10) : todayStr,
          lastUsed: student.createdAt ? student.createdAt.slice(0, 10) : "-"
        }))
      );

      setFacialRows(
        rawStudents.map((student) => ({
          studentId: student.studentNumber || student.id,
          studentName: student.formattedName || student.fullName || student.studentNumber,
          enrollmentDate: student.createdAt ? student.createdAt.slice(0, 10) : todayStr,
          status: student.status === "enrolled" ? "Activated" : "Inactive",
          lastScan: student.createdAt ? student.createdAt.slice(0, 10) : "-"
        }))
      );
    }
  }, [rawStudents]);

  const [regenerationRequestsState, setRegenerationRequestsState] = useState<RegenerationRequest[]>([]);
  const [facialRequestsState, setFacialRequestsState] = useState<FacialEnrollmentRequest[]>([]);

  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10);

    const mappedQrReqs: RegenerationRequest[] = rawRequests
      .filter((r) => r.credentialType === "qr" || !r.credentialType)
      .map((r, index) => {
        const studentInfo = studentMap.get(r.studentId);
        return {
          id: formatRequestId(r.id, index),
          rawId: r.id,
          studentName: studentInfo?.name || r.studentId,
          dateRequested: r.requestedAt ? r.requestedAt.slice(0, 10) : todayStr,
          reason: r.reason || "QR code scanning error",
          status: r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending"
        };
      });

    const mappedFacialReqs: FacialEnrollmentRequest[] = rawRequests
      .filter((r) => r.credentialType === "facial")
      .map((r, index) => {
        const studentInfo = studentMap.get(r.studentId);
        return {
          id: formatRequestId(r.id, index),
          rawId: r.id,
          studentName: studentInfo?.name || r.studentId,
          issue: r.reason || "Facial verification issue",
          dateRequested: r.requestedAt ? r.requestedAt.slice(0, 10) : todayStr,
          status: r.status === "approved" ? "Approved" : r.status === "rejected" ? "Rejected" : "Pending"
        };
      });

    setRegenerationRequestsState(mappedQrReqs);
    setFacialRequestsState(mappedFacialReqs);
  }, [rawRequests, studentMap]);

  function handleViewQr(studentName: string) {
    setActiveModal({
      type: "qr",
      title: "QR credential details",
      description: `Review the current QR credential for ${studentName}.`,
      confirmLabel: "Close",
      studentName
    });
  }

  function handleRegenerateQr(studentName: string) {
    setActiveModal({
      type: "qr",
      title: "Regenerate QR credential",
      description: `This action will issue a fresh QR credential for ${studentName}.`,
      confirmLabel: "Confirm regeneration",
      cancelLabel: "Cancel",
      studentName
    });
  }

  function handleDisableQr(studentName: string) {
    setActiveModal({
      type: "qr",
      title: "Are you sure?",
      description: `Temporarily disable the QR credential for ${studentName}? This action can be reversed later.`,
      confirmLabel: "Disable credential",
      cancelLabel: "Cancel",
      tone: "danger",
      studentName
    });
  }

  function handleApproveRequest(requestId: string) {
    setActiveModal({
      type: "request",
      title: "Are you sure?",
      description: `Approve the pending request ${requestId}? This flow updates the request status.`,
      confirmLabel: "Approve request",
      cancelLabel: "Cancel",
      requestId
    });
  }

  function handleApproveFacialRequest(requestId: string) {
    setActiveModal({
      type: "request",
      title: "Are you sure?",
      description: `Approve the facial enrollment request ${requestId}?`,
      confirmLabel: "Approve request",
      cancelLabel: "Cancel",
      requestId
    });
  }

  function handleViewFacial(studentName: string) {
    setActiveModal({
      type: "facial",
      title: "Facial enrollment details",
      description: `Review the current facial enrollment for ${studentName}.`,
      confirmLabel: "Close",
      studentName
    });
  }

  function handleReEnrollFacial(studentName: string) {
    setActiveModal({
      type: "facial",
      title: "Re-enroll facial credential",
      description: `Start a fresh facial enrollment flow for ${studentName}.`,
      confirmLabel: "Start re-enrollment",
      cancelLabel: "Cancel",
      studentName
    });
  }

  function handleDeactivateFacial(studentName: string) {
    setActiveModal({
      type: "facial",
      title: "Are you sure?",
      description: `Deactivate the facial recognition credential for ${studentName}? This will block future facial check-ins.`,
      confirmLabel: "Deactivate",
      cancelLabel: "Cancel",
      tone: "danger",
      studentName
    });
  }

  function confirmModalAction() {
    if (!activeModal) return;

    if (activeModal.type === "qr" && activeModal.studentName) {
      if (activeModal.title.includes("Regenerate")) {
        const todayStr = new Date().toISOString().slice(0, 10);
        setQrRows((current) =>
          current.map((row) => (row.studentName === activeModal.studentName ? { ...row, status: "Active", dateGenerated: todayStr, lastUsed: "-" } : row))
        );
        toast.success(`QR credential regenerated for ${activeModal.studentName}.`);
      } else if (activeModal.title.includes("Disable")) {
        setQrRows((current) => current.map((row) => (row.studentName === activeModal.studentName ? { ...row, status: "Disabled", lastUsed: "-" } : row)));
        toast.success(`QR credential disabled for ${activeModal.studentName}.`);
      } else {
        toast.success(`QR credential for ${activeModal.studentName} opened.`);
      }
    }

    if (activeModal.type === "facial" && activeModal.studentName) {
      if (activeModal.title.includes("Re-enroll")) {
        const todayStr = new Date().toISOString().slice(0, 10);
        setFacialRows((current) => current.map((row) => (row.studentName === activeModal.studentName ? { ...row, status: "Activated", enrollmentDate: todayStr, lastScan: "-" } : row)));
        toast.success(`Facial enrollment re-initiated for ${activeModal.studentName}.`);
      } else if (activeModal.title.includes("Deactivate")) {
        setFacialRows((current) => current.map((row) => (row.studentName === activeModal.studentName ? { ...row, status: "Inactive", lastScan: "-" } : row)));
        toast.success(`Facial enrollment deactivated for ${activeModal.studentName}.`);
      } else {
        toast.success(`Facial enrollment for ${activeModal.studentName} opened.`);
      }
    }

    if (activeModal.type === "request" && activeModal.requestId) {
      setRegenerationRequestsState((current) => current.map((request) => (request.id === activeModal.requestId ? { ...request, status: "Approved" } : request)));
      setFacialRequestsState((current) => current.map((request) => (request.id === activeModal.requestId ? { ...request, status: "Approved" } : request)));
      toast.success(`Request ${activeModal.requestId} approved.`);
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Authentication Methods"
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

      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveTab("qr")}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-sm ${activeTab === "qr" ? "bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <QrCode className="h-4 w-4" />
          QR Code
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("facial")}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-sm ${activeTab === "facial" ? "bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <Camera className="h-4 w-4" />
          Facial Recognition
        </button>
      </div>

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
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">QR credential preview</p>
              <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                {activeModal.title.includes("Regenerate") ? "New credential" : "Current credential"}
              </span>
            </div>
            <div className="rounded-md border border-dashed border-border bg-background p-3">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <QrCode className="h-12 w-12" />
              </div>
              <div className="mt-3 space-y-1 text-center">
                <p className="font-semibold text-foreground">{activeModal.studentName}</p>
                <p>QR status: {selectedStudentQrInfo?.status || "Active"}</p>
                <p>Issued: {selectedStudentQrInfo?.dateGenerated || new Date().toISOString().slice(0, 10)}</p>
              </div>
            </div>
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
                {activeModal.title.includes("Re-enroll") ? "Enrollment refresh" : "Current profile"}
              </span>
            </div>
            <div className="rounded-md border border-dashed border-border bg-background p-3">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-10 w-10" />
              </div>
              <div className="mt-3 space-y-1 text-center">
                <p className="font-semibold text-foreground">{activeModal.studentName}</p>
                <p>Last verified: {selectedStudentFacialInfo?.lastScan && selectedStudentFacialInfo.lastScan !== "-" ? selectedStudentFacialInfo.lastScan : new Date().toISOString().slice(0, 10)}</p>
                <p>Status: {selectedStudentFacialInfo?.status || "Activated"}</p>
              </div>
            </div>
            <p>
              {activeModal.title.includes("Re-enroll")
                ? "A fresh facial profile will be captured and linked to the student’s account for future check-ins."
                : "This preview shows the stored facial profile and recent verification activity for the student."}
            </p>
          </div>
        ) : null}

        {activeModal?.type === "request" ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Request review</p>
            <p className="mt-1">The request will be approved and reflected in the organizer review queue.</p>
          </div>
        ) : null}
      </ConfirmModal>

      {activeTab === "qr" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Total QR Credentials</p>
              <p className="mt-2 text-2xl font-semibold">{qrRows.length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Active QR Credentials</p>
              <p className="mt-2 text-2xl font-semibold">{qrRows.filter((row) => row.status === "Active").length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Pending Regeneration Requests</p>
              <p className="mt-2 text-2xl font-semibold">{regenerationRequestsState.filter((row) => row.status === "Pending").length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Disabled QR Credentials</p>
              <p className="mt-2 text-2xl font-semibold">{qrRows.filter((row) => row.status === "Disabled").length}</p>
            </div>
          </div>

          <section className="rounded-lg border bg-surface p-4">
            <div>
              <h2 className="text-lg font-semibold">Student QR Credentials</h2>
              <p className="mt-1 text-sm text-muted-foreground">Manage student QR credentials used for authentication.</p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">Student Name</th>
                    <th className="px-3 py-2">QR Status</th>
                    <th className="px-3 py-2">Date Generated</th>
                    <th className="px-3 py-2">Last Used</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {qrRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        {studentsQuery.isLoading ? "Loading student credentials..." : "No student QR credentials found."}
                      </td>
                    </tr>
                  ) : (
                    qrRows.map((row) => (
                      <tr key={row.studentId} className="border-t">
                        <td className="px-3 py-2">{row.studentId}</td>
                        <td className="px-3 py-2">{row.studentName}</td>
                        <td className="px-3 py-2"><StatusBadge label={row.status} tone={qrTone(row.status)} /></td>
                        <td className="px-3 py-2">{row.dateGenerated}</td>
                        <td className="px-3 py-2">{row.lastUsed}</td>
                        <td className="px-3 py-2">
                          <div className="rounded-lg border border-border/80 bg-muted/40 p-2 shadow-sm">
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" className="border-border bg-background shadow-sm" onClick={() => handleViewQr(row.studentName)}><ScanLine className="mr-2 h-4 w-4" />View QR</Button>
                              <Button type="button" variant="secondary" size="sm" className="shadow-sm" onClick={() => handleRegenerateQr(row.studentName)}><RefreshCw className="mr-2 h-4 w-4" />Regenerate</Button>
                              <Button type="button" variant="destructive" size="sm" className="shadow-sm" onClick={() => handleDisableQr(row.studentName)}>Disable</Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <div>
              <h2 className="text-lg font-semibold">QR Regeneration Requests</h2>
              <p className="mt-1 text-sm text-muted-foreground">Students can request new QR credentials when their code is not working.</p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Request ID</th>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Date Requested</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {regenerationRequestsState.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        {credentialRequestsQuery.isLoading ? "Loading requests..." : "No QR regeneration requests found."}
                      </td>
                    </tr>
                  ) : (
                    regenerationRequestsState.map((request) => (
                      <tr key={request.id} className="border-t">
                        <td className="px-3 py-2">{request.id}</td>
                        <td className="px-3 py-2">{request.studentName}</td>
                        <td className="px-3 py-2">{request.dateRequested}</td>
                        <td className="px-3 py-2">{request.reason}</td>
                        <td className="px-3 py-2"><StatusBadge label={request.status} tone={request.status === "Approved" ? "success" : request.status === "Rejected" ? "danger" : "warning"} /></td>
                        <td className="px-3 py-2">
                          <Button type="button" size="sm" onClick={() => handleApproveRequest(request.id)} disabled={request.status === "Approved"}>Approve</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Total Enrolled</p>
              <p className="mt-2 text-2xl font-semibold">{facialRows.length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Activated</p>
              <p className="mt-2 text-2xl font-semibold">{facialRows.filter((row) => row.status === "Activated").length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Damaged</p>
              <p className="mt-2 text-2xl font-semibold">{facialRows.filter((row) => row.status === "Damaged").length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Inactive</p>
              <p className="mt-2 text-2xl font-semibold">{facialRows.filter((row) => row.status === "Inactive").length}</p>
            </div>
          </div>

          <section className="rounded-lg border bg-surface p-4">
            <div>
              <h2 className="text-lg font-semibold">Facial Enrollment Records</h2>
              <p className="mt-1 text-sm text-muted-foreground">Monitor facial enrollment status and manage credential issues.</p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">Student Name</th>
                    <th className="px-3 py-2">Enrollment Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Last Scan</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {facialRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        {studentsQuery.isLoading ? "Loading facial records..." : "No facial enrollment records found."}
                      </td>
                    </tr>
                  ) : (
                    facialRows.map((row) => (
                      <tr key={row.studentId} className="border-t">
                        <td className="px-3 py-2">{row.studentId}</td>
                        <td className="px-3 py-2">{row.studentName}</td>
                        <td className="px-3 py-2">{row.enrollmentDate}</td>
                        <td className="px-3 py-2"><StatusBadge label={row.status} tone={facialTone(row.status)} /></td>
                        <td className="px-3 py-2">{row.lastScan}</td>
                        <td className="px-3 py-2">
                          <div className="rounded-lg border border-border/80 bg-muted/40 p-2 shadow-sm">
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="outline" size="sm" className="border-border bg-background shadow-sm" onClick={() => handleViewFacial(row.studentName)}><UserRound className="mr-2 h-4 w-4" />View</Button>
                              <Button type="button" variant="secondary" size="sm" className="shadow-sm" onClick={() => handleReEnrollFacial(row.studentName)}><RefreshCw className="mr-2 h-4 w-4" />Re-enroll</Button>
                              <Button type="button" variant="destructive" size="sm" className="shadow-sm" onClick={() => handleDeactivateFacial(row.studentName)}>Disable</Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <div>
              <h2 className="text-lg font-semibold">Enrollment Requests</h2>
              <p className="mt-1 text-sm text-muted-foreground">Review student-reported facial enrollment issues and re-enrollment requests.</p>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Request ID</th>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Issue</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {facialRequestsState.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        {credentialRequestsQuery.isLoading ? "Loading enrollment requests..." : "No pending facial enrollment requests found."}
                      </td>
                    </tr>
                  ) : (
                    facialRequestsState.map((request) => (
                      <tr key={request.id} className="border-t">
                        <td className="px-3 py-2">{request.id}</td>
                        <td className="px-3 py-2">{request.studentName}</td>
                        <td className="px-3 py-2">{request.issue}</td>
                        <td className="px-3 py-2">{request.dateRequested}</td>
                        <td className="px-3 py-2"><StatusBadge label={request.status} tone={request.status === "Approved" ? "success" : request.status === "Rejected" ? "danger" : "warning"} /></td>
                        <td className="px-3 py-2">
                          <Button type="button" size="sm" onClick={() => handleApproveFacialRequest(request.id)} disabled={request.status === "Approved"}>Approve</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <ReportExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        qrRows={qrRows}
        facialRows={facialRows}
        activeTab={activeTab}
      />
    </div>
  );
}
