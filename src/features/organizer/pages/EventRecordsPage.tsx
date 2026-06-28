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

export function EventRecordsPage() {
  const scope = useOrganizerScope();
  const [status, setStatus] = useState("all");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedCorrection, setSelectedCorrection] = useState<CorrectionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.organizerId) {
    return shellState;
  }
  if (eventsQuery.isLoading || sessionsQuery.isLoading || recordsQuery.isLoading || studentsQuery.isLoading || correctionsQuery.isLoading) {
    return <LoadingState label="Loading event records" />;
  }
  if (sessionsQuery.isError || correctionsQuery.isError) {
    return <ErrorState title="Unable to load event records" message="The mock records repositories returned an error." />;
  }
  const events = eventsQuery.data?.items ?? [];
  const records = recordsQuery.data?.items ?? [];
  const students = studentsQuery.data?.items ?? [];
  const sessions = (sessionsQuery.data?.items ?? []).filter((session) => status === "all" || session.status === status);
  const selectedRecords = selectedSessionId ? records.filter((record) => record.sessionId === selectedSessionId) : [];
  const sessionColumns: ColumnDef<AttendanceSession>[] = [
    { id: "code", header: "Event code", cell: ({ row }) => events.find((event) => event.id === row.original.eventId)?.code ?? "Event" },
    { id: "name", header: "Event name", cell: ({ row }) => events.find((event) => event.id === row.original.eventId)?.title ?? row.original.title },
    { id: "category", header: "Category", cell: ({ row }) => events.find((event) => event.id === row.original.eventId)?.category ?? "Event" },
    { id: "venue", header: "Venue", cell: ({ row }) => events.find((event) => event.id === row.original.eventId)?.venue ?? "Venue" },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.startsAt) },
    { id: "time", header: "Session time", cell: ({ row }) => `${formatTime(row.original.startsAt)} - ${formatTime(row.original.endsAt)}` },
    { id: "present", header: "Present count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).present },
    { id: "late", header: "Late count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).late },
    { id: "absent", header: "Absent count", cell: ({ row }) => attendanceCounts(recordsForSession(records, row.original.id)).absent },
    { accessorKey: "status", header: "Session status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "action", header: "View details", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => setSelectedSessionId(row.original.id)}>Details</Button> }
  ];
  const detailColumns: ColumnDef<AttendanceRecord>[] = [
    { id: "student", header: "Student name", cell: ({ row }) => studentName(students.find((student) => student.id === row.original.studentId)) },
    { id: "number", header: "Student number", cell: ({ row }) => students.find((student) => student.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { accessorKey: "status", header: "Attendance status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { accessorKey: "verificationMethod", header: "Verification method" },
    { id: "time", header: "Time recorded", cell: ({ row }) => formatTime(row.original.recordedAt) },
    { accessorKey: "note", header: "Remarks" },
    { id: "correction", header: "Correction request status", cell: ({ row }) => correctionsQuery.data?.items.find((request) => request.attendanceRecordId === row.original.id)?.status ?? "None" }
  ];
  const correctionColumns: ColumnDef<CorrectionRequest>[] = [
    { id: "student", header: "Student name", cell: ({ row }) => studentName(students.find((student) => student.id === row.original.studentId)) },
    { id: "number", header: "Student number", cell: ({ row }) => students.find((student) => student.id === row.original.studentId)?.studentNumber ?? row.original.studentId },
    { id: "event", header: "Event", cell: ({ row }) => eventLabel(events.find((event) => event.id === row.original.eventId)) },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(records.find((record) => record.id === row.original.attendanceRecordId)?.recordedAt) },
    { accessorKey: "requestedStatus", header: "Request type" },
    { accessorKey: "reason", header: "Explanation summary" },
    { id: "attachment", header: "Attachment", cell: () => "Placeholder" },
    { id: "submitted", header: "Submitted date", cell: ({ row }) => formatDate(row.original.requestedAt) },
    { accessorKey: "status", header: "Request status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "action", header: "Review action", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCorrection(row.original)}>Review</Button> }
  ];
  async function approveCorrection() {
    if (!selectedCorrection) return;
    await correctionsQuery.reviewMutation.mutateAsync({ requestId: selectedCorrection.id, status: "approved" });
    setSelectedCorrection(null);
  }
  async function rejectCorrection() {
    if (!selectedCorrection) return;
    await correctionsQuery.reviewMutation.mutateAsync({ requestId: selectedCorrection.id, status: "rejected", reason: rejectReason });
    setSelectedCorrection(null);
    setRejectReason("");
  }
  return (
    <OrganizerFrame>
      <PageHeader eyebrow="Organizer" title="Event Records" description="Event sessions, attendance details, and event-based correction review." actions={<><Button disabled variant="outline">Generate PDF</Button><Button disabled variant="outline">Generate XLSX</Button></>} />
      <FilterBar search="" selectedFilter={status} filters={[{ label: "All", value: "all" }, { label: "Draft", value: "draft" }, { label: "Active", value: "active" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }]} onSearchChange={() => undefined} onFilterChange={setStatus} />
      <DataTable data={sessions} columns={sessionColumns} emptyTitle="No event sessions" />
      {selectedSessionId ? (
        <section className="rounded-lg border bg-surface p-4">
          <h2 className="font-semibold">Session detail panel</h2>
          <div className="mt-4">
            <DataTable data={selectedRecords} columns={detailColumns} emptyTitle="No student attendance records" />
          </div>
        </section>
      ) : null}
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="font-semibold">Correction Request Review</h2>
        <div className="mt-4">
          <DataTable data={correctionsQuery.data?.items ?? []} columns={correctionColumns} emptyTitle="No event correction requests" />
        </div>
      </section>
      {selectedCorrection ? (
        <section className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-lg border bg-popover p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Review event correction request</h2>
            <p className="mt-2 text-sm text-muted-foreground">{selectedCorrection.reason}</p>
            <div className="mt-4 rounded-lg border bg-surface p-3 text-sm">Attachment placeholder, attendance context, and prior mock audit history are shown as review context.</div>
            <label className="mt-4 block space-y-1.5">
              <span className="text-sm font-medium">Reject reason</span>
              <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedCorrection(null)}>Close</Button>
              <Button type="button" onClick={approveCorrection}>Approve</Button>
              <Button type="button" variant="destructive" onClick={rejectCorrection}>Reject</Button>
            </div>
          </div>
        </section>
      ) : null}
    </OrganizerFrame>
  );
}
