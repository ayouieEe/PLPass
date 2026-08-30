/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, CalendarCheck, ClipboardList, Plus, Search, Users } from "lucide-react";
import { type FieldPath, useFieldArray, useForm } from "react-hook-form";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { eventBaseSchema } from "@/lib/validations/events";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { ParticipationBarChart } from "@/components/charts/ParticipationBarChart";
import { RiskSummaryChart } from "@/components/charts/RiskSummaryChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { SelectField } from "@/components/forms/SelectField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { TextField } from "@/components/forms/TextField";
import { TimePickerField } from "@/components/forms/TimePickerField";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";
import { StatCard } from "@/components/shared/StatCard";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { GenerateReportModal } from "@/features/reports/GenerateReportModal";
import { ReportFilterPanel } from "@/features/reports/ReportFilterPanel";
import { ReportHistoryTable } from "@/features/reports/ReportHistoryTable";
import { ReportPreviewCard } from "@/features/reports/ReportPreviewCard";
import type { ReportHistoryRecord } from "@/features/reports/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useCorrectionRequests,
  useEvent,
  useEventMutations,
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useOrganizerProfiles,
  useReports,
  useStudents,
  useAuditLogMutations
} from "@/hooks/useRepositoryQueries";
import { repositories } from "@/services/repositories";
import { APP_ROUTES } from "@/lib/constants/routes";
import { compareDateValues, dateKey, formatDisplayDate, formatDisplayTime, isFutureOrNowDate } from "@/lib/utils/date";
import type { RepositoryContext } from "@/services/repositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
  CorrectionRequest,
  Event,
  EventParticipant,
  MlPrediction,
  Student
} from "@/types/domain";
import type {
  AttendanceStatus,
  CorrectionRequestStatus,
  EventStatus,
  RiskLevel,
  SessionStatus,
  StudentStatus,
  VerificationMethod
} from "@/types/enums";

type OrganizerScope = {
  context: RepositoryContext;
  organizerId?: string;
  organizerName: string;
  isLoading: boolean;
  isError: boolean;
};

type EventWithCount = Event & { participantCount: number };

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const VENUE_OPTIONS = [
  { label: "Function Hall", value: "Function Hall" },
  { label: "Banquet Hall", value: "Banquet Hall" },
  { label: "Auditorium", value: "Auditorium" },
  { label: "Gymnasium", value: "Gymnasium" },
  { label: "AVR 1", value: "AVR 1" },
  { label: "AVR 2", value: "AVR 2" },
  { label: "AVR 4", value: "AVR 4" }
];

const CATEGORY_OPTIONS = [
  { label: "Assembly", value: "Assembly" },
  { label: "Seminar", value: "Seminar" },
  { label: "Workshop", value: "Workshop" },
  { label: "Orientation", value: "Orientation" },
  { label: "Training", value: "Training" },
  { label: "Athletic Event", value: "Athletic Event" },
  { label: "Ceremony", value: "Ceremony" },
  { label: "Rehearsal/Practice", value: "Rehearsal/Practice" },
  { label: "Cultural Program", value: "Cultural Program" },
  { label: "Election Activity", value: "Election Activity" }
];
const INSTITUTIONAL_CATEGORY_OPTIONS = [
  { label: "Accreditation Linked", value: "Accreditation Linked" },
  { label: "Academic or Training", value: "Academic or Training" },
  { label: "Social or Recreational", value: "Social or Recreational" }
];
const PARTICIPATION_STATUS_OPTIONS = [{ label: "Mandatory", value: "Mandatory" }, { label: "Voluntary", value: "Voluntary" }];
const TARGET_GROUP_OPTIONS = [
  { label: "University-wide", value: "University-wide" },
  { label: "College or Department-wide", value: "College or Department-wide" },
  { label: "Single Class or Organization", value: "Single Class or Organization" }
];

const MIN_OBJECTIVES = 3;

function timeToMinutes(value: string) {
  const [hoursPart = "0", minutesPart = "0"] = value.split(":");
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
}

export const eventFormSchemaWithObjectives = eventBaseSchema.and(
  z.object({
    objectives: z.array(
      z.object({
        value: z.string().trim()
      })
    ).superRefine((entries, ctx) => {
      const filledCount = entries.filter((entry) => entry.value.trim().length > 0).length;

      if (filledCount < MIN_OBJECTIVES) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          type: "array",
          minimum: MIN_OBJECTIVES,
          inclusive: true,
          exact: false,
          message: `At least ${MIN_OBJECTIVES} objectives are required.`,
          path: []
        });
      }

      entries.forEach((entry, index) => {
        const trimmed = entry.value.trim();

        if (trimmed && trimmed.length < 3) {
          ctx.addIssue({
            code: z.ZodIssueCode.too_small,
            type: "string",
            minimum: 3,
            inclusive: true,
            exact: false,
            message: "Objective must be at least 3 characters.",
            path: [index, "value"]
          });
        }
      });
    })
  })
);

const sessionFormSchema = z
  .object({
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required."),
    attendanceMode: z.enum(["face-to-face", "online"])
  })
  .refine((value) => timeToMinutes(value.expectedEndTime) > timeToMinutes(value.startTime), {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time."
  });

type EventFormValues = z.infer<typeof eventFormSchemaWithObjectives>;
type SessionFormValues = z.infer<typeof sessionFormSchema>;

function useOrganizerScope(): OrganizerScope {
  const { session } = useDevelopmentSession();
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" },
    organizerId: organizerQuery.data?.items[0]?.id,
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: organizerQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return formatDisplayDate(value, "Not scheduled");
}

function formatTime(value: string | undefined) {
  return formatDisplayTime(value, "Not set");
}

function statusTone(status: AttendanceStatus | SessionStatus | CorrectionRequestStatus | StudentStatus | RiskLevel | EventStatus) {
  if (status === "present" || status === "completed" || status === "approved" || status === "enrolled" || status === "low") {
    return "success" as const;
  }
  if (status === "late" || status === "draft" || status === "pending" || status === "medium") {
    return "warning" as const;
  }
  if (status === "absent" || status === "cancelled" || status === "rejected" || status === "high" || status === "critical") {
    return "danger" as const;
  }
  return "muted" as const;
}

function attendanceCounts(records: AttendanceRecord[]) {
  return {
    present: records.filter((record) => record.status === "present").length,
    late: records.filter((record) => record.status === "late").length,
    absent: records.filter((record) => record.status === "absent").length,
    excused: records.filter((record) => record.status === "excused").length
  };
}

function attendanceRate(records: AttendanceRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  const attended = records.filter((record) => record.status === "present" || record.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

function eventLabel(event: Event | undefined) {
  return event ? `${event.code} - ${event.title}` : "Unknown event";
}

function studentName(student: Student | undefined) {
  return student ? student.fullName ?? student.studentNumber : "Unknown student";
}

function ShellState({ scope }: { scope: OrganizerScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading organizer workspace" />;
  }
  if (scope.isError || !scope.organizerId) {
    return <ErrorState title="Organizer profile unavailable" message="The signed-in mock account does not have an organizer profile fixture." />;
  }
  return null;
}

function OrganizerFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function recordsForSession(records: AttendanceRecord[], sessionId: string) {
  return records.filter((record) => record.sessionId === sessionId);
}

function participantStudents(participants: EventParticipant[], students: Student[]) {
  const participantIds = new Set(participants.map((participant) => participant.studentId));
  return students.filter((student) => participantIds.has(student.id));
}

function eventSemesterId(event: Event, semesters: { id: string; startsAt: string; endsAt: string }[]) {
  const eventDate = dateKey(event.startsAt);
  if (!eventDate) {
    return undefined;
  }
  return semesters.find((semester) => eventDate >= semester.startsAt && eventDate <= semester.endsAt)?.id;
}

function eventMatchesDateRange(event: Event, dateFrom: string, dateTo: string) {
  const date = dateKey(event.startsAt);
  return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
}

function buildLiveRecords(records: AttendanceRecord[], students: Student[]): LiveAttendanceRecord[] {
  return records.map((record) => ({
    id: record.id,
    studentName: studentName(students.find((student) => student.id === record.studentId)),
    identifier: students.find((student) => student.id === record.studentId)?.studentNumber ?? record.studentId,
    status: record.status === "excused" ? "manual" : record.status,
    timestamp: formatTime(record.recordedAt)
  }));
}

function EventScheduleCard({ event }: { event: Event }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{eventLabel(event)}</p>
          <p className="text-sm text-muted-foreground">{formatDate(event.startsAt)} {formatTime(event.startsAt)} - {formatTime(event.endsAt)} - {event.venue}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.organizerEvent(event.id)}>View</NavLink>
        </Button>
      </div>
    </article>
  );
}

function PredictionCard({ prediction }: { prediction: MlPrediction }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{prediction.patternLabel}</p>
          <p className="text-sm text-muted-foreground">{prediction.explanation}</p>
        </div>
        <StatusBadge label={prediction.riskLevel} tone={statusTone(prediction.riskLevel)} />
      </div>
    </article>
  );
}

function SessionCard({ session }: { session: AttendanceSession }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{session.title}</p>
          <p className="text-sm text-muted-foreground">{formatDate(session.startsAt)} {formatTime(session.startsAt)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <NavLink to={APP_ROUTES.organizerSession(session.id)}>View session</NavLink>
        </Button>
      </div>
    </article>
  );

}

function mostCommonValue<T extends string | number>(items: T[]) {
  return items.reduce<{ value: T | null; count: number; totals: Map<T, number> }>(
    (summary, item) => {
      const count = (summary.totals.get(item) ?? 0) + 1;
      summary.totals.set(item, count);
      return count > summary.count ? { ...summary, value: item, count } : summary;
    },
    { value: null, count: 0, totals: new Map<T, number>() }
  ).value;
}

function buildAttendanceFactors(selectedStudents: Student[], category: string, startTime: string) {
  return [
    { label: "Attendance history", importance: 92 },
    { label: "Previous event participation", importance: 81 },
    { label: "Year level", importance: 74 },
    { label: "Event category", importance: 69 },
    { label: "Venue accessibility", importance: 64 }
  ];
}

function predictedAttendancePercentage(selectedCount: number, category: string, startTime: string) {
  let score = 68;
  const normalizedCategory = category.toLowerCase();

  if (selectedCount >= 150) score += 8;
  if (selectedCount >= 75 && selectedCount < 150) score += 5;
  if (normalizedCategory.includes("assembly") || normalizedCategory.includes("career")) score += 7;
  if (normalizedCategory.includes("competition") || normalizedCategory.includes("showcase")) score += 5;
  if (startTime && startTime < "10:00") score += 3;
  if (startTime && startTime >= "13:00") score -= 4;

  return Math.max(45, Math.min(96, score));
}

function calculatePriority(values: Pick<EventFormValues, "category" | "institutionalCategory" | "participationStatus" | "targetGroup" | "fixedPriority" | "date">) {
  const leadTimeDays = Math.max(0, Math.ceil((new Date(`${values.date}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000));
  const urgencyPoints = leadTimeDays <= 1 ? 3 : leadTimeDays <= 7 ? 2 : leadTimeDays <= 14 ? 1 : 0;
  const impactPoints = (values.participationStatus === "Mandatory" ? 2 : 1)
    + (values.targetGroup === "University-wide" ? 2 : values.targetGroup === "College or Department-wide" ? 1 : 0)
    + (values.institutionalCategory === "Accreditation Linked" ? 2 : values.institutionalCategory === "Academic or Training" ? 1 : 0);
  const priorityScore = values.fixedPriority ? 9 : Math.min(9, urgencyPoints + impactPoints);
  return { urgencyPoints, impactPoints, priorityScore, priorityTier: priorityScore >= 7 ? "High" : priorityScore >= 4 ? "Medium" : "Low" } as const;
}

function CreateEventSectionHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b pb-4">
      <p className="text-xs font-medium uppercase text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function PredictionMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border bg-surface p-3.5">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none text-foreground">{value}</p>
      {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function CreateEventPage() {
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [programId, setProgramId] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [section, setSection] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [participantError, setParticipantError] = useState("");
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const mutations = useEventMutations(scope.context);
  const auditLogMutations = useAuditLogMutations(scope.context);
  const studentsQuery = useStudents({ pageSize: 200 }, scope.context);
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchemaWithObjectives),
    defaultValues: {
      code: "",
      title: "",
      category: "",
      venue: "",
      date: "",
      startTime: "",
      endTime: "",
      description: "",
      objectives: [{ value: "" }, { value: "" }, { value: "" }],
      remarks: "",
      priorityLevel: "Flexible",
      impactScore: null,
      fixedPriority: false
      ,requestedBy: ""
      ,collegeOffice: ""
      ,numberOfPax: undefined
      ,resourceTitle: ""
      ,resourceUrl: ""
    }
  });
  const {
    fields: objectiveFields,
    append: appendObjective,
    remove: removeObjective
  } = useFieldArray({
    control: form.control,
    name: "objectives"
  });
  
  // Auto-generate event code on component mount (once)
  useEffect(() => {
    let isMounted = true;
    
    async function loadEventCode() {
      try {
        const nextCode = await repositories.eventManagement.generateNextEventCode(scope.context);
        if (isMounted) {
          form.setValue("code", nextCode, { shouldValidate: true, shouldDirty: true });
        }
      } catch (error) {
        console.error("Failed to generate event code:", error);
        // Set a fallback code if generation fails
        if (isMounted) {
          const fallbackCode = `EVT-${new Date().getFullYear()}-001`;
          form.setValue("code", fallbackCode, { shouldValidate: true, shouldDirty: true });
        }
      }
    }
    
    void loadEventCode();
    
    return () => {
      isMounted = false;
    };
  }, [form, scope.context]);
  
  const watchedCategory = form.watch("category");
  const watchedInstitutionalCategory = form.watch("institutionalCategory");
  const watchedParticipationStatus = form.watch("participationStatus");
  const watchedTargetGroup = form.watch("targetGroup");
  const watchedFixedPriority = form.watch("fixedPriority");
  const watchedDate = form.watch("date");
  const watchedStartTime = form.watch("startTime");
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (studentsQuery.isLoading || catalog.programs.isLoading) {
    return <LoadingState label="Loading participant selector" />;
  }
  const students = studentsQuery.data?.items ?? [];
  const selectedStudents = selectedIds.map((id) => studentsQuery.data?.items.find((student) => student.id === id)).filter((student): student is Student => Boolean(student));
  const programById = new Map((catalog.programs.data?.items ?? []).map((program) => [program.id, program.code]));
  const dominantSelectedYear = mostCommonValue(selectedStudents.map((student) => student.yearLevel));
  const dominantSelectedSection = mostCommonValue(selectedStudents.map((student) => student.section));
  const predictedPercentage = predictedAttendancePercentage(selectedIds.length, watchedCategory, watchedStartTime);
  const expectedAttendees = Math.round((selectedIds.length * predictedPercentage) / 100);
  const attendanceFactors = buildAttendanceFactors(selectedStudents, watchedCategory, watchedStartTime);
  function toggleStudent(studentId: string) {
    setSelectedIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]);
    setParticipantError("");
  }
  function selectAllFiltered() {
    setSelectedIds((current) => [...new Set([...current, ...students.map((student) => student.id)])]);
    setParticipantError("");
  }
  function addObjective() {
    appendObjective({ value: "" });
  }
  async function onSubmit(values: EventFormValues) {
    if (selectedIds.length === 0) {
      setParticipantError("Select at least one participant.");
      return;
    }
    try {
      const ranking = calculatePriority(values);
      const event = await mutations.createEventMutation.mutateAsync({
        code: values.code,
        title: values.title,
        category: values.category,
        venue: values.venue,
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
        institutionalCategory: values.institutionalCategory,
        participationStatus: values.participationStatus,
        targetGroup: values.targetGroup,
        description: values.description,
        remarks: values.remarks,
        priorityLevel: ranking.priorityTier === "High" ? "Time-Sensitive" : ranking.priorityTier === "Medium" ? "Business-Critical" : "Flexible",
        impactScore: ranking.impactPoints,
        urgencyPoints: ranking.urgencyPoints,
        priorityScore: ranking.priorityScore,
        priorityTier: ranking.priorityTier,
        fixedPriority: values.fixedPriority,
        resourceTitle: values.resourceTitle,
        resourceUrl: values.resourceUrl,
        requestedBy: values.requestedBy,
        collegeOffice: values.collegeOffice,
        numberOfPax: values.numberOfPax ?? selectedIds.length,
        visibility: "assigned",
        publishReason: "Published by event organizer",
        participantStudentIds: selectedIds,
        objectives: values.objectives
          .map((objective: { value: string }) => objective.value.trim())
          .filter((objective: string) => objective.length > 0)
      });
      
      void auditLogMutations.logActionMutation.mutateAsync({
        action: "Published Event",
        targetType: "event",
        targetId: event.id,
        metadata: { eventCode: event.code, participantCount: selectedIds.length }
      });
      
      navigate(APP_ROUTES.organizerEvent(event.id), { state: { announcement: `${event.title} was published successfully.` } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create event. Please try again.";
      toast.error(message);
    }
  }
  return (
    <OrganizerFrame>
      <PageHeader
        title="Create Event"
      />
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-sm text-foreground"><span className="font-semibold text-danger">Required fields</span> are marked with a red <span className="font-semibold text-danger">*</span>. Optional fields do not carry a marker.</p>
        </div>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5 rounded-lg border bg-surface p-5 shadow-sm">
            <CreateEventSectionHeader
              eyebrow="Create Event"
              title="Event Details"
              description="Enter the event information and at least three objectives for feedback generation."
            />

            <section className="space-y-4">
              <h3 className="border-b pb-2 text-sm font-semibold uppercase tracking-wide text-primary">Event Identification</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField control={form.control} name="code" label="Event Code" placeholder="e.g. EVT-2026-021" readOnly={true} required />
                <TextField control={form.control} name="title" label="Event Name" placeholder="e.g. Hospitality Career Fair" required />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="border-b pb-2 text-sm font-semibold uppercase tracking-wide text-primary">Schedule &amp; Venue</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField control={form.control} name="venue" label="Venue" placeholder="Select a venue" options={VENUE_OPTIONS} required />
                <DatePickerField control={form.control} name="date" label="Date" min={new Date().toISOString().split('T')[0]} required />
                <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
                  <TimePickerField control={form.control} name="startTime" label="Start Time" required />
                  <TimePickerField control={form.control} name="endTime" label="End Time" required />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="border-b pb-2 text-sm font-semibold uppercase tracking-wide text-primary">Classification</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField control={form.control} name="category" label="Event Category" placeholder="Select an event category" options={CATEGORY_OPTIONS} required />
                <div>
                  <SelectField control={form.control} name="institutionalCategory" label="Institutional classification (Priority Ranking)" options={INSTITUTIONAL_CATEGORY_OPTIONS} required />
                  <p className="mt-1 text-xs text-muted-foreground">Accreditation: compliance or evaluation. Academic: learning or training. Social: interaction, recreation, or community.</p>
                </div>
                <SelectField control={form.control} name="participationStatus" label="Mandatory or Voluntary Status" options={PARTICIPATION_STATUS_OPTIONS} required />
                <SelectField control={form.control} name="targetGroup" label="Target Group Size" options={TARGET_GROUP_OPTIONS} required />
              </div>
            </section>

            <section className="rounded-lg border bg-background p-4">
              <h3 className="font-semibold text-foreground">Priority Ranking</h3>
              <p className="mt-1 text-sm text-muted-foreground">These values are generated automatically from the classification above.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(() => { const ranking = calculatePriority({ category: watchedCategory, institutionalCategory: watchedInstitutionalCategory, participationStatus: watchedParticipationStatus, targetGroup: watchedTargetGroup, fixedPriority: watchedFixedPriority, date: watchedDate }); return <>
                  <PredictionMetric label="Urgency Points" value={String(ranking.urgencyPoints)} />
                  <PredictionMetric label="Impact Points" value={String(ranking.impactPoints)} />
                  <PredictionMetric label="Priority Score" value={`${ranking.priorityScore}/9`} />
                  <PredictionMetric label="Priority Tier" value={ranking.priorityTier} />
                </>; })()}
              </div>
              <label className="mt-4 flex items-start gap-3 text-sm text-foreground">
                <input type="checkbox" {...form.register("fixedPriority")} />
                <span><strong>Fixed Priority</strong><span className="block text-muted-foreground">Treat this event as a priority regardless of its calculated ranking score.</span></span>
              </label>
            </section>

            <section className="space-y-4">
              <h3 className="border-b pb-2 text-sm font-semibold uppercase tracking-wide text-primary">Organizational Information</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <TextField control={form.control} name="requestedBy" label="Requested By" placeholder="Enter requester name" optional />
                <TextField control={form.control} name="collegeOffice" label="College/Office" placeholder="Enter college or office" required />
                <TextField control={form.control} name="numberOfPax" label="No. of Pax" placeholder="Enter expected participants" type="number" min={1} required />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="border-b pb-2 text-sm font-semibold uppercase tracking-wide text-primary">Content</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2"><TextAreaField control={form.control} name="description" label="Description" rows={3} optional /></div>
                <div className="md:col-span-2"><TextAreaField control={form.control} name="remarks" label="Remarks" placeholder="Additional notes or special instructions for participants" rows={2} optional /></div>
                <TextField control={form.control} name="resourceTitle" label="Resource Title" placeholder="e.g. Event handbook or pubmat" optional />
                <TextField control={form.control} name="resourceUrl" label="Resource Link" placeholder="https://..." helperText="Provide an HTTPS link to the event handbook, publication material, or other relevant information." optional />
              </div>
            </section>

            <section className="rounded-lg border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-foreground">Objectives</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    At least {MIN_OBJECTIVES} objectives are required. Add more if needed.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addObjective}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  Add Objective
                </Button>
              </div>
              {form.formState.errors.objectives?.root ? (
                <p role="alert" className="mt-2 text-sm text-danger">{form.formState.errors.objectives.root.message}</p>
              ) : null}
              <div className="mt-4 grid gap-3">
                {objectiveFields.map((field, index) => (
                  <div key={field.id} className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <TextField
                        control={form.control}
                        name={`objectives.${index}.value` as FieldPath<EventFormValues>}
                        label={`Objective ${index + 1}`}
                      />
                    </div>
                    {index >= MIN_OBJECTIVES ? (
                      <div className="self-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeObjective(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4 rounded-lg border bg-surface p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="font-semibold text-foreground">Attendance Forecast</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">A compact preview of expected turnout based on the selected participants.</p>
            <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
              Based on the current student list
              {dominantSelectedYear ? `, mostly Year ${dominantSelectedYear}` : ""}
              {dominantSelectedSection ? ` from ${dominantSelectedSection}` : ""}.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <PredictionMetric label="Predicted Attendance" value={`${predictedPercentage}%`} />
              <PredictionMetric label="Expected Attendees" value={String(expectedAttendees)} detail={`of ${selectedIds.length} selected`} />
            </div>

            <div className="rounded-lg border bg-background p-3.5">
              <p className="text-xs font-medium uppercase text-muted-foreground">Ranked factors</p>
              <div className="mt-3 space-y-2.5">
                {attendanceFactors.map((factor) => (
                  <div key={factor.label} className="grid gap-1">
                    <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                      <span className="min-w-0 truncate text-foreground">{factor.label}</span>
                      <span className="font-medium text-muted-foreground">{factor.importance}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${factor.importance}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="space-y-5 rounded-lg border bg-surface p-5 shadow-sm">
          <CreateEventSectionHeader
            eyebrow="Participants"
            title="Participant Selection"
            description="Choose all students or build a compact participant list for this event."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">Participants</h2>
              <p className="text-sm text-muted-foreground">{selectedIds.length} selected participants</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="default" onClick={selectAllFiltered}>All Students</Button>
              <Button type="button" variant="outline" onClick={() => setSelectedIds([])}>Clear selected students</Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <SearchInput value={search} placeholder="Search students" onChange={setSearch} />
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={programId} onChange={(event) => setProgramId(event.target.value)} aria-label="Program filter">
              <option value="">All programs</option>
              {catalog.programs.data?.items.map((program) => <option key={program.id} value={program.id}>{program.code}</option>)}
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={yearLevel} onChange={(event) => setYearLevel(event.target.value)} aria-label="Year level filter">
              <option value="">All year levels</option>
              {[1, 2, 3, 4].map((level) => <option key={level} value={String(level)}>Year {level}</option>)}
            </select>
            <select className="plpass-field h-10 rounded-md border px-3 text-sm" value={section} onChange={(event) => setSection(event.target.value)} aria-label="Section filter">
              <option value="">All sections</option>
              {["A", "B"].map((item) => <option key={item} value={item}>Section {item}</option>)}
            </select>
          </div>
          {participantError ? <p role="alert" aria-live="assertive" className="text-sm text-danger">{participantError}</p> : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="max-h-[360px] overflow-y-auto rounded-lg border bg-background p-3">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {students.length ? students.map((student) => (
                  <label key={student.id} className="flex items-start gap-3 rounded-lg border bg-surface p-3 text-sm transition-colors hover:border-primary/30 hover:bg-primary/5">
                    <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground">{student.fullName ?? student.studentNumber}</span>
                      <span className="block text-xs text-muted-foreground">{student.studentNumber}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{programById.get(student.programId) ?? student.programId} - Year {student.yearLevel} - {student.section}</span>
                    </span>
                  </label>
                )) : <EmptyState title="No students found" />}
              </div>
            </div>

            <aside className="rounded-lg border bg-background p-4">
              <h3 className="font-semibold text-foreground">Selected Participants</h3>
              <p className="mt-1 text-sm text-muted-foreground">{selectedStudents.length} selected students</p>
              <div className="mt-4 max-h-72 overflow-y-auto rounded-md border bg-surface p-3">
                {selectedStudents.length ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedStudents.map((student) => (
                      <span key={student.id} className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                        {student.fullName ?? student.studentNumber}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No selected participants yet.</p>
                )}
              </div>
            </aside>
          </div>
        </section>
        {mutations.createEventMutation.isError ? <ErrorState title="Unable to create event" message="Check the required fields and selected participants." /> : null}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-surface p-4 shadow-sm">
          <div>
            <h2 className="font-semibold text-foreground">Publish Event</h2>
            <p className="mt-1 text-sm text-muted-foreground">Publishes immediately and notifies the selected students.</p>
          </div>
          <SubmitButton
            isSubmitting={mutations.createEventMutation.isPending}
            submittingLabel="Publishing Event…"
            onClick={() => {
              if (selectedIds.length === 0) {
                setParticipantError("Select at least one participant.");
              }
            }}
          >
            Publish Event
          </SubmitButton>
        </section>
      </form>
    </OrganizerFrame>
  );
}
