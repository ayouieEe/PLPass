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
import { DataTable } from "@/components/tables/DataTable";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LatestTapResultCard } from "@/features/attendance/LatestTapResultCard";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { ManualLookupPanel } from "@/features/attendance/ManualLookupPanel";
import { NFCReaderInput } from "@/features/attendance/NFCReaderInput";
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
import type { AttendanceSimulationResult } from "@/services/contracts";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
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

const eventFormSchema = z
  .object({
    code: z.string().min(2, "Event code is required."),
    title: z.string().min(3, "Event name is required."),
    category: z.string().min(2, "Category is required."),
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    endTime: z.string().min(1, "End time is required."),
    attendanceMode: z.enum(["face-to-face", "online"]),
    description: z.string().optional(),
    remarks: z.string().optional()
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ["endTime"],
    message: "End time must be after start time."
  });

const sessionFormSchema = z
  .object({
    venue: z.string().min(2, "Venue is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required."),
    attendanceMode: z.enum(["face-to-face", "online"])
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
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
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
  const eventDate = event.startsAt.slice(0, 10);
  return semesters.find((semester) => eventDate >= semester.startsAt && eventDate <= semester.endsAt)?.id;
}

function eventMatchesDateRange(event: Event, dateFrom: string, dateTo: string) {
  const date = event.startsAt.slice(0, 10);
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

export function CreateEventPage() {
  const scope = useOrganizerScope();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [programId, setProgramId] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [section, setSection] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [participantError, setParticipantError] = useState("");
  const studentsQuery = useStudents({ pageSize: 500, search, programId: programId || undefined, yearLevel: yearLevel ? Number(yearLevel) : undefined, section: section || undefined }, scope.context);
  const catalog = useAcademicCatalog({ pageSize: 50 }, scope.context);
  const mutations = useEventMutations(scope.context);
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: { code: "", title: "", category: "", venue: "", date: "", startTime: "", endTime: "", attendanceMode: "face-to-face", description: "", remarks: "" }
  });
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (studentsQuery.isLoading || catalog.programs.isLoading) {
    return <LoadingState label="Loading participant selector" />;
  }
  const students = studentsQuery.data?.items ?? [];
  const selectedStudents = selectedIds.map((id) => studentsQuery.data?.items.find((student) => student.id === id)).filter((student): student is Student => Boolean(student));
  function toggleStudent(studentId: string) {
    setSelectedIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]);
    setParticipantError("");
  }
  function selectAllFiltered() {
    setSelectedIds((current) => [...new Set([...current, ...students.map((student) => student.id)])]);
    setParticipantError("");
  }
  async function onSubmit(values: EventFormValues) {
    if (selectedIds.length === 0) {
      setParticipantError("Select at least one participant.");
      return;
    }
    const event = await mutations.createEventMutation.mutateAsync({ ...values, participantStudentIds: selectedIds });
    navigate(APP_ROUTES.organizerEvent(event.id));
  }
  return (
    <OrganizerFrame>
      <PageHeader eyebrow="Organizer" title="Create Event" description="Create a pending mock event and participant records through the repository layer." />
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <section className="grid gap-4 rounded-lg border bg-surface p-5 md:grid-cols-2">
          <TextField control={form.control} name="code" label="Event code" />
          <TextField control={form.control} name="title" label="Event name" />
          <TextField control={form.control} name="category" label="Category" />
          <TextField control={form.control} name="venue" label="Venue" />
          <DatePickerField control={form.control} name="date" label="Date" />
          <TimePickerField control={form.control} name="startTime" label="Start time" />
          <TimePickerField control={form.control} name="endTime" label="End time" />
          <SelectField control={form.control} name="attendanceMode" label="Attendance mode" options={[{ label: "Face-to-face", value: "face-to-face" }, { label: "Online", value: "online" }]} />
          <div className="md:col-span-2">
            <TextAreaField control={form.control} name="description" label="Description" />
          </div>
          <div className="md:col-span-2">
            <TextAreaField control={form.control} name="remarks" label="Remarks" />
          </div>
        </section>
        <section className="space-y-4 rounded-lg border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Participant selection</h2>
              <p className="text-sm text-muted-foreground">{selectedIds.length} selected participants</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={selectAllFiltered}>Select all filtered students</Button>
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
          {participantError ? <p className="text-sm text-danger">{participantError}</p> : null}
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {students.length ? students.map((student) => (
              <label key={student.id} className="flex items-center gap-3 rounded-lg border bg-background p-3 text-sm">
                <input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                <span>
                  <span className="block font-medium">{student.studentNumber}</span>
                  <span className="text-muted-foreground">{student.programId} - Year {student.yearLevel} - {student.section}</span>
                </span>
              </label>
            )) : <EmptyState title="No students found" />}
          </div>
          <div className="rounded-lg border bg-background p-3">
            <h3 className="font-medium">Review selected participants</h3>
            <p className="mt-1 text-sm text-muted-foreground">{selectedStudents.length ? selectedStudents.map((student) => student.studentNumber).join(", ") : "No selected participants yet."}</p>
          </div>
        </section>
        {mutations.createEventMutation.isError ? <ErrorState title="Unable to create event" message="Check the required fields and selected participants." /> : null}
        <SubmitButton
          isSubmitting={mutations.createEventMutation.isPending}
          onClick={() => {
            if (selectedIds.length === 0) {
              setParticipantError("Select at least one participant.");
            }
          }}
        >
          Create pending event
        </SubmitButton>
      </form>
    </OrganizerFrame>
  );
}
