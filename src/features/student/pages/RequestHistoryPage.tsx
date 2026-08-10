import { useState } from "react";
import { FilePenLine, ListFilter, Search } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { ModalShell } from "@/components/modals/ModalShell";
import { useAttendanceRecords, useAttendanceSessions, useClasses, useCorrectionRequests, useCredentialRequests, useEvents } from "@/hooks/useRepositoryQueries";
import { formatDisplayDate, formatDisplayTime, toValidDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import {
  correctionRequestTypeLabels,
  getStudentEventRecords,
  studentVisibleEvents,
  useStudentScope,
  type StudentRequestKind
} from "@/features/student/studentExperience";
import type { CorrectionRequestStatus, CredentialRequestStatus } from "@/types/enums";

type RequestHistoryRow = {
  id: string;
  submittedAt: string;
  type: StudentRequestKind;
  typeLabel: string;
  title: string;
  description: string;
  status: CorrectionRequestStatus | CredentialRequestStatus;
  reference: string;
  details: string[];
};

const cardShellClass = "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm";

function CardAccent() {
  return <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />;
}

function statusTone(status: CorrectionRequestStatus | CredentialRequestStatus) {
  if (status === "approved") return "success";
  if (status === "resolved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function typeLabel(type: StudentRequestKind) {
  if (type === "attendance_correction") return "Correction Request";
  if (type === "authentication_issue") return "Attendance Issue";
  return "Facial Review";
}

function submittedTime(value: string) {
  const date = toValidDate(value);
  return date?.getTime() ?? 0;
}

export function RequestHistoryPage() {
  const scope = useStudentScope();
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const credentialRequestsQuery = useCredentialRequests({ pageSize: 100 }, scope.context);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<RequestHistoryRow | null>(null);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in account does not have an active student profile." />;
  }

  if (
    classesQuery.isLoading ||
    eventsQuery.isLoading ||
    sessionsQuery.isLoading ||
    recordsQuery.isLoading ||
    correctionsQuery.isLoading ||
    credentialRequestsQuery.isLoading
  ) {
    return <LoadingState label="Loading request history" />;
  }

  const student = scope.student;
  const hasPartialDataIssue = classesQuery.isError || eventsQuery.isError || sessionsQuery.isError || recordsQuery.isError || correctionsQuery.isError || credentialRequestsQuery.isError;
  const classes = classesQuery.data?.items ?? [];
  const events = studentVisibleEvents(eventsQuery.data?.items ?? []);
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const studentEventRecords = getStudentEventRecords({
    studentId: student.id,
    records,
    sessions,
    events
  });

  const correctionRows: RequestHistoryRow[] = (correctionsQuery.data?.items ?? []).filter((request) => request.studentId === student.id).map((request) => {
    const eventRecord = studentEventRecords.find(
      (record) => record.id === request.attendanceRecordId || record.eventId === request.eventId
    );
    const classRecord = classes.find((entry) => entry.id === request.classId);
    const event = events.find((entry) => entry.id === request.eventId);
    const title = eventRecord?.eventName ?? event?.title ?? classRecord?.subjectTitle ?? "Attendance correction";
    const reference = eventRecord?.eventCode ?? event?.code ?? classRecord?.subjectCode ?? request.attendanceRecordId;
    const scheduleSource = eventRecord ?? event;
    const eventSchedule = scheduleSource
      ? `${formatDisplayDate(scheduleSource.startsAt)} at ${formatDisplayTime(scheduleSource.startsAt)}`
      : undefined;
    const reviewDetail = request.reviewRemarks
      ? `Organizer note: ${request.reviewRemarks}`
      : request.reviewedAt
        ? `Reviewed ${formatDisplayDate(request.reviewedAt)}`
        : undefined;
    return {
      id: request.id,
      submittedAt: request.requestedAt,
      type: "attendance_correction",
      typeLabel: typeLabel("attendance_correction"),
      title,
      description: request.reason,
      status: request.status,
      reference,
      details: [
        `Requested status: ${correctionRequestTypeLabels[request.requestedStatus] ?? request.requestedStatus}`,
        eventSchedule ? `Event schedule: ${eventSchedule}` : undefined,
        reviewDetail
      ].filter(Boolean) as string[]
    };
  });

  const supportRows: RequestHistoryRow[] = (credentialRequestsQuery.data?.items ?? [])
    .filter((request) => request.studentId === student.id)
    .map((request) => ({
      id: request.id,
      submittedAt: request.requestedAt,
      type: request.requestType === "re_enrollment" ? "face_reenrollment" : "authentication_issue",
      typeLabel: typeLabel(request.requestType === "re_enrollment" ? "face_reenrollment" : "authentication_issue"),
      title: request.requestType === "re_enrollment" ? "Facial review request" : "Attendance issue report",
      description: request.reason,
      status: request.status,
      reference: request.credentialType === "facial" ? "Facial Recognition" : "Attendance Methods",
      details: [
        request.reviewRemarks ? `Reviewer note: ${request.reviewRemarks}` : undefined,
        request.reviewedAt ? `Reviewed ${formatDisplayDate(request.reviewedAt)}` : undefined
      ].filter(Boolean) as string[]
    }));

  const requestRows = [...correctionRows, ...supportRows].sort((left, right) => submittedTime(right.submittedAt) - submittedTime(left.submittedAt));

  const visibleRows = requestRows.filter((row) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [row.title, row.description, row.reference, row.typeLabel, row.status].some((value) => value.toLowerCase().includes(term));
    const matchesType = !typeFilter || row.type === typeFilter;
    const matchesStatus = !statusFilter || row.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const resolvedCount = requestRows.filter((row) => row.status === "approved" || row.status === "rejected" || row.status === "resolved").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Request History"
        description="Track submitted corrections, attendance issues, and facial review requests."
      />

      {hasPartialDataIssue ? (
        <section className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <p className="font-semibold text-warning">Some linked details are temporarily unavailable.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your submitted requests are still shown. Missing class or event names may appear as record references.
          </p>
        </section>
      ) : null}

      <section className={cn(cardShellClass, "p-0")}>
        <CardAccent />
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Submitted Requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {visibleRows.length} shown, {resolvedCount} completed.
            </p>
          </div>
          <StatusBadge label={`${requestRows.length} total`} tone="info" />
        </div>

        <div className="grid gap-3 border-t bg-surface-muted/30 p-5 md:grid-cols-[minmax(0,1fr)_220px_180px] md:p-6">
          <label className="flex h-11 items-center gap-3 rounded-xl border bg-background px-3 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Search request history"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent outline-none"
              placeholder="Search requests..."
            />
          </label>
          <label className="relative flex h-11 items-center">
            <FilePenLine className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Request type"
              className="plpass-select pl-9"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="">All request types</option>
              <option value="attendance_correction">Correction requests</option>
              <option value="authentication_issue">Attendance issues</option>
              <option value="face_reenrollment">Facial reviews</option>
            </select>
          </label>
          <label className="relative flex h-11 items-center">
            <ListFilter className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Request status"
              className="plpass-select pl-9"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
        </div>

        <div className="border-t p-5 pb-24 md:p-6 md:pb-24">
          {visibleRows.length ? (
            <div className="overflow-hidden rounded-2xl border bg-background">
              <div className="hidden grid-cols-[150px_190px_minmax(0,1fr)_150px] gap-4 border-b bg-surface-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Submitted</span>
                <span>Type</span>
                <span>Request</span>
                <span className="text-center">Status</span>
              </div>
              <div className="divide-y">
                {visibleRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="grid w-full gap-3 px-4 py-4 text-left transition hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:grid-cols-[150px_190px_minmax(0,1fr)_150px] md:items-center"
                    onClick={() => setSelectedRequest(row)}
                  >
                    <div>
                      <p className="text-sm font-semibold">{formatDisplayDate(row.submittedAt)}</p>
                      <p className="text-xs text-muted-foreground">{formatDisplayTime(row.submittedAt)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{row.typeLabel}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.reference}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold tracking-tight">{row.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{row.description}</p>
                      {row.details.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {row.details.map((detail) => (
                            <span key={detail} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                              {detail}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex md:justify-center">
                      <StatusBadge label={row.status} tone={statusTone(row.status)} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="No requests found" description="Try adjusting your filters or submit a request first." />
          )}
        </div>
      </section>

      {selectedRequest ? (
        <ModalShell
          open={Boolean(selectedRequest)}
          title={selectedRequest.title}
          description={`${selectedRequest.typeLabel} - ${selectedRequest.reference}`}
          size="lg"
          onClose={() => setSelectedRequest(null)}
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submitted</p>
                <p className="mt-1 font-semibold">{formatDisplayDate(selectedRequest.submittedAt)}</p>
                <p className="text-sm text-muted-foreground">{formatDisplayTime(selectedRequest.submittedAt)}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
                <div className="mt-2">
                  <StatusBadge label={selectedRequest.status} tone={statusTone(selectedRequest.status)} />
                </div>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request type</p>
                <p className="mt-1 font-semibold">{selectedRequest.typeLabel}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reference</p>
                <p className="mt-1 font-semibold">{selectedRequest.reference}</p>
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Student explanation</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{selectedRequest.description}</p>
            </div>

            {selectedRequest.details.length ? (
              <div className="rounded-2xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request details</p>
                <div className="mt-3 space-y-2">
                  {selectedRequest.details.map((detail) => (
                    <p key={detail} className="rounded-xl bg-surface-muted/60 px-3 py-2 text-sm text-muted-foreground">
                      {detail}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
