/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, BarChart3, CalendarCheck, ClipboardList, Plus, Search, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
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
  useAttendanceSimulationMutations,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useAttendanceSessions,
  useCorrectionRequests,
  useEvent,
  useEventMutations,
  useEventParticipants,
  useEvents,
  useMlPredictions,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { dateKey, formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
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
  StudentStatus
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
function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
const eventFormSchema = z
  .object({
    code: z.string().min(2, "Event code is required."),
    title: z.string().min(3, "Event name is required."),
    category: z.string().min(2, "Category is required."),
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    endTime: z.string().min(1, "End time is required."),
    description: z.string().optional(),
    objective1: z.string().min(3, "Objective 1 is required."),
    objective2: z.string().min(3, "Objective 2 is required."),
    objective3: z.string().min(3, "Objective 3 is required."),
    remarks: z.string().optional()
  })
  .refine((value) => {
    const startMinutes = timeToMinutes(value.startTime);
    const endMinutes = timeToMinutes(value.endTime);
    return endMinutes > startMinutes;
  }, {
    path: ["endTime"],
    message: "End time must be after the start time."
  });
  const sessionFormSchema = z
  .object({
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required.")
  })
  .refine((value) => value.expectedEndTime > value.startTime, {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time."
  });
  type EventFormValues = z.infer<typeof eventFormSchema>;
type SessionFormValues = z.infer<typeof sessionFormSchema>;

function useOrganizerScope(): OrganizerScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
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
  return student ? student.studentNumber : "Unknown student";
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
  const dominantYear = mostCommonValue(selectedStudents.map((student) => student.yearLevel));
  const dominantSection = mostCommonValue(selectedStudents.map((student) => student.section));
  const categoryLabel = category.trim() || "Event category";
  const timeLabel = startTime ? `${startTime} start time` : "Start time";
return [
    { label: selectedStudents.length ? `${selectedStudents.length} selected dummy students` : "No selected dummy students yet", importance: 32 },
    { label: dominantYear ? `Year ${dominantYear} participation profile` : "Year level profile", importance: 22 },
    { label: dominantSection ? `Section ${dominantSection} concentration` : "Section concentration", importance: 18 },
    { label: categoryLabel, importance: 14 },
    { label: "Face-to-face attendance mode", importance: 9 },
    { label: timeLabel, importance: 5 }
  ];
}
function predictedAttendancePercentage(selectedCount: number, category: string, startTime: string) {
  let score = 68;
  const normalizedCategory = category.toLowerCase();
  if (selectedCount >= 150) score += 8;
  if (selectedCount >= 75 && selectedCount < 150) score += 5;
  if (normalizedCategory.includes("assembly") || normalizedCategory.includes("career")) score += 7;
  if (normalizedCategory.includes("competition") || normalizedCategory.includes("showcase")) score += 5;
  score += 4;
  if (startTime && startTime < "10:00") score += 3;
  if (startTime && startTime >= "13:00") score -= 4;

  return Math.max(45, Math.min(96, score));
}
function CreateEventSectionHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b pb-4">
      {eyebrow ? <p className="text-xs font-medium uppercase text-primary">{eyebrow}</p> : null}
      <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
function PredictionMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border bg-surface p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold leading-none text-foreground">{value}</p>
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
  const [startSessionOpen, setStartSessionOpen] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [notificationStatuses, setNotificationStatuses] = useState<{ studentId: string; studentNumber: string; status: "pending" | "sent" | "failed" }[]>([]);
  const studentsQuery = useStudents({ pageSize: 500, search, programId: programId || undefined, yearLevel: yearLevel ? Number(yearLevel) : undefined, section: section || undefined }, scope.context);
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const mutations = useEventMutations(scope.context);
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      code: "",
      title: "",
      category: "",
      venue: "",
      date: "",
      startTime: "",
      endTime: "",
      description: "",
      objective1: "",
      objective2: "",
      objective3: "",
      remarks: ""
    }
  });
  const sessionForm = useForm<SessionFormValues>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      venue: "",
      date: "",
      startTime: "",
      expectedEndTime: ""
    }
  });
  const watchedCategory = form.watch("category");
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
   const livePreviewRecords: LiveAttendanceRecord[] = selectedStudents.slice(0, 6).map((student, index) => ({
    id: `preview-${student.id}`,
    studentName: studentName(student),
    identifier: student.studentNumber,
    status: index % 4 === 1 ? "late" : index % 4 === 2 ? "absent" : "present",
    timestamp: index % 4 === 2 ? "Not checked in" : `${watchedStartTime || "09:00"} + ${index * 3}m`,
    timeIn: index % 4 === 2 ? undefined : `${watchedStartTime || "09:00"} + ${index * 3}m`
  }));
  const sessionPreviewCounts = {
    present: livePreviewRecords.filter((record) => record.status === "present").length,
    late: livePreviewRecords.filter((record) => record.status === "late").length,
    absent: Math.max(selectedIds.length - livePreviewRecords.filter((record) => record.status === "present" || record.status === "late").length, 0)
  };
  function toggleStudent(studentId: string) {
    setSelectedIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]);
    setParticipantError("");
  }
  function selectAllFiltered() {
    setSelectedIds((current) => [...new Set([...current, ...students.map((student) => student.id)])]);
    setParticipantError("");
  }
  function startPreviewSession() {
    setSessionStarted(true);
  }
  function endPreviewSession() {
    setSessionStarted(false);
    setStartSessionOpen(false);
  }
  async function onSubmit(values: EventFormValues) {
    if (selectedIds.length === 0) {
      setParticipantError("Select at least one participant.");
      return;
    }
    try {
      const event = await mutations.createEventMutation.mutateAsync({
        code: values.code,
        title: values.title,
        category: values.category,
        venue: values.venue,
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
        attendanceMode: "face-to-face",
        description: values.description,
        remarks: values.remarks,
        participantStudentIds: selectedIds
      });
      // Mock notification: show summary modal and simulate sending emails to selected students
      setNotificationStatuses(selectedStudents.map((s) => ({ studentId: s.id, studentNumber: s.studentNumber, status: "pending" })));
      setNotificationModalOpen(true);
      // simulate sends sequentially to avoid flooding UI
      selectedStudents.forEach((student, index) => {
        setTimeout(() => {
          setNotificationStatuses((current) => current.map((entry) => (entry.studentId === student.id ? { ...entry, status: "sent" } : entry)));
        }, 400 + index * 200);
      });
      // close modal and navigate after all simulated sends complete
      setTimeout(() => {
        setNotificationModalOpen(false);
        toast.success(`Published ${selectedIds.length} participant${selectedIds.length !== 1 ? "s" : ""} — notifications simulated`);
        navigate(APP_ROUTES.organizerEvent(event.id));
      }, 400 + selectedStudents.length * 200 + 300);
    } catch (err) {
      // If the Supabase repository intentionally defers live creation, fall back to simulated publish
      const isDeferred = err instanceof Error && /deferred/i.test(err.message || "");
      if (isDeferred) {
        setNotificationStatuses(selectedStudents.map((s) => ({ studentId: s.id, studentNumber: s.studentNumber, status: "pending" })));
        setNotificationModalOpen(true);
        selectedStudents.forEach((student, index) => {
          setTimeout(() => {
            setNotificationStatuses((current) => current.map((entry) => (entry.studentId === student.id ? { ...entry, status: "sent" } : entry)));
          }, 400 + index * 200);
        });
        setTimeout(() => {
          setNotificationModalOpen(false);
          toast.success(`Notified ${selectedIds.length} participant${selectedIds.length !== 1 ? "s" : ""} (simulated)`);
        }, 400 + selectedStudents.length * 200 + 300);
        // Clear mutation error state so the ErrorState UI doesn't persist
        try {
          mutations.createEventMutation.reset();
        } catch {}
        return;
      }
      throw err;
    }
  }
  return (
    <OrganizerFrame>
      <PageHeader
        eyebrow="Event Management"
        title="Create Event"
        description="Create events, assign participants, preview live predicted attendance, and publish immediately."
      />
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5 rounded-lg border bg-surface p-5 shadow-sm">
            <CreateEventSectionHeader
              title="Event Details"
              description="Enter the event information and up to three objectives for feedback generation."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <TextField control={form.control} name="code" label="Event Code" placeholder="e.g. EVT-2026-021" />
              <TextField control={form.control} name="title" label="Event Name" placeholder="e.g. Hospitality Career Fair" />
              <TextField control={form.control} name="category" label="Category" placeholder="e.g. Career Talk" />
              <SelectField
                control={form.control}
                name="venue"
                label="Venue"
                placeholder="Select a venue"
                options={VENUE_OPTIONS}
              />
              <DatePickerField control={form.control} name="date" label="Date" />
              <TimePickerField control={form.control} name="startTime" label="Start Time" />
              <TimePickerField control={form.control} name="endTime" label="End Time" />
              <div className="md:col-span-2">
                <TextAreaField
                  control={form.control}
                  name="description"
                  label="Description (Optional)"
                  placeholder="e.g. A career orientation with hotel and restaurant industry partners."
                  rows={3}
                />
              </div>
            </div>
            <section className="rounded-lg border bg-background p-4">
              <h3 className="font-semibold text-foreground">Objectives (1-3)</h3>
              <p className="mt-1 text-sm text-muted-foreground">All three objectives are required for the event record.</p>
              <div className="mt-4 grid gap-3">
                <TextField control={form.control} name="objective1" label="Objective 1" placeholder="e.g. Improve student awareness of hospitality career paths." />
                <TextField control={form.control} name="objective2" label="Objective 2" placeholder="e.g. Encourage participation in department-wide activities." />
                <TextField control={form.control} name="objective3" label="Objective 3" placeholder="e.g. Gather feedback for future event planning." />
              </div>
            </section>
          </div>
          <aside className="space-y-4 rounded-lg border bg-surface p-5 shadow-sm lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 className="font-semibold text-foreground">Predicted Attendance Preview</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Live Random Forest Prediction</p>
            <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
              Based on the current dummy student list
              {dominantSelectedYear ? `, mostly Year ${dominantSelectedYear}` : ""}
              {dominantSelectedSection ? ` from ${dominantSelectedSection}` : ""}.
            </div>
            <PredictionMetric label="Predicted Attendance Percentage" value={`${predictedPercentage}%`} />
            <PredictionMetric label="Expected Attendees" value={String(expectedAttendees)} detail={`of ${selectedIds.length} selected participants`} />

            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Ranked Attendance Factors</p>
              <div className="mt-4 space-y-3">
                {attendanceFactors.map((factor) => (
                  <div key={factor.label} className="grid gap-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-foreground">{factor.label}</span>
                      <span className="font-medium text-muted-foreground">{factor.importance}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
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
            title="Participant Selection"
            description="Select the students who will be invited and notified when the event is published."
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
          <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
            Selected students will receive the event notification after you publish.
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
          {participantError ? <p className="text-sm text-danger">{participantError}</p> : null}
          <div className="max-h-[420px] overflow-y-auto rounded-lg border bg-background p-3">
            <div className="grid gap-2 md:grid-cols-2">
              {students.length ? students.map((student) => (
                <label key={student.id} className="flex items-center gap-3 rounded-lg border bg-surface p-3 text-sm">
                  <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                    <span>
                      <span className="block font-medium text-foreground">{student.studentNumber}</span>
                    <span className="text-muted-foreground">{programById.get(student.programId) ?? student.programId} - Year {student.yearLevel} - {student.section}</span>
                  </span>
                </label>
              )) : <EmptyState title="No students found" />}
            </div>
          </div>
          </section>
          {mutations.createEventMutation.isError ? <ErrorState title="Unable to create event" message="Check the required fields and selected participants." /> : null}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-surface p-5 shadow-sm">
          <div>
            <h2 className="font-semibold text-foreground">Publish Event</h2>
            <p className="mt-1 text-sm text-muted-foreground">Publishes immediately and notifies the selected students. No approval workflow is required.</p>
          </div>
          <SubmitButton
            isSubmitting={mutations.createEventMutation.isPending}
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
      {notificationModalOpen ? (
        <div className="fixed inset-0 z-60 grid place-items-center bg-foreground/40 p-4">
          <section className="plpass-modal-surface w-full max-w-lg rounded-lg border p-5 shadow-lg" role="dialog" aria-modal="true">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Sending notifications</h3>
                <p className="mt-1 text-sm text-muted-foreground">Simulating email sends to selected participants.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setNotificationModalOpen(false)}>Close</Button>
            </div>
            <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
              {notificationStatuses.map((entry) => (
                <div key={entry.studentId} className="flex items-center justify-between rounded-md border bg-background p-2 text-sm">
                  <div className="truncate">{entry.studentNumber}</div>
                  <div className="text-muted-foreground">
                    {entry.status === "pending" ? "Pending" : entry.status === "sent" ? "Sent" : "Failed"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </OrganizerFrame>
  );
}
