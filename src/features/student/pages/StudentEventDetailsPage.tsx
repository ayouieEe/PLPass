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
  Star,
  X
} from "lucide-react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useAttendanceRecords, useAttendanceSessions, useCorrectionRequests, useEvent, useEventObjectives, useStudentEventFeedback, useSubmitLateReasonMutation } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import {
  buildStudentEventWorkflow,
  eventResourceLabel,
  getEventResource,
  getStudentFeedbackDeadlineStatus,
  lateReasonOptions,
  recordsForStudentEvents,
  useStudentScope
} from "@/features/student/studentExperience";
import type { EventObjective } from "@/types/domain";

type RatingState = Record<string, number>;
function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1" aria-label="Objective rating" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((rating) => {
          const active = rating <= (hovered || value);
          return (
            <button
              key={rating}
              type="button"
              onClick={() => onChange(rating)}
              onMouseEnter={() => setHovered(rating)}
              aria-label={`${rating} star${rating === 1 ? "" : "s"}`}
              className="transition-transform hover:scale-110"
            >
              <Star className={`h-6 w-6 transition-colors ${active ? "fill-warning text-warning" : "text-muted-foreground/25"}`} />
            </button>
          );
        })}
      </div>
      {value > 0 && <span className="text-xs font-medium text-muted-foreground">{value}/5</span>}
    </div>
  );
}

function FeedbackModal({
  open,
  onClose,
  objectives,
  ratings,
  onRate,
  comment,
  onCommentChange,
  onSubmit,
  canSubmit
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
}) {
  if (!open) return null;

  const ratedCount = objectives.filter((objective) => ratings[objective.id] > 0).length;
  const isCommentOnly = objectives.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Event feedback"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-surface/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <MessageSquareText className="h-4 w-4 text-primary" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Share your feedback</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isCommentOnly ? "Overall feedback" : `${ratedCount} of ${objectives.length} objectives rated`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {isCommentOnly ? (
            <p className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-muted-foreground">
              Objective ratings are not configured for this event yet. You can still submit your overall feedback below.
            </p>
          ) : (
          <div className="space-y-3">
            {objectives.map((objective, index) => (
              <div key={objective.id} className="rounded-xl border bg-background p-4">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-snug text-foreground/90">{objective.text}</p>
                </div>
                <div className="mt-3 pl-7">
                  <StarRating value={ratings[objective.id] ?? 0} onChange={(value) => onRate(objective.id, value)} />
                </div>
              </div>
            ))}
          </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Additional comments
            </label>
            <textarea
              value={comment}
              onChange={(entry) => onCommentChange(entry.target.value)}
              className="plpass-field min-h-24 w-full rounded-xl border p-3 text-sm outline-none transition focus:border-primary"
              placeholder="What stood out about this event?"
            />
          </div>

          <Button className="w-full" size="lg" onClick={onSubmit} disabled={!canSubmit}>
            <MessageSquareText className="mr-2 h-4 w-4" />
            Submit Feedback
          </Button>
          {!canSubmit && (
            <p className="text-center text-xs text-muted-foreground">
              {isCommentOnly ? "Write a short comment to submit." : "Rate every objective to submit."}
            </p>
          )}
        </div>
      </div>
    </div>
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
  const objectivesQuery = useEventObjectives(eventId, scope.context);
  const feedbackQuery = useStudentEventFeedback(scope.student?.id, scope.context);
  const [ratings, setRatings] = useState<RatingState>({});
  const [comment, setComment] = useState("");
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

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
  const feedbackObjectives = ((objectivesQuery.data?.length ?? 0) > 0 ? objectivesQuery.data ?? [] : []).slice(0, 3);
  const hasSupabaseObjectives = (objectivesQuery.data?.length ?? 0) > 0;
  const displayObjectives = feedbackObjectives.slice(0, 3);
  const currentEventId = event.id;
  const repositoryRecords = recordsForStudentEvents({
    studentId: student.id,
    records: recordsQuery.data?.items ?? [],
    sessions: sessionsQuery.data?.items ?? [],
    events: [event]
  });
  const currentRecord = repositoryRecords.find((record) => record.eventId === event.id);
  const correction = (correctionsQuery.data?.items ?? []).find((request) => request.eventId === event.id);
  const feedbackSubmitted = Boolean(currentRecord?.feedbackSubmitted || (feedbackQuery.data ?? []).some((feedback) => feedback.eventId === currentEventId));
  const eventSession = (sessionsQuery.data?.items ?? []).find((session) => session.eventId === event.id);
  const workflow = buildStudentEventWorkflow({
    event,
    session: eventSession,
    record: currentRecord,
    feedbackSubmitted,
    correctionStatus: correction?.status
  });
  const allObjectivesRated = hasSupabaseObjectives
    ? feedbackObjectives.every((objective) => ratings[objective.id] > 0)
    : comment.trim().length >= 5;
  const feedbackReady = workflow.canSubmitFeedback;
  const feedbackDeadline = currentRecord ? getStudentFeedbackDeadlineStatus(currentRecord) : null;
  const lateReasonRequired = Boolean(currentRecord && workflow.requiresLateReason);
  const lateReasonLocked = Boolean(currentRecord?.status === "late" && currentRecord.lateReason);
  const eventResource = getEventResource(event);

  async function submitLateReason(reason: string) {
    if (!currentRecord) return;
    try {
      await submitLateReasonMutation.mutateAsync({
        attendanceRecordId: currentRecord.id,
        reason
      });
      toast.success("Late reason submitted to Supabase. Event feedback is now available.");
    } catch {
      toast.error("Unable to submit late reason. Please try again.");
    }
  }

  async function submitFeedback() {
    if (hasSupabaseObjectives && !allObjectivesRated) {
      toast.error("Please rate each event objective.");
      return;
    }
    if (!hasSupabaseObjectives && comment.trim().length < 5) {
      toast.error("Please write a short overall feedback comment.");
      return;
    }
    if (!currentRecord) {
      toast.error("Attendance record is required before feedback can be submitted.");
      return;
    }
    try {
      await feedbackQuery.submitMutation.mutateAsync({
        eventId: currentEventId,
        studentId: student.id,
        attendanceRecordId: currentRecord.id,
        comment,
        ratings: hasSupabaseObjectives
          ? feedbackObjectives.map((objective) => ({
              objectiveId: objective.id,
              rating: ratings[objective.id]
            }))
          : []
      });
      setComment("");
      setFeedbackModalOpen(false);
      toast.success("Feedback submitted to Supabase. Attendance is now complete.");
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

      <PageHeader eyebrow={event.code} title={event.title} description={event.category} />

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
                Answer the required event feedback to complete attendance. {feedbackDeadline?.label}.
              </p>
            </div>
          </div>
          <Button onClick={() => setFeedbackModalOpen(true)}>
            <MessageSquareText className="mr-2 h-4 w-4" />
            Answer Event Feedback
          </Button>
        </div>
      )}

      {lateReasonRequired && (
        <section className="rounded-2xl border border-warning/30 bg-warning/10 p-5">
          <p className="font-semibold text-warning">Late reason required before feedback</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose your reason once. It will be locked after submission.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {lateReasonOptions.map((reason) => (
              <Button key={reason} type="button" variant="outline" onClick={() => submitLateReason(reason)}>
                {reason}
              </Button>
            ))}
          </div>
        </section>
      )}

      {lateReasonLocked && (
        <div className="flex items-center gap-3 rounded-2xl border bg-surface px-5 py-3.5">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
          <p className="text-sm font-medium">Late reason recorded: {currentRecord?.lateReason}. This reason is locked.</p>
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
              No objectives were configured for this event in Supabase.
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Resources</h2>
          <div className="mt-5 flex flex-col gap-4 rounded-xl bg-background p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </span>
              <div>
                <p className="text-sm font-semibold">{eventResourceLabel(event)}</p>
                <p className="text-sm text-muted-foreground">{eventResource.description}</p>
              </div>
            </div>
            {eventResource.url ? (
              <Button asChild variant="outline">
                <a href={eventResource.url} target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Open / Download
                </a>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <Download className="mr-2 h-4 w-4" />
                No resource link
              </Button>
            )}
          </div>
        </section>
      </div>

      <FeedbackModal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        objectives={feedbackObjectives}
        ratings={ratings}
        onRate={(objectiveId, value) => setRatings((current) => ({ ...current, [objectiveId]: value }))}
        comment={comment}
        onCommentChange={setComment}
        onSubmit={submitFeedback}
        canSubmit={allObjectivesRated && !feedbackQuery.submitMutation.isPending}
      />
    </div>
  );
}
