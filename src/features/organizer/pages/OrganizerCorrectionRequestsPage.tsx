/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, Check, CheckCircle2, Download, Eye, FileSpreadsheet, FileText, Search, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useCorrectionRequests, useOrganizerProfiles, useStudents, useAuditLogMutations } from "@/hooks/useRepositoryQueries";
import type { RepositoryContext } from "@/services/repositoryUtils";
import {
  approveOrganizerCorrectionRequest,
  createUiExport,
  loadOrganizerUiState,
  rejectOrganizerCorrectionRequest,
  type OrganizerCorrectionRequest,
  type OrganizerUiState
} from "@/features/organizer/data/organizerUiStore";
import {
  exportCorrectionRequestsXlsx,
  exportCorrectionRequestsPdf,
  type ExportCorrectionRequestRow
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

type RequestStatus = "pending" | "approved" | "rejected";
type RequestType = "Excuse" | "Correction";

type CorrectionRequest = {
  id: string;
  requestId: string;
  studentName: string;
  studentNumber: string;
  eventCode: string;
  eventName: string;
  requestType: RequestType;
  dateSubmitted: string;
  status: RequestStatus;
  recordedAttendanceStatus: "present" | "late" | "absent";
  requestedStatus: "present" | "late" | "absent";
};

type RequestDetails = CorrectionRequest & {
  explanation: string;
  supportingAttachment?: string;
  attachmentFileName?: string;
  decision?: "approved" | "rejected";
  decisionRemarks?: string;
};

function statusTone(status: RequestStatus) {
  if (status === "pending") return "warning" as const;
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  return "muted" as const;
}

function ModalFrame({ children, onClose, width = "max-w-2xl" }: { children: ReactNode; onClose: () => void; width?: string }) {
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

function InfoTile({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ReportExportModal({
  isOpen,
  onClose,
  requests,
  activeStatusFilter,
  onExportAction
}: {
  isOpen: boolean;
  onClose: () => void;
  requests: CorrectionRequest[];
  activeStatusFilter: string;
  onExportAction: (action: string, targetType: string, metadata: Record<string, unknown>) => void;
}) {
  const [reportType, setReportType] = useState<"directory" | "summary">("directory");
  const [exportStatus, setExportStatus] = useState(activeStatusFilter);
  const [exportTypeFilter, setExportTypeFilter] = useState<"all" | RequestType>("all");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");

  if (!isOpen) return null;

  const filtered = requests.filter((r) => {
    const matchStatus = exportStatus === "all" || r.status === exportStatus;
    const matchType = exportTypeFilter === "all" || r.requestType === exportTypeFilter;
    return matchStatus && matchType;
  });

  function handleResetFilters() {
    setExportStatus("all");
    setExportTypeFilter("all");
  }

  function handleExport() {
    if (filtered.length === 0) {
      toast.warning("No correction request records match the selected export criteria.");
      return;
    }

    const data: ExportCorrectionRequestRow[] = filtered.map((r) => ({
      requestId: r.requestId,
      studentId: r.studentNumber,
      studentName: r.studentName,
      eventCode: r.eventCode,
      eventName: r.eventName,
      requestType: r.requestType,
      dateSubmitted: r.dateSubmitted,
      status: r.status,
      recordedStatus: r.recordedAttendanceStatus,
      requestedStatus: r.requestedStatus
    }));

    if (exportFormat === "xlsx") {
      exportCorrectionRequestsXlsx(data);
      toast.success(`Exported ${data.length} correction request(s) as CSV.`);
    } else {
      exportCorrectionRequestsPdf(data);
      toast.success(`Exported ${data.length} correction request(s) as PDF.`);
    }

    onExportAction(
      "Exported Correction Requests",
      "export_action",
      {
        reportType,
        format: exportFormat,
        recordCount: filtered.length,
        filters: {
          status: exportStatus,
          requestType: exportTypeFilter
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
          {/* Step 1: Report Content Cards */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
              1. Report Content
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setReportType("directory")}
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  reportType === "directory"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${reportType === "directory" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <FileText className="h-4 w-4" />
                  </div>
                  {reportType === "directory" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Correction Directory</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">All requests, student info, recorded & requested status.</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportType("summary")}
                className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                  reportType === "summary"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                    : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${reportType === "summary" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  {reportType === "summary" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Requests Summary</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">Aggregated summary by status & request type.</p>
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
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Request Status</label>
                <select
                  value={exportStatus}
                  onChange={(e) => setExportStatus(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Request Type</label>
                <select
                  value={exportTypeFilter}
                  onChange={(e) => setExportTypeFilter(e.target.value as "all" | RequestType)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-xs outline-none focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 transition font-medium text-slate-800"
                >
                  <option value="all">All types</option>
                  <option value="Correction">Correction</option>
                  <option value="Excuse">Excuse</option>
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
              {filtered.length} records selected
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
              disabled={filtered.length === 0}
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

const uiRequests: CorrectionRequest[] = [];

const requestDetails: Record<string, RequestDetails> = {};

function requestStatusFromStore(status: OrganizerCorrectionRequest["status"]): RequestStatus {
  if (status === "Approved") return "approved";
  if (status === "Rejected") return "rejected";
  return "pending";
}

function requestTypeFromStore(type: OrganizerCorrectionRequest["requestType"]): RequestType {
  return type === "Excused Absence" ? "Excuse" : "Correction";
}

function formatRequestId(id: string, index: number): string {
  if (id && /^RQ-\d{2}-\d{5}$/i.test(id)) {
    return id.toUpperCase();
  }
  return `RQ-26-${String(index + 1).padStart(5, "0")}`;
}

function buildRequestsFromStore(state: OrganizerUiState): CorrectionRequest[] {
  return state.correctionRequests.map((request, index) => {
    const student = state.students.find((item) => item.name === request.studentName);
    const event = state.events.find((item) => item.code === request.eventCode);
    const attendanceRow = state.attendanceRows.find((row) => row.studentName === request.studentName && row.eventCode === request.eventCode);

    return {
      id: request.id,
      requestId: formatRequestId(request.id, index + 100),
      studentName: request.studentName,
      studentNumber: student?.schoolId ?? "N/A",
      eventCode: request.eventCode,
      eventName: event?.name ?? request.eventCode,
      requestType: requestTypeFromStore(request.requestType),
      dateSubmitted: event?.date ?? "2026-07-17",
      status: requestStatusFromStore(request.status),
      recordedAttendanceStatus: attendanceRow?.attendanceStatus ?? "absent",
      requestedStatus: request.requestedStatus
    };
  });
}

export function OrganizerCorrectionRequestsPage() {
  const scope = useOrganizerScope();
  const correctionRequestsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 100 }, scope.context);
  const auditLogMutations = useAuditLogMutations(scope.context);
  const [uiState, setUiState] = useState(() => loadOrganizerUiState());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [selectedRequest, setSelectedRequest] = useState<RequestDetails | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState("");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const studentsMap = useMemo(() => {
    const map = new Map<string, { name: string; studentNumber: string }>();
    (studentsQuery.data?.items ?? []).forEach((s) => {
      const name = s.formattedName || s.fullName || s.studentNumber;
      map.set(s.id, { name, studentNumber: s.studentNumber });
      map.set(s.userId, { name, studentNumber: s.studentNumber });
      map.set(s.studentNumber, { name, studentNumber: s.studentNumber });
    });
    return map;
  }, [studentsQuery.data?.items]);

  const repositoryRequests = useMemo<CorrectionRequest[]>(() => {
    return (correctionRequestsQuery.data?.items ?? [])
      .map((req, index) => {
        const studentInfo = studentsMap.get(req.studentId);
        return {
          id: req.id,
          requestId: formatRequestId(req.id, index),
          studentName: studentInfo?.name ?? (req.studentId === "student-1" ? "John Doe" : req.studentId),
          studentNumber: studentInfo?.studentNumber ?? (req.studentId === "student-1" ? "23-00001" : req.studentId),
          eventCode: req.eventId ?? "EVT-2026-001",
          eventName: "CCS Orientation",
          requestType: (req.requestedStatus === "excused" ? "Excuse" : "Correction") as RequestType,
          dateSubmitted: "2026-07-17",
          status: req.status as RequestStatus,
          recordedAttendanceStatus: "absent" as const,
          requestedStatus: (req.requestedStatus === "excused" ? "absent" : req.requestedStatus) as "present" | "late" | "absent"
        };
      })
      .sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0));
  }, [correctionRequestsQuery.data?.items, studentsMap]);

  const storeRequests = useMemo(() => buildRequestsFromStore(uiState), [uiState]);
  const requests = useMemo(() => [...repositoryRequests, ...storeRequests], [repositoryRequests, storeRequests]);

  const filteredRequests = requests.filter(
    (request) =>
      (statusFilter === "all" || request.status === statusFilter) &&
      (request.requestId.toLowerCase().includes(search.toLowerCase()) ||
        request.studentName.toLowerCase().includes(search.toLowerCase()) ||
        request.eventCode.toLowerCase().includes(search.toLowerCase()) ||
        request.eventName.toLowerCase().includes(search.toLowerCase()))
  );

  function buildRequestDetails(request: CorrectionRequest): RequestDetails {
    const baseDetails = requestDetails[request.id];
    const storeRequest = uiState.correctionRequests.find((item) => item.id === request.id);
    return {
      ...baseDetails,
      ...request,
      explanation: storeRequest?.explanation ?? baseDetails?.explanation ?? "",
      supportingAttachment: storeRequest?.fileAttached ? `${request.id.toLowerCase()}-attachment.pdf` : baseDetails?.supportingAttachment,
      attachmentFileName: storeRequest?.fileAttached ? "Supporting Attachment" : baseDetails?.attachmentFileName,
      decision: request.status === "approved" ? "approved" : request.status === "rejected" ? "rejected" : undefined,
      decisionRemarks:
        request.status === "approved"
          ? storeRequest?.decisionRemarks ?? baseDetails?.decisionRemarks ?? `Approved. Attendance status updated to ${request.requestedStatus}.`
          : request.status === "rejected"
            ? storeRequest?.decisionRemarks ?? baseDetails?.decisionRemarks ?? "Rejected. Original attendance status retained."
            : undefined
    };
  }

  function viewRequest(request: CorrectionRequest) {
    const currentRequest = requests.find((item) => item.id === request.id) ?? request;
    setSelectedRequest(buildRequestDetails(currentRequest));
    setDecisionRemarks("");
  }

  const { reviewMutation } = correctionRequestsQuery;

  async function approveRequest() {
    if (!selectedRequest) return;
    const remark = decisionRemarks.trim() || `Approved. Attendance status updated to ${selectedRequest.requestedStatus}.`;

    requestDetails[selectedRequest.id] = {
      ...selectedRequest,
      status: "approved",
      decision: "approved",
      decisionRemarks: remark
    };

    setSelectedRequest((current) => (current ? { ...current, status: "approved", decision: "approved", decisionRemarks: remark } : null));
    setUiState((current) => approveOrganizerCorrectionRequest(current, selectedRequest.id, remark));
    toast.success(`${selectedRequest.requestId} has been approved. Attendance status updated to ${selectedRequest.requestedStatus}.`);

    try {
      await reviewMutation.mutateAsync({
        requestId: selectedRequest.id,
        status: "approved",
        reason: remark
      });
      
      void auditLogMutations.logActionMutation.mutateAsync({
        action: "Approved Correction Request",
        targetType: "correction_request",
        targetId: selectedRequest.id,
        metadata: { requestId: selectedRequest.id, remark }
      });
    } catch {
      // ignore local ui sync
    }
  }

  async function rejectRequest() {
    if (!selectedRequest) return;
    const remark = decisionRemarks.trim() || "Rejected. Original attendance status retained.";

    requestDetails[selectedRequest.id] = {
      ...selectedRequest,
      status: "rejected",
      decision: "rejected",
      decisionRemarks: remark
    };

    setSelectedRequest((current) => (current ? { ...current, status: "rejected", decision: "rejected", decisionRemarks: remark } : null));
    setUiState((current) => rejectOrganizerCorrectionRequest(current, selectedRequest.id, remark));
    toast.error(`${selectedRequest.requestId} has been rejected. Original attendance status retained.`);

    try {
      await reviewMutation.mutateAsync({
        requestId: selectedRequest.id,
        status: "rejected",
        reason: remark
      });
      
      void auditLogMutations.logActionMutation.mutateAsync({
        action: "Rejected Correction Request",
        targetType: "correction_request",
        targetId: selectedRequest.id,
        metadata: { requestId: selectedRequest.id, remark }
      });
    } catch {
      // ignore local ui sync
    }
  }

  const columns: Array<ColumnDef<CorrectionRequest>> = [
    {
      accessorKey: "requestId",
      header: "Request ID",
      cell: ({ row }) => <span className="font-medium text-primary">{row.original.requestId}</span>
    },
    {
      accessorKey: "studentName",
      header: "Student Name"
    },
    {
      accessorKey: "eventCode",
      header: "Event Code"
    },
    {
      accessorKey: "eventName",
      header: "Event Name"
    },
    {
      accessorKey: "requestType",
      header: "Request Type",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium">
          {row.original.requestType === "Excuse" ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
          {row.original.requestType}
        </span>
      )
    },
    {
      accessorKey: "dateSubmitted",
      header: "Date Submitted"
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} />
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => viewRequest(row.original)} aria-label={`View more ${row.original.requestId}`}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            View More
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Correction Requests"
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

      <section className="rounded-lg border bg-surface p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "pending", "approved", "rejected"] as const).map((tab) => (
              <Button
                key={tab}
                type="button"
                variant={statusFilter === tab ? "default" : "outline"}
                size="sm"
                className="capitalize"
                onClick={() => setStatusFilter(tab)}
              >
                {tab}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 w-64 md:w-80">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                id="correction-search"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search request, student, or event..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </div>

        <PLPassDataGrid
          label="Correction requests"
          data={filteredRequests}
          columns={columns}
          onSelectionChange={(selectedRows) => {
            if (selectedRows[0]) {
              viewRequest(selectedRows[0]);
            }
          }}
          emptyTitle="No requests"
          emptyDescription="No requests matching current filter."
        />
      </section>

      <ReportExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        requests={requests}
        activeStatusFilter={statusFilter}
        onExportAction={(action, targetType, metadata) => {
          void auditLogMutations.logActionMutation.mutateAsync({
            action,
            targetType,
            metadata
          });
        }}
      />

      {selectedRequest ? (
        <ModalFrame onClose={() => setSelectedRequest(null)} width="max-w-3xl">
          <div>
            <p className="text-sm font-semibold text-primary">Request Details</p>
            <h2 className="mt-1 text-2xl font-semibold">{selectedRequest.requestId}</h2>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoTile label="Student Name" value={selectedRequest.studentName} />
              <InfoTile label="Student Number" value={selectedRequest.studentNumber} />
              <InfoTile label="Event Code" value={selectedRequest.eventCode} />
              <InfoTile label="Request Type" value={selectedRequest.requestType} />
            </div>

            <section className="mt-5 rounded-lg border bg-background p-4">
              <h3 className="font-semibold">Attendance Information</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <InfoTile label="Event" value={selectedRequest.eventName} />
                <InfoTile label="Recorded Status" value={selectedRequest.recordedAttendanceStatus} />
                <InfoTile label="Requested Status" value={selectedRequest.requestedStatus} />
              </div>
            </section>

            <section className="mt-5 rounded-lg border bg-background p-4">
              <h3 className="font-semibold">Request Details</h3>
              <p className="mt-3 text-sm text-muted-foreground">{selectedRequest.explanation}</p>
              {selectedRequest.attachmentFileName ? (
                <div className="mt-4 rounded-lg border border-dashed bg-surface p-3">
                  <p className="text-sm font-medium">Supporting Attachment</p>
                  <Button type="button" variant="outline" size="sm" className="mt-2">
                    {selectedRequest.attachmentFileName}
                  </Button>
                </div>
              ) : null}
            </section>

            {selectedRequest.status === "pending" ? (
              <section className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h3 className="font-semibold">Organizer Decision</h3>
                <div className="mt-4 space-y-3">
                  <label className="text-sm font-medium">
                    Decision Remarks (Optional)
                    <textarea
                      className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
                      rows={3}
                      placeholder="e.g. Approved due to valid medical certificate. Updated attendance status to present."
                      value={decisionRemarks}
                      onChange={(event) => setDecisionRemarks(event.target.value)}
                    />
                  </label>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => rejectRequest()} aria-label="Reject request">
                    <ThumbsDown className="mr-2 h-4 w-4" />
                    Reject Request
                  </Button>
                  <Button type="button" onClick={() => approveRequest()} aria-label="Approve request">
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Approve Request
                  </Button>
                </div>
              </section>
            ) : (
              <section className="mt-5 rounded-lg border bg-background p-4">
                <h3 className="font-semibold">Organizer Decision</h3>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${selectedRequest.decision === "approved" ? "border border-green-200 bg-green-50 text-green-700" : "border border-red-200 bg-red-50 text-red-700"}`}>
                    {selectedRequest.decision === "approved" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {selectedRequest.decision === "approved" ? "Approved" : "Rejected"}
                  </span>
                </div>
                {selectedRequest.decisionRemarks ? (
                  <div className="mt-3 rounded-lg border bg-surface p-3">
                    <p className="text-sm text-muted-foreground">{selectedRequest.decisionRemarks}</p>
                  </div>
                ) : null}
              </section>
            )}
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

