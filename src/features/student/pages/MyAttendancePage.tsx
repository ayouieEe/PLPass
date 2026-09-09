import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FilePenLine,
  ListFilter,
  Lock,
  MessageSquareText,
  Paperclip,
  Search,
  X
} from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { ModalShell } from "@/components/modals/ModalShell";
import { Button } from "@/components/ui/button";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { useAttendanceRecords, useAttendanceSessions, useCorrectionRequests, useEvents, useFinalizedEventYears, useLateReasonOptions, useStudentEventFeedback, useStudentFeedbackTasks, useSubmitLateReasonMutation } from "@/hooks/useRepositoryQueries";
import { formatDisplayDate, formatDisplayTime, toValidDate } from "@/lib/utils/date";
import { getErrorMessage } from "@/lib/utils/errors";
import { cn } from "@/lib/utils/cn";
import { optimizeImageForUpload } from "@/lib/utils/imageCompression";
import {
  buildStudentEventWorkflow,
  correctionRequestTypeLabels,
  eventFromStudentRecord,
  getCorrectionRequestTypes,
  getStudentEventMetrics,
  getStudentEventRecords,
  statusTone,
  studentVisibleEvents,
  StudentEventRecord,
  useStudentScope,
  type CorrectionRequestType
} from "@/features/student/studentExperience";

const cardShellClass = "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm";
const timeOnlyPattern = /^\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)?$/i;
const correctionProofMaxBytes = 5 * 1024 * 1024;
const emojiRatings = [
  { value: 1, emoji: "😞", label: "Needs improvement" }, { value: 2, emoji: "🙁", label: "Below expectations" }, { value: 3, emoji: "😐", label: "Okay" }, { value: 4, emoji: "🙂", label: "Good" }, { value: 5, emoji: "🤩", label: "Excellent" }
];
const acceptedCorrectionProofTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const correctionProofImageTypes = ["image/png", "image/jpeg", "image/webp"];

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

function formatAttendanceMethod(method: string) {
  const normalized = method.toLowerCase();
  if (normalized === "qr") return "QR scan";
  if (normalized === "facial") return "Facial verification";
  if (normalized === "manual") return "Manual organizer entry";
  if (normalized === "online") return "Online attendance";
  return method;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MyAttendancePage() {
  const scope = useStudentScope();
  const [searchParams] = useSearchParams();
  const focusedRecordId = searchParams.get("focus");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "");
  const [yearFilter, setYearFilter] = useState("");
  const [recordsPage, setRecordsPage] = useState(0);
  const attendanceStatusFilter = ["present", "late", "absent", "excused"].includes(statusFilter)
    ? statusFilter as "present" | "late" | "absent" | "excused"
    : undefined;
  const eventsQuery = useEvents({ pageSize: 25 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 25 }, scope.context);
  const recordsQuery = useAttendanceRecords({
    pageIndex: recordsPage,
    pageSize: 25,
    attendanceStatus: attendanceStatusFilter,
    dateFrom: yearFilter ? `${yearFilter}-01-01T00:00:00+08:00` : undefined,
    dateTo: yearFilter ? `${Number(yearFilter) + 1}-01-01T00:00:00+08:00` : undefined
  }, scope.context);
  const finalizedEventYearsQuery = useFinalizedEventYears(scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const submitLateReasonMutation = useSubmitLateReasonMutation(scope.context);
  const lateReasonOptionsQuery = useLateReasonOptions(undefined, scope.context);
  const lateReasonOptions = lateReasonOptionsQuery.data ?? [];
  const feedbackQuery = useStudentEventFeedback(scope.student?.id, scope.context);
  const feedbackTasksQuery = useStudentFeedbackTasks(scope.student?.id, scope.context);
  const [selectedRecord, setSelectedRecord] = useState<StudentEventRecord | null>(null);
  const [lateReasonRecord, setLateReasonRecord] = useState<StudentEventRecord | null>(null);
  const [selectedLateReasonCategory, setSelectedLateReasonCategory] = useState<string>("");
  const [customLateReason, setCustomLateReason] = useState<string>("");
  const [search, setSearch] = useState("");
  const [requestType, setRequestType] = useState<CorrectionRequestType>("excused");
  const [explanation, setExplanation] = useState("");
  const [feedbackRecord, setFeedbackRecord] = useState<StudentEventRecord | null>(null);
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, number>>({});
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackStep, setFeedbackStep] = useState(0);
  const [openedFocus, setOpenedFocus] = useState<string | null>(null);
  const [feedbackDueModalOpen, setFeedbackDueModalOpen] = useState(false);
  const [correctionFormOpen, setCorrectionFormOpen] = useState(false);
  const [correctionProofFile, setCorrectionProofFile] = useState<File | null>(null);
  const [correctionProofError, setCorrectionProofError] = useState("");
  const [correctionProofNotice, setCorrectionProofNotice] = useState("");
  const [isCompressingCorrectionProof, setIsCompressingCorrectionProof] = useState(false);
  const [correctionProofInputKey, setCorrectionProofInputKey] = useState(0);
  const correctionProofSelectionId = useRef(0);
  const correctionProofInputId = `correction-proof-${selectedRecord?.id ?? "new"}`;

  useEffect(() => {
    setStatusFilter(searchParams.get("status") ?? "");
  }, [searchParams]);

  useEffect(() => {
    setRecordsPage(0);
  }, [search, yearFilter, statusFilter]);

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
    setCorrectionFormOpen(false);
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
  const feedbackTasks = feedbackTasksQuery.data ?? [];
  const taskForRecord = (record: StudentEventRecord | null | undefined) => feedbackTasks.find((task) => task.attendanceRecordId === record?.id);
  const isTaskActionable = (record: StudentEventRecord) => {
    const task = taskForRecord(record);
    return task?.status === "pending" && new Date(task.dueAt).getTime() > Date.now();
  };
  const metrics = getStudentEventMetrics(records);
  const attendedRecords = metrics.attendedRecords;
  const isFeedbackSubmitted = (record: StudentEventRecord) => taskForRecord(record)?.status === "completed";
  const needsLateReason = (record: StudentEventRecord) => record.status === "late" && !record.lateReason;
  const needsFeedback = (record: StudentEventRecord) => (record.status === "present" || record.status === "late") && !needsLateReason(record) && !isFeedbackSubmitted(record);
  const isCompletedAttendedRecord = (record: StudentEventRecord) => (
    (record.status === "present" || record.status === "late")
    && !needsLateReason(record)
    && isFeedbackSubmitted(record)
  );
  const pendingTaskRecords = attendedRecords.filter((record) => isTaskActionable(record) && (needsLateReason(record) || needsFeedback(record)));
  const finalizedRecords = records.filter((record) => (
    record.status === "absent"
    || record.status === "excused"
    || isCompletedAttendedRecord(record)
  ));
  const pendingTaskCount = pendingTaskRecords.length;
  const yearOptions = (finalizedEventYearsQuery.data ?? []).map(String);
  const visibleRecords = finalizedRecords.filter((record) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [record.eventName, record.eventCode, record.category, record.venue].some((value) => value.toLowerCase().includes(term));
    const matchesYear = !yearFilter || getRecordYear(record) === yearFilter;
    const matchesStatus = !statusFilter || record.status === statusFilter;
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
  const selectedFeedbackTask = taskForRecord(selectedRecord);
  const selectedFeedbackSubmitted = selectedFeedbackTask?.status === "completed";
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
  const feedbackTask = taskForRecord(feedbackRecord);
  const feedbackObjectives = feedbackTask?.objectives ?? [];
  const hasConfiguredObjectives = feedbackObjectives.length > 0;
  const canSubmitFeedback = hasConfiguredObjectives && feedbackObjectives.every((objective) => feedbackRatings[objective.id] > 0);

  async function submitLateReason() {
    if (!lateReasonRecord || !selectedLateReasonCategory) return;
    const selectedOption = lateReasonOptions.find((option) => option.id === selectedLateReasonCategory);
    if (!selectedOption) return;
    if (selectedOption.code === "other" && customLateReason.trim().length < 5) {
      toast.error("Please provide a more detailed reason.");
      return;
    }
    try {
      await submitLateReasonMutation.mutateAsync({
        attendanceRecordId: lateReasonRecord.id,
        reasonOptionId: selectedOption.id,
        customReason: customLateReason.trim() || undefined
      });
      if (selectedRecord?.eventId === lateReasonRecord.eventId) {
        setSelectedRecord({ ...selectedRecord, lateReason: selectedOption.label, lateReasonCategory: selectedOption.label });
      }
      setLateReasonRecord(null);
      setSelectedLateReasonCategory("");
      setCustomLateReason("");
      toast.success("Late reason submitted.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  function openRecordDetails(record: StudentEventRecord) {
    setRequestType(getDefaultRequestType(record.status));
    setExplanation("");
    setCorrectionFormOpen(false);
    resetCorrectionProofFile();
    setSelectedRecord(record);
  }

  function openFeedbackDueRecord(record: StudentEventRecord) {
    setFeedbackDueModalOpen(false);
    openRecordDetails(record);
  }

  function openFeedback(record: StudentEventRecord) {
    if (!taskForRecord(record) || taskForRecord(record)?.status !== "pending") {
      toast.error("Feedback is not available for this attendance record.");
      return;
    }
    setFeedbackRecord(record);
    setFeedbackRatings({});
    setFeedbackComment("");
    setFeedbackStep(0);
  }

  function resetCorrectionProofFile() {
    correctionProofSelectionId.current += 1;
    setCorrectionProofFile(null);
    setCorrectionProofError("");
    setCorrectionProofNotice("");
    setIsCompressingCorrectionProof(false);
    setCorrectionProofInputKey((key) => key + 1);
  }

  async function handleCorrectionProofChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const selectionId = ++correctionProofSelectionId.current;
    setCorrectionProofError("");
    setCorrectionProofNotice("");

    if (!file) {
      setCorrectionProofFile(null);
      setIsCompressingCorrectionProof(false);
      return;
    }

    if (!acceptedCorrectionProofTypes.includes(file.type)) {
      setCorrectionProofFile(null);
      setCorrectionProofError("Use a PNG, JPG, WebP, or PDF file.");
      setIsCompressingCorrectionProof(false);
      setCorrectionProofInputKey((key) => key + 1);
      return;
    }

    if (file.size <= correctionProofMaxBytes) {
      setCorrectionProofFile(file);
      setIsCompressingCorrectionProof(false);
      return;
    }

    if (!correctionProofImageTypes.includes(file.type)) {
      setCorrectionProofFile(null);
      setCorrectionProofError("PDF proof files must be 5 MB or smaller.");
      setIsCompressingCorrectionProof(false);
      setCorrectionProofInputKey((key) => key + 1);
      return;
    }

    setCorrectionProofFile(null);
    setIsCompressingCorrectionProof(true);
    try {
      const optimized = await optimizeImageForUpload(file, { maxBytes: correctionProofMaxBytes });
      if (selectionId !== correctionProofSelectionId.current) return;
      if (optimized.file.size > correctionProofMaxBytes) {
        throw new Error("This image could not be reduced below 5 MB. Please choose a smaller image.");
      }
      setCorrectionProofFile(optimized.file);
      setCorrectionProofNotice(`Image optimized from ${formatFileSize(file.size)} to ${formatFileSize(optimized.file.size)}.`);
    } catch (error) {
      if (selectionId !== correctionProofSelectionId.current) return;
      setCorrectionProofFile(null);
      setCorrectionProofError(getErrorMessage(error));
      setCorrectionProofInputKey((key) => key + 1);
    } finally {
      if (selectionId === correctionProofSelectionId.current) setIsCompressingCorrectionProof(false);
    }
  }

  async function submitFeedback() {
    if (!feedbackRecord) return;
    if (!feedbackTask || !hasConfiguredObjectives || !feedbackObjectives.every((objective) => feedbackRatings[objective.id] > 0)) {
      toast.error("Please rate every event objective.");
      return;
    }
    try {
      await feedbackQuery.submitMutation.mutateAsync({
        taskId: feedbackTask.id,
        eventId: feedbackRecord.eventId,
        studentId: student.id,
        attendanceRecordId: feedbackRecord.id,
        comment: feedbackComment,
        ratings: feedbackObjectives.map((objective) => ({
          objectiveId: objective.id,
          rating: feedbackRatings[objective.id]
        }))
      });
      if (selectedRecord?.eventId === feedbackRecord.eventId) {
        setSelectedRecord({ ...selectedRecord, feedbackSubmitted: true });
      }
      setFeedbackRecord(null);
      setFeedbackRatings({});
      setFeedbackComment("");
      setFeedbackStep(0);
      toast.success("Event feedback submitted. Attendance is now complete.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function submitCorrection() {
    if (!selectedRecord) return;
    if (isCompressingCorrectionProof) {
      toast.error("Wait for the proof image to finish optimizing.");
      return;
    }
    const requestTypes = getCorrectionRequestTypes(selectedRecord.status);
    if (!requestTypes.includes(requestType)) {
      toast.error("Select a valid correction type for this attendance status.");
      return;
    }
    if (explanation.trim().length < 12) {
      toast.error("Please provide a clear explanation.");
      return;
    }
    if (!correctionProofFile) {
      toast.error("Please attach proof for the correction request.");
      return;
    }

    try {
      await correctionsQuery.createMutation.mutateAsync({
        studentId: student.id,
        attendanceRecordId: selectedRecord.id,
        eventId: selectedRecord.eventId,
        requestedStatus: requestType,
        reason: explanation.trim(),
        proofAttachment: correctionProofFile
      });
      toast.success("Correction request submitted.");
      setExplanation("");
      resetCorrectionProofFile();
      setCorrectionFormOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Records"
        description="Review your attendance records and complete pending tasks."
      />

      <section className="rounded-2xl border bg-surface p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_220px_auto]">
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
              <option value="absent">Absent</option>
              <option value="excused">Excused</option>
            </select>
          </label>
          <Button
            type="button"
            variant={pendingTaskCount ? "default" : "outline"}
            className="h-11 justify-center whitespace-nowrap"
            aria-label="Open pending attendance tasks"
            onClick={() => setFeedbackDueModalOpen(true)}
          >
            <MessageSquareText className="h-4 w-4" />
            Pending Tasks
            {pendingTaskCount ? <span className="rounded-full bg-background/20 px-2 py-0.5 text-xs">{pendingTaskCount}</span> : null}
          </Button>
        </div>
      </section>

      <section className={cardShellClass}>
        <CardAccent />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Events by Year</h2>
            <p className="mt-1 text-sm text-muted-foreground">Finalized attendance outcomes appear here. Items that still need action stay in Pending Tasks.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge label={`${finalizedRecords.length} finalized`} tone="info" />
            <StatusBadge label={`${pendingTaskCount} pending`} tone={pendingTaskCount ? "warning" : "muted"} />
          </div>
        </div>

        <div className="plpass-modern-scrollbar mt-6 max-h-[68vh] overflow-y-auto pr-2">
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
                const event = events.find((entry) => entry.id === record.eventId);
                const session = sessions.find((entry) => entry.eventId === record.eventId);
                const workflow = event ? buildStudentEventWorkflow({
                  event,
                  session,
                  record,
                  feedbackSubmitted: taskForRecord(record)?.status === "completed",
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
                        record.status === "late" && "bg-warning/10 text-warning",
                        record.status === "absent" && "bg-danger/10 text-danger",
                        record.status === "excused" && "bg-info/10 text-info"
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
                        <div className="flex flex-wrap justify-end gap-2">
                          <StatusBadge label={record.status} tone={statusTone(record.status)} />
                          {record.status === "absent" && taskForRecord(record)?.status === "expired" ? <StatusBadge label="Deadline missed" tone="danger" /> : null}
                        </div>
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
            <EmptyState title="No finalized event records" description="Completed, absent, and excused event records will appear here." />
          )}
        </div>
        <div className="mt-5 border-t pt-4">
          <PaginationControls
            pageIndex={recordsQuery.data?.pageIndex ?? recordsPage}
            pageCount={recordsQuery.data?.pageCount ?? 0}
            canPreviousPage={recordsPage > 0}
            canNextPage={recordsPage + 1 < (recordsQuery.data?.pageCount ?? 0)}
            onPreviousPage={() => setRecordsPage((page) => Math.max(0, page - 1))}
            onNextPage={() => setRecordsPage((page) => page + 1)}
          />
        </div>
      </section>

      <ModalShell
        open={feedbackDueModalOpen}
        title="Pending Tasks"
        description="Complete these required actions before the attendance record appears in Events by Year."
        size="lg"
        onClose={() => setFeedbackDueModalOpen(false)}
      >
        {pendingTaskRecords.length ? (
          <div className="space-y-3">
            {pendingTaskRecords.map((record) => {
              const task = taskForRecord(record);
              const needsReason = needsLateReason(record);

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
                        {needsReason ? "Needs late reason" : "Needs feedback"}
                      </span>
                      {task ? (
                        <span
                          className="rounded-full bg-info/10 px-3 py-1 text-xs font-semibold text-info"
                        >
                          Due {formatDisplayDate(task.dueAt)} {formatDisplayTime(task.dueAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="max-w-xl text-sm text-muted-foreground">
                      {needsReason
                        ? "Submit the late reason before the deadline. Feedback will unlock after this step."
                        : "Answer the event feedback before the deadline to complete this attendance record."}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (needsReason) {
                          setFeedbackDueModalOpen(false);
                          setLateReasonRecord(record);
                        } else {
                          openFeedbackDueRecord(record);
                        }
                      }}
                    >
                      {needsReason ? "Submit Late Reason" : "Answer Feedback"}
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
              No pending tasks right now.
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
          onClose={() => {
            setSelectedRecord(null);
            setCorrectionFormOpen(false);
            setExplanation("");
            resetCorrectionProofFile();
          }}
        >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time In</p>
                <p className="mt-1 font-semibold">{selectedWorkflow?.timeInLabel ?? formatDisplayTime(selectedRecord.recordedAt)}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time Out</p>
                <p className="mt-1 font-semibold">{selectedWorkflow?.timeOutLabel ?? "Not recorded"}</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How it was recorded</p>
                <p className="mt-1 font-semibold">{formatAttendanceMethod(selectedRecord.method)}</p>
              </div>
              <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session Information</p>
                <p className="mt-1 font-semibold">{formatDisplayDate(selectedRecord.startsAt)} {formatDisplayTime(selectedRecord.startsAt)} - {formatDisplayTime(selectedRecord.endsAt)}</p>
              </div>
              {selectedRecord.status === "late" ? (
                <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Late reason</p>
                      <p className="mt-1 font-semibold">{selectedRecord.lateReason ?? "Required before feedback unlocks"}</p>
                      {selectedRecord.lateReason ? (
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" />
                          Locked after submission.
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Submit this first before event feedback becomes available.
                        </p>
                      )}
                    </div>
                    {!selectedRecord.lateReason && isTaskActionable(selectedRecord) ? (
                      <Button variant="outline" size="sm" onClick={() => setLateReasonRecord(selectedRecord)}>
                        Submit Reason
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {selectedFeedbackTask && isTaskActionable(selectedRecord) && !needsLateReason(selectedRecord) ? (
                <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Feedback required</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Complete all required objectives by {formatDisplayDate(selectedFeedbackTask.dueAt)} {formatDisplayTime(selectedFeedbackTask.dueAt)} or this attendance will be changed to absent.
                      </p>
                    </div>
                    <Button type="button" onClick={() => openFeedback(selectedRecord)}>
                      <MessageSquareText className="h-4 w-4" />
                      Answer Feedback
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
              {selectedRecord.status === "absent" && selectedFeedbackTask?.status === "expired" ? (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 sm:col-span-2">
                  <p className="font-semibold text-destructive">Required task deadline missed</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your check-in and check-out are retained above, but the attendance result changed to absent because the late reason or feedback was not completed within 24 hours.</p>
                </div>
              ) : null}
              {selectedCorrection ? (
                <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correction Request Status</p>
                  <p className="mt-1 font-semibold capitalize">{selectedCorrection.status}</p>
                </div>
              ) : null}
            </div>

            {selectedRequestTypes.length && !selectedCorrection ? (
              <div className="mt-6 rounded-2xl border bg-background p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <FilePenLine className="h-5 w-5 text-primary" />
                    </span>
                    <div>
                      <h3 className="font-semibold">Need to correct this record?</h3>
                      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                        Use this only if the attendance status or recorded details are wrong.
                      </p>
                    </div>
                  </div>
                  {!correctionFormOpen ? (
                    <Button type="button" variant="outline" onClick={() => setCorrectionFormOpen(true)}>
                      Request Correction
                    </Button>
                  ) : null}
                </div>

                {correctionFormOpen ? (
                  <div className="mt-5 border-t pt-5">
                    <div className="grid gap-3 sm:grid-cols-2">
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
                        <textarea
                          className="plpass-field min-h-24 w-full rounded-lg border p-3 text-sm"
                          value={explanation}
                          onChange={(event) => setExplanation(event.target.value)}
                          placeholder="Explain what needs to be corrected."
                        />
                      </label>
                      <div className="rounded-2xl border bg-surface-muted/40 p-4 sm:col-span-2">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">Proof attachment required</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              Attach a screenshot, photo, or PDF that supports your correction request. Images over {formatFileSize(correctionProofMaxBytes)} are optimized automatically; PDFs must already be {formatFileSize(correctionProofMaxBytes)} or smaller.
                            </p>
                          </div>
                          <div className="w-full sm:w-auto">
                            <input
                              id={correctionProofInputId}
                              key={correctionProofInputKey}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,application/pdf"
                              className="sr-only"
                              onChange={handleCorrectionProofChange}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 w-full rounded-full bg-background px-5 shadow-sm sm:w-auto"
                              onClick={() => document.getElementById(correctionProofInputId)?.click()}
                              disabled={isCompressingCorrectionProof}
                            >
                              <Paperclip className="h-4 w-4" />
                              {isCompressingCorrectionProof ? "Optimizing image..." : "Attach proof"}
                            </Button>
                          </div>
                        </div>

                        {correctionProofFile ? (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <Paperclip className="h-4 w-4 flex-shrink-0 text-primary" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{correctionProofFile.name}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(correctionProofFile.size)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
                              aria-label="Remove proof attachment"
                              onClick={resetCorrectionProofFile}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}

                        {correctionProofError ? <p className="mt-2 text-sm text-danger">{correctionProofError}</p> : null}
                        {correctionProofNotice ? <p className="mt-2 text-sm text-success">{correctionProofNotice}</p> : null}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={submitCorrection} disabled={correctionsQuery.createMutation.isPending || isCompressingCorrectionProof || Boolean(correctionProofError)}>
                        {correctionsQuery.createMutation.isPending ? "Submitting..." : "Submit Request"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => {
                        setCorrectionFormOpen(false);
                        setExplanation("");
                        resetCorrectionProofFile();
                      }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
        </ModalShell>
      ) : null}

      {lateReasonRecord ? (
        <ModalShell
          open={Boolean(lateReasonRecord)}
          title="Submit Late Reason"
          description="Select the reason for your late Time In."
          size="sm"
          onClose={() => {
            setLateReasonRecord(null);
            setSelectedLateReasonCategory("");
            setCustomLateReason("");
          }}
        >
            <div className="grid gap-3">
              {lateReasonOptionsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading available reasons…</p> : null}
              {lateReasonOptionsQuery.isError ? <p className="text-sm text-destructive">Late reasons are temporarily unavailable. Please try again.</p> : null}
              <div className="grid gap-2">
                {lateReasonOptions.map((reason) => (
                  <Button 
                    key={reason.id} 
                    type="button" 
                    variant={selectedLateReasonCategory === reason.id ? "default" : "outline"} 
                    className="justify-start" 
                    onClick={() => setSelectedLateReasonCategory(reason.id)}
                  >
                    {reason.label}
                  </Button>
                ))}
              </div>
              {selectedLateReasonCategory && (
                <div className="mt-2 flex flex-col gap-2">
                  <label className="text-sm font-medium">
                    Additional Details {lateReasonOptions.find((option) => option.id === selectedLateReasonCategory)?.code === "other" ? <span className="text-destructive">*</span> : <span className="text-muted-foreground font-normal">(Optional)</span>}
                  </label>
                  <textarea
                    className="w-full rounded-xl border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px]"
                    placeholder="Explain why you were late..."
                    value={customLateReason}
                    onChange={(e) => setCustomLateReason(e.target.value)}
                  />
                </div>
              )}
              {selectedLateReasonCategory && (
                <div className="mt-2 flex justify-end">
                  <Button 
                    onClick={submitLateReason} 
                    disabled={lateReasonOptionsQuery.isLoading || lateReasonOptionsQuery.isError || submitLateReasonMutation.isPending || (lateReasonOptions.find((option) => option.id === selectedLateReasonCategory)?.code === "other" && customLateReason.trim().length < 5)}
                  >
                    {submitLateReasonMutation.isPending ? "Submitting..." : "Submit Reason"}
                  </Button>
                </div>
              )}
            </div>
        </ModalShell>
      ) : null}

      {feedbackRecord ? (
        <ModalShell
          open={Boolean(feedbackRecord)}
          title="Event Feedback"
          description={feedbackStep >= feedbackObjectives.length ? "Review your answers before submitting." : `Objective ${feedbackStep + 1} of ${feedbackObjectives.length}`}
          size="lg"
          onClose={() => { setFeedbackRecord(null); setFeedbackStep(0); }}
        >
          <div className="space-y-4">
            {feedbackStep < feedbackObjectives.length ? (() => {
              const objective = feedbackObjectives[feedbackStep];
              return <div className="rounded-xl border bg-background p-5"><p className="text-base font-semibold">{objective.text}</p><div className="mt-5 grid grid-cols-5 gap-2">{emojiRatings.map((choice) => <button key={choice.value} type="button" aria-label={`${choice.value}: ${choice.label}`} onClick={() => { setFeedbackRatings((current) => ({ ...current, [objective.id]: choice.value })); setFeedbackStep((current) => Math.min(current + 1, feedbackObjectives.length)); }} className={`rounded-xl border p-2 ${feedbackRatings[objective.id] === choice.value ? "border-primary bg-primary/10" : "bg-surface"}`}><span className="block text-2xl">{choice.emoji}</span><span className="mt-1 block text-[10px] leading-tight text-muted-foreground">{choice.label}</span></button>)}</div></div>;
            })() : <><div className="rounded-xl border bg-background p-4 text-sm"><p className="font-semibold">Your ratings</p><div className="mt-3 space-y-2">{feedbackObjectives.map((objective, index) => <p key={objective.id}>{index + 1}. {objective.text} <span className="font-medium">— {feedbackRatings[objective.id]}/5</span></p>)}</div></div><label className="space-y-1.5"><span className="text-sm font-medium">Comment (optional)</span><textarea className="plpass-field min-h-24 w-full rounded-lg border p-3 text-sm" value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} placeholder="Share anything useful about the event." /></label></>}
            <div className="flex justify-between gap-3"><Button type="button" variant="outline" onClick={() => setFeedbackStep((current) => Math.max(0, current - 1))} disabled={feedbackStep === 0}>Back</Button>{feedbackStep >= feedbackObjectives.length ? <Button type="button" onClick={submitFeedback} disabled={feedbackQuery.submitMutation.isPending || !canSubmitFeedback}>{feedbackQuery.submitMutation.isPending ? "Submitting..." : "Submit Feedback"}</Button> : <p className="self-center text-xs text-muted-foreground">Choose a rating to continue</p>}</div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
