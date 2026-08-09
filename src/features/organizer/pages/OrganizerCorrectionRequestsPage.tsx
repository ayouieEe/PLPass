/* eslint-disable @typescript-eslint/no-unused-vars */
import { type ReactNode, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, Check, CheckCircle2, Eye, Search, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useCorrectionRequests, useOrganizerProfiles } from "@/hooks/useRepositoryQueries";
import type { RepositoryContext } from "@/services/repositoryUtils";
import {
  approveOrganizerCorrectionRequest,
  createUiExport,
  loadOrganizerUiState,
  rejectOrganizerCorrectionRequest,
  type OrganizerCorrectionRequest,
  type OrganizerUiState
} from "@/features/organizer/data/organizerUiStore";

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

function buildRequestsFromStore(state: OrganizerUiState): CorrectionRequest[] {
  return state.correctionRequests.map((request) => {
    const student = state.students.find((item) => item.name === request.studentName);
    const event = state.events.find((item) => item.code === request.eventCode);
    const attendanceRow = state.attendanceRows.find((row) => row.studentName === request.studentName && row.eventCode === request.eventCode);

    return {
      id: request.id,
      requestId: request.id,
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
  const [uiState, setUiState] = useState(() => loadOrganizerUiState());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [selectedRequest, setSelectedRequest] = useState<RequestDetails | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState("");

  const repositoryRequests = useMemo<CorrectionRequest[]>(() => {
    return (correctionRequestsQuery.data?.items ?? [])
      .map((req) => ({
        id: req.id,
        requestId: req.id,
        studentName: req.studentId === "student-1" ? "John Doe" : req.studentId,
        studentNumber: req.studentId,
        eventCode: req.eventId ?? "EVT-2026-001",
        eventName: "CCS Orientation",
        requestType: (req.requestedStatus === "excused" ? "Excuse" : "Correction") as RequestType,
        dateSubmitted: "2026-07-17",
        status: req.status as RequestStatus,
        recordedAttendanceStatus: "absent" as const,
        requestedStatus: (req.requestedStatus === "excused" ? "absent" : req.requestedStatus) as "present" | "late" | "absent"
      }))
      .sort((a, b) => (a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0));
  }, [correctionRequestsQuery.data?.items]);

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
    } catch {
      // ignore local ui sync
    }
  }

  function exportTabReport() {
    const label = statusFilter === "all" ? "All correction requests" : `${statusFilter} correction requests`;
    toast.success(createUiExport(label));
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
      <PageHeader title="Correction Requests" />

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={exportTabReport}
            >
              Export
            </Button>
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
