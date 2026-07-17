import { type ReactNode, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, Check, CheckCircle2, Eye, Search, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import {
  approveOrganizerCorrectionRequest,
  createMockExport,
  loadOrganizerMockState,
  rejectOrganizerCorrectionRequest,
  type OrganizerCorrectionRequest,
  type OrganizerMockState
} from "@/features/organizer/data/organizerMockStore";

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

const mockRequests: CorrectionRequest[] = [
  {
    id: "req-001",
    requestId: "REQ-2026-001",
    studentName: "Maria Santos",
    studentNumber: "HM-2024-1501",
    eventCode: "EVT-2026-001",
    eventName: "Hospitality Career Fair & Industry Talk",
    requestType: "Excuse",
    dateSubmitted: "2026-01-15",
    status: "pending",
    recordedAttendanceStatus: "absent",
    requestedStatus: "present"
  },
  {
    id: "req-002",
    requestId: "REQ-2026-002",
    studentName: "John Reyes",
    studentNumber: "HM-2024-1502",
    eventCode: "EVT-2026-002",
    eventName: "Food & Beverage Service Skills Workshop",
    requestType: "Correction",
    dateSubmitted: "2026-01-16",
    status: "pending",
    recordedAttendanceStatus: "late",
    requestedStatus: "present"
  },
  {
    id: "req-003",
    requestId: "REQ-2026-003",
    studentName: "Ana Cruz",
    studentNumber: "HM-2024-1503",
    eventCode: "EVT-2026-003",
    eventName: "AHTOMP General Assembly & Orientation",
    requestType: "Excuse",
    dateSubmitted: "2026-01-10",
    status: "approved",
    recordedAttendanceStatus: "absent",
    requestedStatus: "present"
  },
  {
    id: "req-004",
    requestId: "REQ-2026-004",
    studentName: "Robert Tañ",
    studentNumber: "HM-2024-1504",
    eventCode: "EVT-2026-001",
    eventName: "Hospitality Career Fair & Industry Talk",
    requestType: "Correction",
    dateSubmitted: "2026-01-12",
    status: "rejected",
    recordedAttendanceStatus: "late",
    requestedStatus: "present"
  }
];

const mockRequestDetails: Record<string, RequestDetails> = {
  "req-001": {
    id: "req-001",
    requestId: "REQ-2026-001",
    studentName: "Maria Santos",
    studentNumber: "HM-2024-1501",
    eventCode: "EVT-2026-001",
    eventName: "Hospitality Career Fair & Industry Talk",
    requestType: "Excuse",
    dateSubmitted: "2026-01-15",
    status: "pending",
    recordedAttendanceStatus: "absent",
    requestedStatus: "present",
    explanation: "I had a doctor's appointment on that day. I was sick with fever and my parent took me to the clinic. I submitted a medical certificate but my attendance was still marked as absent.",
    supportingAttachment: "medical-cert-2026-01-15.pdf",
    attachmentFileName: "Medical Certificate - Dr. Santos"
  },
  "req-002": {
    id: "req-002",
    requestId: "REQ-2026-002",
    studentName: "John Reyes",
    studentNumber: "HM-2024-1502",
    eventCode: "EVT-2026-002",
    eventName: "Food & Beverage Service Skills Workshop",
    requestType: "Correction",
    dateSubmitted: "2026-01-16",
    status: "pending",
    recordedAttendanceStatus: "late",
    requestedStatus: "present",
    explanation: "I checked in at 1:05 PM which is only 5 minutes after the official 1:00 PM start time. I was there on time and participated in the entire session. I believe this should be marked as present, not late."
  },
  "req-003": {
    id: "req-003",
    requestId: "REQ-2026-003",
    studentName: "Ana Cruz",
    studentNumber: "HM-2024-1503",
    eventCode: "EVT-2026-003",
    eventName: "AHTOMP General Assembly & Orientation",
    requestType: "Excuse",
    dateSubmitted: "2026-01-10",
    status: "approved",
    recordedAttendanceStatus: "absent",
    requestedStatus: "present",
    explanation: "I had a family emergency on that day and had to attend immediately. I submitted a letter from my guardian explaining the situation.",
    supportingAttachment: "guardian-letter-2026-01-10.pdf",
    attachmentFileName: "Guardian Authorization Letter",
    decision: "approved",
    decisionRemarks: "Approved. Supporting documentation confirms family emergency. Attendance status updated to present."
  },
  "req-004": {
    id: "req-004",
    requestId: "REQ-2026-004",
    studentName: "Robert Tañ",
    studentNumber: "HM-2024-1504",
    eventCode: "EVT-2026-001",
    eventName: "Hospitality Career Fair & Industry Talk",
    requestType: "Correction",
    dateSubmitted: "2026-01-12",
    status: "rejected",
    recordedAttendanceStatus: "late",
    requestedStatus: "present",
    explanation: "I arrived at 8:45 AM which is 45 minutes after start time due to traffic.",
    decision: "rejected",
    decisionRemarks: "Rejected. Arrival time confirms late attendance. No supporting documentation provided. Status remains late."
  }
};

function requestStatusFromStore(status: OrganizerCorrectionRequest["status"]): RequestStatus {
  if (status === "Approved") return "approved";
  if (status === "Rejected") return "rejected";
  return "pending";
}

function requestTypeFromStore(type: OrganizerCorrectionRequest["requestType"]): RequestType {
  return type === "Excused Absence" ? "Excuse" : "Correction";
}

function buildRequestsFromStore(state: OrganizerMockState): CorrectionRequest[] {
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
  const [mockState, setMockState] = useState(() => loadOrganizerMockState());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [selectedRequest, setSelectedRequest] = useState<RequestDetails | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState("");
  const requests = useMemo(() => buildRequestsFromStore(mockState), [mockState]);

  const filteredRequests = requests.filter(
    (request) =>
      (statusFilter === "all" || request.status === statusFilter) &&
      (request.requestId.toLowerCase().includes(search.toLowerCase()) ||
        request.studentName.toLowerCase().includes(search.toLowerCase()) ||
        request.eventCode.toLowerCase().includes(search.toLowerCase()) ||
        request.eventName.toLowerCase().includes(search.toLowerCase()))
  );

  function buildRequestDetails(request: CorrectionRequest): RequestDetails {
    const baseDetails = mockRequestDetails[request.id];
    const storeRequest = mockState.correctionRequests.find((item) => item.id === request.id);
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

  function approveRequest() {
    if (!selectedRequest) return;
    const remark = decisionRemarks.trim() || `Approved. Attendance status updated to ${selectedRequest.requestedStatus}.`;

    setMockState((current) => approveOrganizerCorrectionRequest(current, selectedRequest.id, remark));
    setSelectedRequest((current) => (current ? { ...current, status: "approved", decision: "approved", decisionRemarks: remark } : null));
    toast.success(`${selectedRequest.requestId} has been approved. Attendance status updated to ${selectedRequest.requestedStatus}.`);
  }

  function rejectRequest() {
    if (!selectedRequest) return;
    const remark = decisionRemarks.trim() || "Rejected. Original attendance status retained.";

    setMockState((current) => rejectOrganizerCorrectionRequest(current, selectedRequest.id, remark));
    setSelectedRequest((current) => (current ? { ...current, status: "rejected", decision: "rejected", decisionRemarks: remark } : null));
    toast.error(`${selectedRequest.requestId} has been rejected. Original attendance status retained.`);
  }

  function exportTabReport() {
    const label = statusFilter === "all" ? "All correction requests" : `${statusFilter} correction requests`;
    toast.success(createMockExport(label));
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
    <div className="space-y-6">
      <PageHeader
        title="Excused / Correction Requests"
        description="Review and process student attendance correction and excuse requests."
      />

      <section className="rounded-lg border bg-surface p-4">
        <div className="mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">{statusFilter === "all" ? "All Requests" : `${statusFilter.charAt(0).toUpperCase()}${statusFilter.slice(1)} Requests`}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Submitted correction and excuse requests from students.</p>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "pending", "approved", "rejected"] as const).map((tab) => (
              <Button
                key={tab}
                type="button"
                variant={statusFilter === tab ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(tab)}
              >
                {tab === "all" ? "All Requests" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">XLSX / PDF</span>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="min-w-[120px] rounded-lg px-4 shadow-sm"
              onClick={exportTabReport}
            >
              Export Report
            </Button>
          </div>
        </div>
        <div className="mb-4 max-w-xl">
          <label className="text-sm font-medium" htmlFor="correction-search">
            Search requests
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="correction-search"
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Search by request ID, student name, or event code"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <PLPassDataGrid
          label="Correction requests"
          data={filteredRequests}
          columns={columns}
          emptyTitle="No requests found"
          emptyDescription="Submitted correction and excuse requests will appear here."
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
