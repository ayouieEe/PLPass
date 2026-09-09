import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Layers,
  LogIn,
  LogOut,
  MapPin,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { ModalShell } from "@/components/modals/ModalShell";
import { Button } from "@/components/ui/button";
import { useAttendanceRecords, useAttendanceSessions, useCorrectionRequests, useEvent, useEventObjectives, useEventResources, useLateReasonOptions, useStudentEventFeedback, useStudentFeedbackTasks, useSubmitLateReasonMutation } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import { getEventResourceDownloadUrl } from "@/features/organizer/lib/eventResources";
import {
  buildStudentEventWorkflow,
  recordsForStudentEvents,
  useStudentScope
} from "@/features/student/studentExperience";
import type { EventObjective, EventResource } from "@/types/domain";

type RatingState = Record<string, number>;
const emojiRatings = [
  { value: 1, emoji: "😞", label: "Needs improvement" },
  { value: 2, emoji: "🙁", label: "Below expectations" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "🤩", label: "Excellent" }
];

function FeedbackModal({
  open,
  onClose,
  objectives,
  ratings,
  onRate,
  comment,
  onCommentChange,
  onSubmit,
  canSubmit,
  step,
  onBack
}: {
  open: boolean;
  onClose: () => void;
  objectives: EventObjective[];
  ratings: RatingState;
  onRate: (objective: string, value: number) => void;
  comment: string;
  onCommentChange: (value: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  step: number;
  onBack: () => void;
}) {
  if (!open) return null;

  const isReview = step >= objectives.length;
  const objective = objectives[step];

  return (
    <ModalShell
      open={open}
      title="Share your feedback"
      description={isReview ? "Review your answers before submitting." : `Objective ${step + 1} of ${objectives.length}`}
      size="sm"
      onClose={onClose}
    >
        <div className="space-y-5">
          {!isReview && objective ? (
            <div className="rounded-xl border bg-background p-5">
              <p className="text-base font-semibold leading-snug">{objective.text}</p>
              <div className="mt-5 grid grid-cols-5 gap-2" aria-label="Choose a rating">
                {emojiRatings.map((choice) => (
                  <button key={choice.value} type="button" onClick={() => onRate(objective.id, choice.value)} aria-label={`${choice.value}: ${choice.label}`} className={`rounded-xl border p-2 text-center transition hover:border-primary ${ratings[objective.id] === choice.value ? "border-primary bg-primary/10" : "bg-surface"}`}>
                    <span className="block text-2xl">{choice.emoji}</span><span className="mt-1 block text-[10px] leading-tight text-muted-foreground">{choice.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-background p-4 text-sm"><p className="font-semibold">Your ratings</p><div className="mt-3 space-y-2">{objectives.map((item, index) => <p key={item.id}>{index + 1}. {item.text} <span className="font-medium">— {ratings[item.id]}/5</span></p>)}</div></div>
          )}
          {isReview && <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Additional comments (optional)
            </label>
            <textarea
              value={comment}
              onChange={(entry) => onCommentChange(entry.target.value)}
              className="plpass-field min-h-24 w-full rounded-xl border p-3 text-sm outline-none transition focus:border-primary"
              placeholder="What stood out about this event?"
            />
          </div>}
          <div className="flex justify-between gap-3"><Button type="button" variant="outline" onClick={onBack} disabled={step === 0}>Back</Button>{isReview ? <Button onClick={onSubmit} disabled={!canSubmit}><MessageSquareText className="mr-2 h-4 w-4" />Submit Feedback</Button> : <p className="self-center text-xs text-muted-foreground">Choose a rating to continue</p>}</div>
        </div>
    </ModalShell>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-transparent bg-background p-3.5 transition hover:border-border">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function TimelinePoint({
  icon: Icon,
  label,
  value,
  filled
}: {
  icon: typeof LogIn;
  label: string;
  value: string;
  filled: boolean;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl bg-background p-4">
      <span
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
          filled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 truncate text-sm font-semibold ${filled ? "text-foreground" : "text-muted-foreground"}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function StudentEventDetailsPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const scope = useStudentScope();
  const eventQuery = useEvent(eventId, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const submitLateReasonMutation = useSubmitLateReasonMutation(scope.context);
  const lateReasonOptionsQuery = useLateReasonOptions(undefined, scope.context);
  const lateReasonOptions = lateReasonOptionsQuery.data ?? [];
  const objectivesQuery = useEventObjectives(eventId, scope.context);
  const resourcesQuery = useEventResources(eventId ?? "", { pageSize: 20 }, scope.context);
  const feedbackQuery = useStudentEventFeedback(scope.student?.id, scope.context);
  const feedbackTasksQuery = useStudentFeedbackTasks(scope.student?.id, scope.context);
  const [ratings, setRatings] = useState<RatingState>({});
  const [comment, setComment] = useState("");
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackStep, setFeedbackStep] = useState(0);
  const [selectedLateReasonCategory, setSelectedLateReasonCategory] = useState<string>("");
  const [customLateReason, setCustomLateReason] = useState<string>("");

  if (scope.isLoading) return <LoadingState label="Loading student workspace" />;
  if (scope.isError || !scope.student) return <ErrorState title="Student profile unavailable" message="The signed-in account does not have an active student profile." />;
  if (eventQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || correctionsQuery.isLoading) return <LoadingState label="Loading event details" />;
  const student = scope.student;
  if (eventQuery.isError || !eventQuery.data) return <ErrorState title="Event unavailable" message="This event was not found or is no longer available." />;

  const event = eventQuery.data;
  if (!event) return <ErrorState title="Event unavailable" message="This event was not found or is no longer available." />;
  if (event.status !== "approved" && event.status !== "completed") {
    return <ErrorState title="Event unavailable" message="This event is not published for students." />;
  }
  const feedbackObjectives = objectivesQuery.data ?? [];
  const displayObjectives = feedbackObjectives;
  const currentEventId = event.id;
  const repositoryRecords = recordsForStudentEvents({
    studentId: student.id,
    records: recordsQuery.data?.items ?? [],
    sessions: sessionsQuery.data?.items ?? [],
    events: [event]
  });
  const currentRecord = repositoryRecords.find((record) => record.eventId === event.id);
  const correction = (correctionsQuery.data?.items ?? []).find((request) => request.eventId === event.id);
  const feedbackTask = (feedbackTasksQuery.data ?? []).find((task) => task.attendanceRecordId === currentRecord?.id);
  const feedbackSubmitted = feedbackTask?.status === "completed";
  const eventSession = (sessionsQuery.data?.items ?? []).find((session) => session.eventId === event.id);
  const workflow = buildStudentEventWorkflow({
    event,
    session: eventSession,
    record: currentRecord,
    feedbackSubmitted,
    correctionStatus: correction?.status
  });
  const taskObjectives = feedbackTask?.objectives ?? [];
  const allObjectivesRated = taskObjectives.length > 0 && taskObjectives.every((objective) => ratings[objective.id] > 0);
  const feedbackTaskIsActionable = feedbackTask?.status === "pending" && new Date(feedbackTask.dueAt).getTime() > Date.now();
  const feedbackReady = feedbackTaskIsActionable && !workflow.requiresLateReason;
  const lateReasonRequired = Boolean(currentRecord && workflow.requiresLateReason && feedbackTaskIsActionable);
  const lateReasonLocked = Boolean(currentRecord?.status === "late" && currentRecord.lateReason);
  const eventResources = resourcesQuery.data?.items ?? [];

  async function openEventResource(resource: EventResource) {
    try {
      const url = await getEventResourceDownloadUrl(resource);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("This resource could not be opened. Please try again.");
    }
  }

  async function submitLateReason() {
    if (!currentRecord || !selectedLateReasonCategory) return;
    const selectedOption = lateReasonOptions.find((option) => option.id === selectedLateReasonCategory);
    if (!selectedOption) return;
    if (selectedOption.code === "other" && customLateReason.trim().length < 5) {
      toast.error("Please provide a more detailed reason.");
      return;
    }
    try {
      await submitLateReasonMutation.mutateAsync({
        attendanceRecordId: currentRecord.id,
        reasonOptionId: selectedOption.id,
        customReason: customLateReason.trim() || undefined
      });
      toast.success("Late reason submitted. Event feedback is now available.");
    } catch {
      toast.error("Unable to submit late reason. Please try again.");
    }
  }

  async function submitFeedback() {
    if (!allObjectivesRated) {
      toast.error("Please rate each event objective.");
      return;
    }
    if (!currentRecord || !feedbackTask) {
      toast.error("Attendance record is required before feedback can be submitted.");
      return;
    }
    try {
      await feedbackQuery.submitMutation.mutateAsync({
        taskId: feedbackTask.id,
        eventId: currentEventId,
        studentId: student.id,
        attendanceRecordId: currentRecord.id,
        comment,
        ratings: taskObjectives.map((objective) => ({
          objectiveId: objective.id,
          rating: ratings[objective.id]
        }))
      });
      setComment("");
      setFeedbackStep(0);
      setFeedbackModalOpen(false);
      toast.success("Feedback submitted. Attendance is now complete.");
    } catch {
      toast.error("Unable to submit feedback. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
          <NavLink className="font-medium transition hover:text-foreground" to={APP_ROUTES.studentUpcomingEvents}>
            Events
          </NavLink>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium text-foreground">{event.code}</span>
        </nav>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <PageHeader eyebrow={event.code} title={event.title} description="Review event details, schedule, and attendance information." />

      {event.description ? (
        <section className="rounded-2xl border bg-surface p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Organizer notes</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.description}</p>
        </section>
      ) : null}

      {/* Attendance status — the single most important thing on this page */}
      <section className="overflow-hidden rounded-2xl border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background/60 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My Attendance</p>
          <StatusBadge label={workflow.state} tone={workflow.stateTone} />
        </div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row">
          <TimelinePoint icon={LogIn} label="Time In" value={workflow.timeInLabel} filled={workflow.timeInLabel !== "—" && workflow.timeInLabel !== "Not recorded"} />
          <TimelinePoint icon={LogOut} label="Time Out" value={workflow.timeOutLabel} filled={workflow.timeOutLabel !== "—" && workflow.timeOutLabel !== "Not recorded"} />
        </div>
      </section>

      {feedbackReady && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <div>
              <p className="text-sm font-semibold">Feedback is ready</p>
              <p className="text-sm text-muted-foreground">
                Complete all required objectives by {formatDisplayDate(feedbackTask.dueAt)} {formatDisplayTime(feedbackTask.dueAt)} or this attendance will be changed to absent.
              </p>
            </div>
          </div>
          <Button onClick={() => { setFeedbackStep(0); setFeedbackModalOpen(true); }}>
            <MessageSquareText className="mr-2 h-4 w-4" />
            Answer Feedback
          </Button>
        </div>
      )}

      {lateReasonRequired && (
        <section className="rounded-2xl border border-warning/30 bg-warning/10 p-5">
          <p className="font-semibold text-warning">Late reason required before feedback</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose your reason once. It will be locked after submission.</p>
          <div className="mt-4 flex flex-col gap-4">
            {lateReasonOptionsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading available reasons…</p> : null}
            {lateReasonOptionsQuery.isError ? <p className="text-sm text-destructive">Late reasons are temporarily unavailable. Please try again.</p> : null}
            <div className="flex flex-wrap gap-2">
                {lateReasonOptions.map((reason) => (
                <Button 
                  key={reason.id} 
                  type="button" 
                  variant={selectedLateReasonCategory === reason.id ? "default" : "outline"} 
                  onClick={() => setSelectedLateReasonCategory(reason.id)}
                >
                  {reason.label}
                </Button>
              ))}
            </div>
            {selectedLateReasonCategory && (
              <div className="flex flex-col gap-2">
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
              <div className="flex justify-end">
                <Button 
                  onClick={submitLateReason} 
                  disabled={lateReasonOptionsQuery.isLoading || lateReasonOptionsQuery.isError || submitLateReasonMutation.isPending || (lateReasonOptions.find((option) => option.id === selectedLateReasonCategory)?.code === "other" && customLateReason.trim().length < 5)}
                >
                  {submitLateReasonMutation.isPending ? "Submitting..." : "Submit Reason"}
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      {lateReasonLocked && (
        <div className="flex items-center gap-3 rounded-2xl border bg-surface px-5 py-3.5">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
          <p className="text-sm font-medium">Late reason recorded: {currentRecord?.lateReason}. This reason is locked.</p>
        </div>
      )}

      {currentRecord?.status === "absent" && feedbackTask?.status === "expired" && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-5 py-3.5">
          <p className="font-semibold text-destructive">Required task deadline missed</p>
          <p className="mt-1 text-sm text-muted-foreground">Your recorded check-in and check-out remain available for review, but the final attendance result is absent.</p>
        </div>
      )}

      {feedbackSubmitted && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-3.5">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700">Thanks - your feedback for this event has been recorded and attendance is complete.</p>
        </div>
      )}

      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Event Overview</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailRow icon={Layers} label="Category" value={event.category} />
          <DetailRow icon={MapPin} label="Venue" value={event.venue} />
          <DetailRow icon={CalendarDays} label="Date" value={formatDisplayDate(event.startsAt)} />
          <DetailRow icon={Clock} label="Time" value={`${formatDisplayTime(event.startsAt)} – ${formatDisplayTime(event.endsAt)}`} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Objectives</h2>
          {displayObjectives.length ? (
            <div className="mt-5 grid gap-3">
              {displayObjectives.map((objective, index) => (
                <div key={objective.id} className="flex gap-3 rounded-xl bg-background p-4 transition hover:bg-muted/50">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-snug">{objective.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
              No objectives were configured for this event yet.
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Resources</h2>
          <div className="mt-5 space-y-3">
            {eventResources.map((resource) => <div key={resource.id} className="flex flex-col gap-4 rounded-xl bg-background p-4">
              <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </span>
              <div>
                <p className="text-sm font-semibold">{resource.title}</p>
                <p className="text-sm text-muted-foreground">Organizer-provided event resource</p>
              </div>
              </div>
            <Button type="button" variant="outline" onClick={() => void openEventResource(resource)}>
              <Download className="mr-2 h-4 w-4" />
              {resource.externalUrl ? "Open link" : "Download file"}
            </Button>
            </div>)}
            {!resourcesQuery.isLoading && eventResources.length === 0 ? <p className="rounded-xl border border-dashed bg-background p-4 text-sm text-muted-foreground">No resources have been added for this event.</p> : null}
          </div>
        </section>
      </div>

      <FeedbackModal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        objectives={taskObjectives}
        ratings={ratings}
        onRate={(objectiveId, value) => { setRatings((current) => ({ ...current, [objectiveId]: value })); setFeedbackStep((current) => Math.min(current + 1, taskObjectives.length)); }}
        comment={comment}
        onCommentChange={setComment}
        onSubmit={submitFeedback}
        canSubmit={allObjectivesRated && !feedbackQuery.submitMutation.isPending}
        step={feedbackStep}
        onBack={() => setFeedbackStep((current) => Math.max(0, current - 1))}
      />
    </div>
  );
}
