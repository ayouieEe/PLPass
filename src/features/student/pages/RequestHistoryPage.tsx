import { useState } from "react";
import { ClipboardList, FilePenLine, History, ListFilter, MessageSquareWarning, Search } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { useAttendanceRecords, useAttendanceSessions, useClasses, useCorrectionRequests, useEvents } from "@/hooks/useRepositoryQueries";
import { formatDisplayDate, formatDisplayTime, toValidDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import {
  getStudentEventRecords,
  loadStudentCorrectionRequests,
  loadStudentSupportRequests,
  useStudentScope,
  type StudentRequestKind
} from "@/features/student/studentExperience";
import type { CorrectionRequestStatus } from "@/types/enums";

type RequestHistoryRow = {
  id: string;
  submittedAt: string;
  type: StudentRequestKind;
  typeLabel: string;
  title: string;
  description: string;
  status: CorrectionRequestStatus;
  reference: string;
};

const cardShellClass = "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm";

function CardAccent() {
  return <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />;
}

function statusTone(status: CorrectionRequestStatus) {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

function typeLabel(type: StudentRequestKind) {
  if (type === "attendance_correction") return "Correction Request";
  if (type === "authentication_issue") return "Authentication Issue";
  return "Re-enrollment Request";
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
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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
    correctionsQuery.isLoading
  ) {
    return <LoadingState label="Loading request history" />;
  }

  const student = scope.student;
  const hasPartialDataIssue = classesQuery.isError || eventsQuery.isError || sessionsQuery.isError || recordsQuery.isError || correctionsQuery.isError;
  const classes = classesQuery.data?.items ?? [];
  const events = eventsQuery.data?.items ?? [];
  const sessions = sessionsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const studentEventRecords = getStudentEventRecords({
    studentId: student.id,
    records,
    sessions,
    events
  });

  const correctionRows: RequestHistoryRow[] = [
    ...loadStudentCorrectionRequests(student.id),
    ...(correctionsQuery.data?.items ?? [])
  ].map((request) => {
    const eventRecord = studentEventRecords.find(
      (record) => record.id === request.attendanceRecordId || record.eventId === request.eventId
    );
    const classRecord = classes.find((entry) => entry.id === request.classId);
    const event = events.find((entry) => entry.id === request.eventId);
    const title = eventRecord?.eventName ?? event?.title ?? classRecord?.subjectTitle ?? "Attendance correction";
    const reference = eventRecord?.eventCode ?? event?.code ?? classRecord?.subjectCode ?? request.attendanceRecordId;
    return {
      id: request.id,
      submittedAt: request.requestedAt,
      type: "attendance_correction",
      typeLabel: typeLabel("attendance_correction"),
      title,
      description: request.reason,
      status: request.status,
      reference
    };
  });

  const supportRows: RequestHistoryRow[] = loadStudentSupportRequests(student.id).map((request) => ({
    id: request.id,
    submittedAt: request.submittedAt,
    type: request.kind,
    typeLabel: typeLabel(request.kind),
    title: request.title,
    description: request.description,
    status: request.status,
    reference: request.kind === "authentication_issue" ? "Attendance Methods" : "Facial Recognition"
  }));

  const requestRows = [...correctionRows, ...supportRows].sort((left, right) => submittedTime(right.submittedAt) - submittedTime(left.submittedAt));

  const visibleRows = requestRows.filter((row) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [row.title, row.description, row.reference, row.typeLabel, row.status].some((value) => value.toLowerCase().includes(term));
    const matchesType = !typeFilter || row.type === typeFilter;
    const matchesStatus = !statusFilter || row.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const pendingCount = requestRows.filter((row) => row.status === "pending").length;
  const resolvedCount = requestRows.filter((row) => row.status === "approved" || row.status === "rejected").length;
  const issueCount = requestRows.filter((row) => row.type !== "attendance_correction").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Student Requests"
        title="Request History"
        description="Track correction requests, authentication issues, and re-enrollment requests you have submitted."
      />

      {hasPartialDataIssue ? (
        <section className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <p className="font-semibold text-warning">Some linked details are temporarily unavailable.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your submitted requests are still shown. Missing class or event names may appear as record references.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total Requests" value={String(requestRows.length)} description="All submitted concerns" icon={ClipboardList} />
        <StatCard title="Pending" value={String(pendingCount)} description="Awaiting organizer review" icon={History} tone={pendingCount ? "warning" : "success"} />
        <StatCard title="Issues Reported" value={String(issueCount)} description="Authentication and re-enrollment" icon={MessageSquareWarning} />
      </section>

      <section className={cn(cardShellClass, "p-0")}>
        <CardAccent />
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Submitted Requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {visibleRows.length} shown, {resolvedCount} resolved.
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
              <option value="attendance_correction">Correction Requests</option>
              <option value="authentication_issue">Authentication Issues</option>
              <option value="face_reenrollment">Re-enrollment Requests</option>
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
            </select>
          </label>
        </div>

        <div className="border-t p-5 md:p-6">
          {visibleRows.length ? (
            <div className="overflow-hidden rounded-2xl border bg-background">
              <div className="hidden grid-cols-[150px_190px_minmax(0,1fr)_130px] gap-4 border-b bg-surface-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
                <span>Submitted</span>
                <span>Type</span>
                <span>Request</span>
                <span>Status</span>
              </div>
              <div className="divide-y">
                {visibleRows.map((row) => (
                  <article key={row.id} className="grid gap-3 px-4 py-4 md:grid-cols-[150px_190px_minmax(0,1fr)_130px] md:items-center">
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
                    </div>
                    <div className="flex md:justify-end">
                      <StatusBadge label={row.status} tone={statusTone(row.status)} />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState title="No requests found" description="Try adjusting your filters or submit a request first." />
          )}
        </div>
      </section>
    </div>
  );
}
