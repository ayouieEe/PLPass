import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock,
  FilePenLine,
  History,
  ListFilter,
  Lock,
  MessageSquareText,
  Search
} from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { ModalShell } from "@/components/modals/ModalShell";
import { Button } from "@/components/ui/button";
import { useAttendanceRecords, useAttendanceSessions, useCorrectionRequests, useEventObjectives, useEvents, useStudentEventFeedback, useSubmitLateReasonMutation } from "@/hooks/useRepositoryQueries";
import { formatDisplayDate, formatDisplayTime, toValidDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import {
  buildStudentEventWorkflow,
  correctionRequestTypeLabels,
  eventFromStudentRecord,
  getCorrectionRequestTypes,
  getStudentEventMetrics,
  getStudentEventRecords,
  getStudentFeedbackDeadlineStatus,
  lateReasonOptions,
  statusTone,
  studentVisibleEvents,
  StudentEventRecord,
  useStudentScope,
  type CorrectionRequestType
} from "@/features/student/studentExperience";

const cardShellClass = "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm";
const timeOnlyPattern = /^\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)?$/i;

function CardAccent() {
  return <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />;
}

function getDatedValue(value: string | undefined) {
  if (!value || timeOnlyPattern.test(value.trim())) return null;
  const date = toValidDate(value);
  return date && date.getFullYear() > 2000 ? date : null;
}

function getRecordDate(record: StudentEventRecord) {
  return getDatedValue(record.startsAt) ?? getDatedValue(record.recordedAt) ?? getDatedValue(record.endsAt);
}

function getRecordYear(record: StudentEventRecord) {
  return getRecordDate(record)?.getFullYear().toString() ?? "Date pending";
}

function formatRecordDate(record: StudentEventRecord) {
  return formatDisplayDate(getRecordDate(record), "Date pending");
}

function formatRecordTime(record: StudentEventRecord) {
  return formatDisplayTime(record.startsAt || record.recordedAt, "Time pending");
}

function getDefaultRequestType(status: StudentEventRecord["status"]) {
  return getCorrectionRequestTypes(status)[0] ?? "excused";
}

export function MyAttendancePage() {
  const scope = useStudentScope();
  const [searchParams] = useSearchParams();
  const focusedRecordId = searchParams.get("focus");
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const submitLateReasonMutation = useSubmitLateReasonMutation(scope.context);
  const feedbackQuery = useStudentEventFeedback(scope.student?.id, scope.context);
  const [selectedRecord, setSelectedRecord] = useState<StudentEventRecord | null>(null);
  const [lateReasonRecord, setLateReasonRecord] = useState<StudentEventRecord | null>(null);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "");
  const [requestType, setRequestType] = useState<CorrectionRequestType>("excused");
  const [explanation, setExplanation] = useState("");
  const [feedbackRecord, setFeedbackRecord] = useState<StudentEventRecord | null>(null);
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, number>>({});
  const [feedbackComment, setFeedbackComment] = useState("");
  const [openedFocus, setOpenedFocus] = useState<string | null>(null);
  const [feedbackDueModalOpen, setFeedbackDueModalOpen] = useState(false);
  const feedbackObjectivesQuery = useEventObjectives(feedbackRecord?.eventId, scope.context);

  useEffect(() => {
    setStatusFilter(searchParams.get("status") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!focusedRecordId || openedFocus === focusedRecordId || selectedRecord || !scope.student) {
      return;
    }

    if (eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading) {
      return;
    }

    const nextRecords = getStudentEventRecords({
      studentId: scope.student.id,
      records: recordsQuery.data?.items ?? [],
      sessions: sessionsQuery.data?.items ?? [],
      events: studentVisibleEvents(eventsQuery.data?.items ?? [])
    });
    const matchingRecord = nextRecords.find(
      (record) => record.eventId === focusedRecordId || record.id === focusedRecordId
    );

    if (!matchingRecord) {
      return;
    }

    setRequestType(getDefaultRequestType(matchingRecord.status));
    setExplanation("");
    setSelectedRecord(matchingRecord);
    setOpenedFocus(focusedRecordId);
  }, [
    eventsQuery.data?.items,
    eventsQuery.isLoading,
    focusedRecordId,
    openedFocus,
    recordsQuery.data?.items,
    recordsQuery.isLoading,
    scope.student,
    selectedRecord,
    sessionsQuery.data?.items,
    sessionsQuery.isLoading
  ]);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in account does not have an active student profile." />;
  }

  if (eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || correctionsQuery.isLoading) {
    return <LoadingState label="Loading attendance records" />;
  }

  if (eventsQuery.isError || sessionsQuery.isError || recordsQuery.isError || correctionsQuery.isError) {
    return <ErrorState title="Unable to load attendance records" message="Please try refreshing the page." />;
  }

  const student = scope.student;
  const records = getStudentEventRecords({
    studentId: student.id,
    records: recordsQuery.data?.items ?? [],
    sessions: sessionsQuery.data?.items ?? [],
    events: studentVisibleEvents(eventsQuery.data?.items ?? [])
  });
  const corrections = (correctionsQuery.data?.items ?? []).filter((request) => request.studentId === student.id);
  const events = studentVisibleEvents(eventsQuery.data?.items ?? []);
  const sessions = sessionsQuery.data?.items ?? [];
  const submittedFeedbackEventIds = new Set((feedbackQuery.data ?? []).map((feedback) => feedback.eventId));
  const metrics = getStudentEventMetrics(records);
  const attendedRecords = metrics.attendedRecords;
  const attendedCount = metrics.attendedCount;
  const pendingCorrections = corrections.filter((request) => request.status === "pending").length;
  const feedbackDue = attendedRecords.filter((record) => !record.feedbackSubmitted && !submittedFeedbackEventIds.has(record.eventId)).length;
  const pendingFeedbackRecords = attendedRecords.filter(
    (record) => !record.feedbackSubmitted && !submittedFeedbackEventIds.has(record.eventId)
  );
  const latestRecord = attendedRecords[0];
  const yearOptions = Array.from(new Set(attendedRecords.map((record) => getRecordYear(record))))
    .sort((first, second) => {
      if (first === "Date pending") return 1;
      if (second === "Date pending") return -1;
      return Number(second) - Number(first);
    });
  const visibleRecords = attendedRecords.filter((record) => {
    const term = search.trim().toLowerCase();
    const correction = corrections.find((request) => request.eventId === record.eventId);
    const displayStatus = correction?.status === "pending" ? "correction-pending" : record.status;
    const hasFeedbackDue = !record.feedbackSubmitted && !submittedFeedbackEventIds.has(record.eventId);
    const matchesSearch = !term || [record.eventName, record.eventCode, record.category, record.venue].some((value) => value.toLowerCase().includes(term));
    const matchesYear = !yearFilter || getRecordYear(record) === yearFilter;
    const matchesStatus = !statusFilter || (statusFilter === "feedback-due" ? hasFeedbackDue : displayStatus === statusFilter);
    return matchesSearch && matchesYear && matchesStatus;
  });
  const recordsByYear = visibleRecords.reduce<Array<{ year: string; records: StudentEventRecord[] }>>((groups, record) => {
    const year = getRecordYear(record);
    const existingGroup = groups.find((group) => group.year === year);
    if (existingGroup) {
      existingGroup.records.push(record);
    } else {
      groups.push({ year, records: [record] });
    }
    return groups;
  }, []);
  const selectedCorrection = selectedRecord ? corrections.find((request) => request.eventId === selectedRecord.eventId) : undefined;
  const selectedFeedbackSubmitted = selectedRecord ? selectedRecord.feedbackSubmitted || submittedFeedbackEventIds.has(selectedRecord.eventId) : false;
  const selectedEvent = selectedRecord ? events.find((entry) => entry.id === selectedRecord.eventId) ?? eventFromStudentRecord(selectedRecord) : undefined;
  const selectedSession = selectedRecord ? sessions.find((entry) => entry.eventId === selectedRecord.eventId) : undefined;
  const selectedRequestTypes = selectedRecord ? getCorrectionRequestTypes(selectedRecord.status) : [];
  const selectedWorkflow = selectedEvent && selectedRecord ? buildStudentEventWorkflow({
    event: selectedEvent,
    session: selectedSession,
    record: selectedRecord,
    feedbackSubmitted: Boolean(selectedFeedbackSubmitted),
    correctionStatus: selectedCorrection?.status
  }) : undefined;
  const feedbackObjectives = ((feedbackObjectivesQuery.data?.length ?? 0) > 0 ? feedbackObjectivesQuery.data ?? [] : []).slice(0, 3);
  const hasSupabaseObjectives = (feedbackObjectivesQuery.data?.length ?? 0) > 0;
  const displayObjectives = feedbackObjectives.slice(0, 3);
  const canSubmitFeedback = hasSupabaseObjectives
    ? feedbackObjectives.every((objective) => feedbackRatings[objective.id] > 0)
    : feedbackComment.trim().length >= 5;

  async function submitLateReason(reason: string) {
    if (!lateReasonRecord) return;
    try {
      await submitLateReasonMutation.mutateAsync({
        attendanceRecordId: lateReasonRecord.id,
        reason
      });
      if (selectedRecord?.eventId === lateReasonRecord.eventId) {
        setSelectedRecord({ ...selectedRecord, lateReason: reason });
      }
      setLateReasonRecord(null);
      toast.success("Late reason submitted to Supabase.");
    } catch {
      toast.error("Unable to submit late reason. Please try again.");
    }
  }

  function openRecordDetails(record: StudentEventRecord) {
    setRequestType(getDefaultRequestType(record.status));
    setExplanation("");
    setSelectedRecord(record);
  }

  function openFeedbackDueRecord(record: StudentEventRecord) {
    setFeedbackDueModalOpen(false);
    openRecordDetails(record);
  }

  function openFeedback(record: StudentEventRecord) {
    setFeedbackRecord(record);
    setFeedbackRatings({});
    setFeedbackComment("");
  }

  async function submitFeedback() {
    if (!feedbackRecord) return;
    if (hasSupabaseObjectives && !feedbackObjectives.every((objective) => feedbackRatings[objective.id] > 0)) {
      toast.error("Please rate every event objective.");
      return;
    }
    if (!hasSupabaseObjectives && feedbackComment.trim().length < 5) {
      toast.error("Please write a short overall feedback comment.");
      return;
    }

    try {
      await feedbackQuery.submitMutation.mutateAsync({
        eventId: feedbackRecord.eventId,
        studentId: student.id,
        attendanceRecordId: feedbackRecord.id,
        comment: feedbackComment,
        ratings: hasSupabaseObjectives
          ? feedbackObjectives.map((objective) => ({
              objectiveId: objective.id,
              rating: feedbackRatings[objective.id]
            }))
          : []
      });
      if (selectedRecord?.eventId === feedbackRecord.eventId) {
        setSelectedRecord({ ...selectedRecord, feedbackSubmitted: true });
      }
      setFeedbackRecord(null);
      setFeedbackRatings({});
      setFeedbackComment("");
      toast.success("Event feedback submitted to Supabase. Attendance is now complete.");
    } catch {
      toast.error("Unable to submit feedback. Please try again.");
    }
  }

  async function submitCorrection() {
    if (!selectedRecord) return;
    const requestTypes = getCorrectionRequestTypes(selectedRecord.status);
    if (!requestTypes.includes(requestType)) {
      toast.error("Select a valid correction type for this attendance status.");
      return;
    }
    if (explanation.trim().length < 12) {
      toast.error("Please provide a clear explanation.");
      return;
    }

    try {
      await correctionsQuery.createMutation.mutateAsync({
        studentId: student.id,
        attendanceRecordId: selectedRecord.id,
        eventId: selectedRecord.eventId,
        requestedStatus: requestType,
        reason: explanation.trim()
      });
      toast.success("Correction request submitted.");
      setExplanation("");
    } catch {
      toast.error("Unable to submit correction request.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Attendance"
        title="Attendance Records"
        description="Review attended events grouped by year, then open details for feedback and correction status."
      />

      <section className={cn(cardShellClass, "p-0")}>
        <CardAccent />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
              <History className="h-5 w-5 text-primary" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance summary</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{attendedCount} attended events</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {latestRecord
                  ? `Most recent attended event: ${latestRecord.eventName} on ${formatRecordDate(latestRecord)}.`
                  : "Present and late event attendance will appear here once recorded."}
              </p>
            </div>
          </div>
          <StatusBadge label="Yearly list" tone="info" />
        </div>

        <div className="grid gap-4 border-t bg-surface-muted/30 p-5 md:grid-cols-4 md:p-6">
          <div className="rounded-2xl border bg-surface p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarCheck className="h-3.5 w-3.5 text-primary" />
              Attended
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{attendedCount}</p>
          </div>
          <div className="rounded-2xl border bg-surface p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5 text-primary" />
              Years Shown
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{recordsByYear.length}</p>
          </div>
          <div className="rounded-2xl border bg-surface p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FilePenLine className="h-3.5 w-3.5 text-warning" />
              Corrections
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{pendingCorrections}</p>
          </div>
          <button
            type="button"
            aria-label="Open feedback due tasks"
            onClick={() => setFeedbackDueModalOpen(true)}
            className={cn(
              "group relative overflow-hidden rounded-2xl border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              feedbackDue ? "border-primary/30 bg-primary/10" : "bg-surface"
            )}
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/80 via-primary/30 to-transparent opacity-80" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <MessageSquareText className="h-3.5 w-3.5 text-primary" />
                  Feedback Due
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{feedbackDue}</p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-primary shadow-sm transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-background/80 px-3 py-2">
              <span className="text-xs font-semibold text-foreground">
                {feedbackDue ? "View feedback tasks" : "Open feedback panel"}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground">Click</span>
            </div>
          </button>
        </div>

        <div className="grid gap-3 border-t p-5 md:grid-cols-[minmax(0,1fr)_180px_240px] md:p-6">
          <label className="flex h-11 items-center gap-3 rounded-xl border bg-background px-3 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Search attendance records"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent outline-none"
              placeholder="Search event records..."
            />
          </label>
          <label className="relative flex h-11 items-center">
            <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Attendance year"
              className="plpass-select pl-9"
              value={yearFilter}
              onChange={(event) => setYearFilter(event.target.value)}
            >
              <option value="">All years</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="relative flex h-11 items-center">
            <ListFilter className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <select
              aria-label="Attendance status"
              className="plpass-select pl-9"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All record statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="feedback-due">Feedback Due</option>
              <option value="correction-pending">Correction Pending</option>
            </select>
          </label>
        </div>
      </section>

      {statusFilter === "feedback-due" ? (
        <section className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Feedback due</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open a record, then choose <span className="font-semibold text-foreground">Answer Event Feedback</span> to complete that attendance.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => setStatusFilter("")}>Show all records</Button>
          </div>
        </section>
      ) : null}

      <section className={cardShellClass}>
        <CardAccent />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Attended Events by Year</h2>
            <p className="mt-1 text-sm text-muted-foreground">Present and late event attendance, grouped by event year from newest to oldest.</p>
          </div>
          <StatusBadge label={`${visibleRecords.length} attended`} tone="info" />
        </div>

        <div className="mt-6">
          {recordsByYear.length ? (
            <div className="space-y-5">
              {recordsByYear.map((group) => (
                <section key={group.year} className="rounded-2xl border bg-background/60 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-muted/50 px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Year</p>
                      <h3 className="text-2xl font-semibold tracking-tight">{group.year}</h3>
                    </div>
                    <StatusBadge
                      label={`${group.records.length} event${group.records.length === 1 ? "" : "s"}`}
                      tone="info"
                    />
                  </div>

                  <div className="mt-4 space-y-4">
                    {group.records.map((record, index) => {
                const correction = corrections.find((request) => request.eventId === record.eventId);
                const displayStatus = correction?.status === "pending" ? "correction-pending" : record.status;
                const event = events.find((entry) => entry.id === record.eventId);
                const session = sessions.find((entry) => entry.eventId === record.eventId);
                const workflow = event ? buildStudentEventWorkflow({
                  event,
                  session,
                  record,
                  feedbackSubmitted: Boolean(record.feedbackSubmitted || submittedFeedbackEventIds.has(record.eventId)),
                  correctionStatus: correction?.status
                }) : undefined;
                const eventDate = getRecordDate(record);
                const monthLabel = !eventDate
                  ? "Date"
                  : eventDate.toLocaleDateString(undefined, { month: "short" });
                const dayLabel = eventDate ? String(eventDate.getDate()).padStart(2, "0") : "--";
                return (
                  <article key={record.id} className="relative grid gap-3 sm:grid-cols-[5.5rem_2.5rem_minmax(0,1fr)]">
                    <div className="hidden rounded-xl border bg-surface p-3 text-center sm:block">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{monthLabel}</p>
                      <p className="mt-0.5 text-2xl font-semibold leading-none tracking-tight text-foreground">{dayLabel}</p>
                      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{formatRecordTime(record)}</p>
                    </div>

                    <div className="relative hidden sm:flex sm:justify-center">
                      {index < group.records.length - 1 ? (
                        <span className="absolute bottom-[-1.25rem] top-10 w-px bg-border" aria-hidden="true" />
                      ) : null}
                      <span className={cn(
                        "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-4 border-surface bg-primary/10 text-primary shadow-sm",
                        displayStatus === "late" && "bg-warning/10 text-warning",
                        displayStatus === "absent" && "bg-danger/10 text-danger",
                        displayStatus === "correction-pending" && "bg-info/10 text-info"
                      )}>
                        <CalendarDays className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="min-w-0 rounded-2xl border bg-background p-4 shadow-sm transition-colors hover:border-primary/30">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground sm:hidden">
                            <CalendarDays className="h-4 w-4 text-primary" />
                            <span>{formatRecordDate(record)}</span>
                            <span>{formatRecordTime(record)}</span>
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {record.eventCode} - {record.category}
                          </p>
                          <h3 className="mt-1 text-lg font-semibold tracking-tight">{record.eventName}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <CalendarDays className="h-4 w-4 text-primary" />
                              {formatRecordDate(record)}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-4 w-4 text-primary" />
                              {formatRecordTime(record)}
                            </span>
                          </div>
                        </div>
                        <StatusBadge label={displayStatus} tone={statusTone(displayStatus)} />
                      </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                        <p className="text-sm text-muted-foreground">{workflow?.nextActionDescription ?? "Review attendance status."}</p>
                        <Button size="sm" variant="outline" onClick={() => openRecordDetails(record)}>
                          View Details
                        </Button>
                      </div>
                    </div>
                  </article>
                );
                    })}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState title="No attended events" description="Present and late event attendance will appear here, grouped by year." />
          )}
        </div>
      </section>

      <ModalShell
        open={feedbackDueModalOpen}
        title="Pending Feedback"
        description="Open the exact attendance record that still needs your action."
        size="lg"
        onClose={() => setFeedbackDueModalOpen(false)}
      >
        {pendingFeedbackRecords.length ? (
          <div className="space-y-3">
            {pendingFeedbackRecords.map((record) => {
              const needsLateReason = record.status === "late" && !record.lateReason;
              const deadline = getStudentFeedbackDeadlineStatus(record);

              return (
                <article key={record.id} className="rounded-2xl border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {record.eventCode} - {record.category}
                      </p>
                      <h3 className="mt-1 text-base font-semibold tracking-tight">{record.eventName}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-primary" />
                          {formatRecordDate(record)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          {formatRecordTime(record)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <StatusBadge label={record.status} tone={statusTone(record.status)} />
                      <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                        {needsLateReason ? "Late reason first" : "Feedback due"}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          deadline.isOverdue ? "bg-destructive/10 text-destructive" : deadline.isDueSoon ? "bg-warning/10 text-warning" : "bg-info/10 text-info"
                        }`}
                      >
                        {deadline.label}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {needsLateReason
                        ? "Submit your late reason first. The event feedback unlocks after that."
                        : "Answer the event feedback to complete this attendance record."}
                    </p>
                    <Button type="button" size="sm" onClick={() => openFeedbackDueRecord(record)}>
                      {needsLateReason ? "Submit Late Reason" : "Answer Feedback"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-success/20 bg-success/10 p-5">
            <p className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" />
              No pending feedback right now.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Completed attendance records are already settled.</p>
          </div>
        )}
      </ModalShell>

      {selectedRecord ? (
        <ModalShell
          open={Boolean(selectedRecord)}
          title={selectedRecord.eventName}
          description={`${selectedRecord.eventCode} - ${selectedRecord.venue}`}
          size="lg"
          onClose={() => setSelectedRecord(null)}
        >
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time In</p>
                <p className="mt-1 font-semibold">{selectedWorkflow?.timeInLabel ?? formatDisplayTime(selectedRecord.recordedAt)}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time Out</p>
                <p className="mt-1 font-semibold">{selectedWorkflow?.timeOutLabel ?? "Not recorded"}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Authentication Source</p>
                <p className="mt-1 font-semibold">Organizer recorded via {selectedRecord.method}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Feedback Status</p>
                <p className="mt-1 font-semibold">{selectedWorkflow?.feedbackLabel ?? (selectedFeedbackSubmitted ? "Submitted" : "Locked")}</p>
              </div>
              <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance Completion</p>
                <p className="mt-1 font-semibold">{selectedWorkflow?.attendanceLabel ?? "Review required"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedWorkflow?.nextActionDescription ?? "Open the required action to complete this record."}
                </p>
              </div>
              <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session Information</p>
                <p className="mt-1 font-semibold">{formatDisplayDate(selectedRecord.startsAt)} {formatDisplayTime(selectedRecord.startsAt)} - {formatDisplayTime(selectedRecord.endsAt)}</p>
              </div>
              {selectedRecord.status === "late" ? (
                <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Late Reason</p>
                      <p className="mt-1 font-semibold">{selectedRecord.lateReason ?? "Required before feedback unlocks"}</p>
                      {selectedRecord.lateReason ? (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" />
                          Locked after submission.
                        </p>
                      ) : null}
                    </div>
                    {!selectedRecord.lateReason ? (
                      <Button variant="outline" size="sm" onClick={() => setLateReasonRecord(selectedRecord)}>
                        Submit Reason
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {selectedWorkflow?.requiresLateReason ? (
                <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 sm:col-span-2">
                  <p className="font-semibold text-warning">Late reason required</p>
                  <p className="mt-1 text-sm text-muted-foreground">Submit your late reason first. Event feedback unlocks after this step.</p>
                </div>
              ) : null}
              {selectedWorkflow?.canSubmitFeedback ? (
                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Event feedback required</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Answer the event feedback to complete this attendance record. {getStudentFeedbackDeadlineStatus(selectedRecord).label}.
                      </p>
                    </div>
                    <Button type="button" onClick={() => openFeedback(selectedRecord)}>
                      <MessageSquareText className="h-4 w-4" />
                      Answer Event Feedback
                    </Button>
                  </div>
                </div>
              ) : null}
              {selectedFeedbackSubmitted ? (
                <div className="rounded-2xl border border-success/20 bg-success/10 p-4 sm:col-span-2">
                  <p className="flex items-center gap-2 font-semibold text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    Feedback submitted. Attendance is complete.
                  </p>
                </div>
              ) : null}
              <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correction Request Status</p>
                <p className="mt-1 font-semibold">{selectedCorrection?.status ?? "No request submitted"}</p>
              </div>
            </div>

            {selectedRequestTypes.length ? (
            <div className="mt-6 rounded-2xl border bg-background p-5">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Request Attendance Correction</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Event Code</span>
                  <input className="plpass-field h-10 w-full rounded-lg border px-3 text-sm" value={selectedRecord.eventCode} readOnly />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Event Name</span>
                  <input className="plpass-field h-10 w-full rounded-lg border px-3 text-sm" value={selectedRecord.eventName} readOnly />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium">Request Type</span>
                  <select className="plpass-select h-10 rounded-lg" value={requestType} onChange={(event) => setRequestType(event.target.value as CorrectionRequestType)}>
                    {selectedRequestTypes.map((type) => (
                      <option key={type} value={type}>{correctionRequestTypeLabels[type]}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Explanation</span>
                  <textarea className="plpass-field min-h-24 w-full rounded-lg border p-3 text-sm" value={explanation} onChange={(event) => setExplanation(event.target.value)} />
                </label>
              </div>
              <Button className="mt-4" onClick={submitCorrection}>Submit Request</Button>
            </div>
            ) : null}
        </ModalShell>
      ) : null}

      {lateReasonRecord ? (
        <ModalShell
          open={Boolean(lateReasonRecord)}
          title="Late Reason"
          description="Select the reason for your late Time In."
          size="sm"
          onClose={() => setLateReasonRecord(null)}
        >
            <div className="mt-5 grid gap-2">
              {lateReasonOptions.map((reason) => (
                <Button key={reason} type="button" variant="outline" className="justify-start" onClick={() => submitLateReason(reason)}>
                  {reason}
                </Button>
              ))}
            </div>
        </ModalShell>
      ) : null}

      {feedbackRecord ? (
        <ModalShell
          open={Boolean(feedbackRecord)}
          title="Event Feedback"
          description="Rate each event objective to complete your attendance."
          size="lg"
          onClose={() => setFeedbackRecord(null)}
        >
          <div className="mt-5 space-y-4">
            {!hasSupabaseObjectives ? (
              <p className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-muted-foreground">
                Objective ratings are not configured for this event yet. You can still submit your overall feedback below.
              </p>
            ) : null}
            {displayObjectives.map((objective, index) => (
              <div key={objective.id} className="rounded-xl border bg-background p-4">
                <p className="text-sm font-semibold">Objective {index + 1}</p>
                <p className="mt-1 text-sm text-muted-foreground">{objective.text}</p>
                {hasSupabaseObjectives ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <Button
                        key={rating}
                        type="button"
                        size="sm"
                        variant={feedbackRatings[objective.id] === rating ? "default" : "outline"}
                        onClick={() => setFeedbackRatings((current) => ({ ...current, [objective.id]: rating }))}
                      >
                        {rating}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Comment</span>
              <textarea
                className="plpass-field min-h-24 w-full rounded-lg border p-3 text-sm"
                value={feedbackComment}
                onChange={(event) => setFeedbackComment(event.target.value)}
                placeholder="Share anything useful about the event."
              />
            </label>
            <Button type="button" className="w-full sm:w-auto" onClick={submitFeedback} disabled={feedbackQuery.submitMutation.isPending || !canSubmitFeedback}>
              {feedbackQuery.submitMutation.isPending ? "Submitting..." : "Submit Event Feedback"}
            </Button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
