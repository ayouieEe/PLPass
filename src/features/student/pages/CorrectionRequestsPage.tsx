/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CalendarCheck, ClipboardList, Nfc, UserCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { NavLink, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { SelectField } from "@/components/forms/SelectField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { AttachmentUploader } from "@/components/shared/AttachmentUploader";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { DataTable } from "@/components/tables/DataTable";
import { FilterBar } from "@/components/tables/FilterBar";
import { Button } from "@/components/ui/button";
import { ReportFilterPanel } from "@/features/reports/ReportFilterPanel";
import { ReportHistoryTable } from "@/features/reports/ReportHistoryTable";
import type { ReportHistoryRecord } from "@/features/reports/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAcademicCatalog,
  useAttendanceRecords,
  useAttendanceSessions,
  useClasses,
  useCorrectionRequests,
  useEvents,
  useFacultyProfiles,
  useNfcCredentialForStudent,
  useNfcCredentialRequests,
  useNfcTapAttempts,
  useOrganizerProfiles,
  useReports,
  useStudents
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type {
  AttendanceRecord,
  AttendanceSession,
  Class,
  CorrectionRequest,
  Event,
  FacultyProfile,
  NfcCredentialRequest,
  OrganizerProfile,
  Report,
  Student
} from "@/types/domain";
import type {
  AttendanceStatus,
  CorrectionRequestStatus,
  EventStatus,
  NfcCredentialRequestStatus,
  NfcCredentialStatus,
  SessionStatus
} from "@/types/enums";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  studentName: string;
  isLoading: boolean;
  isError: boolean;
};

type AttendanceRow = {
  id: string;
  kind: "class" | "event";
  record: AttendanceRecord;
  session?: AttendanceSession;
  classRecord?: Class;
  event?: Event;
  faculty?: FacultyProfile;
  organizer?: OrganizerProfile;
};

type ScheduleRow = {
  id: string;
  kind: "class" | "event";
  name: string;
  code: string;
  venue: string;
  startsAt: string;
  endsAt?: string;
  owner: string;
  mode: string;
  status: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

const correctionSchema = z.object({
  attendanceRecordId: z.string().min(1, "Select a related attendance record."),
  requestedStatus: z.enum(["present", "late", "absent", "excused"]),
  reason: z.string().min(12, "Explanation must be at least 12 characters.")
});

const nfcRequestSchema = z.object({
  type: z.enum(["lost", "damaged", "replacement"]),
  reason: z.string().min(10, "Reason must be at least 10 characters.")
});

type CorrectionFormValues = z.infer<typeof correctionSchema>;
type NfcRequestFormValues = z.infer<typeof nfcRequestSchema>;

function useStudentScope(): StudentScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const studentQuery = useStudents({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "student" },
    student: studentQuery.data?.items[0],
    studentName: session?.displayName ?? "Student",
    isLoading: studentQuery.isLoading,
    isError: studentQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatTime(value: string | undefined) {
  return value ? timeFormatter.format(new Date(value)) : "Not set";
}

function statusTone(
  status:
    | AttendanceStatus
    | SessionStatus
    | CorrectionRequestStatus
    | EventStatus
    | NfcCredentialStatus
    | NfcCredentialRequestStatus
) {
  if (["present", "completed", "approved", "activated"].includes(status)) {
    return "success" as const;
  }
  if (["late", "draft", "pending", "inactive", "damaged", "replacement"].includes(status)) {
    return "warning" as const;
  }
  if (["absent", "cancelled", "rejected", "blocked", "lost"].includes(status)) {
    return "danger" as const;
  }
  return "muted" as const;
}

function maskCredential(value: string | undefined) {
  if (!value) {
    return "Not available";
  }
  return `${value.slice(0, 3)}-${"*".repeat(Math.max(value.length - 6, 4))}-${value.slice(-3)}`;
}

function attendanceRate(records: AttendanceRecord[]) {
  if (records.length === 0) {
    return 0;
  }
  const attended = records.filter((record) => record.status === "present" || record.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

function ShellState({ scope }: { scope: StudentScope }) {
  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }
  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in mock account does not have a student profile fixture." />;
  }
  return null;
}

function StudentFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

function buildAttendanceRows(
  records: AttendanceRecord[],
  sessions: AttendanceSession[],
  classes: Class[],
  events: Event[],
  faculty: FacultyProfile[],
  organizers: OrganizerProfile[]
): AttendanceRow[] {
  return records.map((record) => {
    const session = sessions.find((entry) => entry.id === record.sessionId);
    const classRecord = classes.find((entry) => entry.id === session?.classId);
    const event = events.find((entry) => entry.id === session?.eventId);
    return {
      id: record.id,
      kind: session?.type ?? (classRecord ? "class" : "event"),
      record,
      session,
      classRecord,
      event,
      faculty: faculty.find((entry) => entry.id === classRecord?.facultyId),
      organizer: organizers.find((entry) => entry.id === event?.organizerId)
    };
  });
}

function buildScheduleRows(classes: Class[], events: Event[], faculty: FacultyProfile[], organizers: OrganizerProfile[]): ScheduleRow[] {
  const classRows = classes.map((classRecord) => ({
    id: classRecord.id,
    kind: "class" as const,
    name: classRecord.subjectTitle,
    code: classRecord.subjectCode,
    venue: classRecord.room,
    startsAt: "2026-06-27T00:00:00.000Z",
    endsAt: "2026-06-27T01:00:00.000Z",
    owner: faculty.find((profile) => profile.id === classRecord.facultyId)?.title ?? "Faculty",
    mode: "required",
    status: classRecord.status
  }));
  const eventRows = events.map((event) => ({
    id: event.id,
    kind: "event" as const,
    name: event.title,
    code: event.code,
    venue: event.venue,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    owner: organizers.find((profile) => profile.id === event.organizerId)?.organizationName ?? "Organizer",
    mode: "required",
    status: event.status
  }));
  return [...classRows, ...eventRows].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function attendanceColumns(onDetails: (row: AttendanceRow) => void): ColumnDef<AttendanceRow>[] {
  return [
    { id: "code", header: "Code", cell: ({ row }) => row.original.classRecord?.subjectCode ?? row.original.event?.code ?? "N/A" },
    { id: "name", header: "Name", cell: ({ row }) => row.original.classRecord?.subjectTitle ?? row.original.event?.title ?? row.original.session?.title ?? "Unknown" },
    { id: "owner", header: "Faculty or organizer", cell: ({ row }) => row.original.faculty?.title ?? row.original.organizer?.organizationName ?? "N/A" },
    { id: "section", header: "Section or venue", cell: ({ row }) => row.original.classRecord?.section ?? row.original.event?.venue ?? "N/A" },
    { id: "date", header: "Session date", cell: ({ row }) => formatDate(row.original.session?.startsAt) },
    { id: "time", header: "Session time", cell: ({ row }) => `${formatTime(row.original.session?.startsAt)} - ${formatTime(row.original.session?.endsAt)}` },
    { id: "status", header: "Attendance status", cell: ({ row }) => <StatusBadge label={row.original.record.status} tone={statusTone(row.original.record.status)} /> },
    { accessorKey: "record.verificationMethod", header: "Verification method" },
    { id: "action", header: "View details", cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => onDetails(row.original)}>Details</Button> }
  ];
}

function ScheduleCard({ item }: { item: ScheduleRow }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{item.code} - {item.name}</p>
          <p className="text-sm text-muted-foreground">{formatDate(item.startsAt)} {formatTime(item.startsAt)} - {formatTime(item.endsAt)} - {item.venue}</p>
        </div>
        <StatusBadge label={item.kind} tone={item.kind === "class" ? "info" : "success"} />
      </div>
    </article>
  );
}

function ActivityCard({ record, session }: { record: AttendanceRecord; session?: AttendanceSession }) {
  return (
    <article className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{session?.title ?? "Attendance session"}</p>
          <p className="text-sm text-muted-foreground">{formatDate(record.recordedAt)} - {record.verificationMethod}</p>
        </div>
        <StatusBadge label={record.status} tone={statusTone(record.status)} />
      </div>
    </article>
  );
}

function CalendarList({ rows }: { rows: AttendanceRow[] }) {
  if (!rows.length) {
    return <EmptyState title="No calendar attendance items" />;
  }
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Attendance calendar items">
      {rows.map((row) => (
        <article key={row.id} className="rounded-lg border bg-surface p-4">
          <p className="text-sm font-medium">{formatDate(row.session?.startsAt)}</p>
          <h2 className="mt-2 font-semibold">{row.classRecord?.subjectCode ?? row.event?.code} - {row.classRecord?.subjectTitle ?? row.event?.title}</h2>
          <StatusBadge label={row.record.status} tone={statusTone(row.record.status)} />
        </article>
      ))}
    </section>
  );
}

function AttendanceDetail({ row, corrections, onClose }: { row: AttendanceRow; corrections: CorrectionRequest[]; onClose: () => void }) {
  const request = corrections.find((entry) => entry.attendanceRecordId === row.record.id);
  return (
    <section className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-lg border bg-popover p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Attendance detail</h2>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["Class or event", row.classRecord?.subjectTitle ?? row.event?.title ?? row.session?.title],
            ["Attendance status", row.record.status],
            ["Verification method", row.record.verificationMethod],
            ["Recorded time", `${formatDate(row.record.recordedAt)} ${formatTime(row.record.recordedAt)}`],
            ["Remarks", row.record.note ?? "No remarks"],
            ["Correction request status", request?.status ?? "No request"]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-surface p-3">
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button asChild><NavLink to={APP_ROUTES.studentCorrections}>Available correction request action</NavLink></Button>
        </div>
      </div>
    </section>
  );

}

export function CorrectionRequestsPage() {
  const scope = useStudentScope();
  const recordsQuery = useAttendanceRecords({ pageSize: 500 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);
  const [selected, setSelected] = useState<CorrectionRequest | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const form = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: { attendanceRecordId: "", requestedStatus: "present", reason: "" }
  });
  const shellState = <ShellState scope={scope} />;
  if (shellState.props.scope.isLoading || shellState.props.scope.isError || !scope.student) {
    return shellState;
  }
  if (recordsQuery.isLoading || correctionsQuery.isLoading || sessionsQuery.isLoading) {
    return <LoadingState label="Loading correction requests" />;
  }
  async function submit(values: CorrectionFormValues) {
    const record = recordsQuery.data?.items.find((entry) => entry.id === values.attendanceRecordId);
    await correctionsQuery.createMutation.mutateAsync({
      studentId: scope.student?.id ?? "",
      attendanceRecordId: values.attendanceRecordId,
      classId: sessionsQuery.data?.items.find((session) => session.id === record?.sessionId)?.classId,
      eventId: sessionsQuery.data?.items.find((session) => session.id === record?.sessionId)?.eventId,
      requestedStatus: values.requestedStatus,
      reason: values.reason
    });
    toast.success("Correction request submitted.");
    form.reset({ attendanceRecordId: "", requestedStatus: "present", reason: "" });
  }
  const columns: ColumnDef<CorrectionRequest>[] = [
    { id: "record", header: "Class or event", cell: ({ row }) => row.original.classId ?? row.original.eventId ?? "Attendance record" },
    { id: "date", header: "Submitted date", cell: ({ row }) => formatDate(row.original.requestedAt) },
    { accessorKey: "requestedStatus", header: "Request type" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge label={row.original.status} tone={statusTone(row.original.status)} /> },
    { id: "reviewed", header: "Reviewed by", cell: ({ row }) => row.original.reviewedByUserId ?? "Pending" },
    { id: "reviewDate", header: "Review date", cell: ({ row }) => formatDate(row.original.reviewedAt) },
    { id: "action", header: "View details", cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => setSelected(row.original)}>Details</Button> }
  ];
  return (
    <StudentFrame>
      <PageHeader eyebrow="Student" title="Correction Requests" description="Submit and review your own attendance correction request history." />
      <form className="space-y-4 rounded-lg border bg-surface p-5" onSubmit={form.handleSubmit(submit)}>
        <h2 className="font-semibold">Create Request</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField control={form.control} name="attendanceRecordId" label="Category, class or event" options={(recordsQuery.data?.items ?? []).map((record) => ({ label: `${record.id} - ${record.status}`, value: record.id }))} />
          <SelectField control={form.control} name="requestedStatus" label="Request type" options={[{ label: "Excused absence", value: "excused" }, { label: "Attendance status correction", value: "present" }, { label: "Recorded time correction", value: "late" }, { label: "System issue", value: "absent" }]} />
          <AttachmentUploader label={`Attachment placeholder (${files.length} selected)`} onFilesSelected={setFiles} />
        </div>
        <TextAreaField control={form.control} name="reason" label="Explanation" />
        {correctionsQuery.createMutation.isError ? <p className="text-sm text-danger">Unable to submit. Check for duplicate pending requests and required fields.</p> : null}
        <SubmitButton isSubmitting={correctionsQuery.createMutation.isPending}>Submit correction request</SubmitButton>
      </form>
      <DataTable data={correctionsQuery.data?.items ?? []} columns={columns} emptyTitle="No correction requests" />
      {selected ? (
        <section className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl rounded-lg border bg-popover p-5 shadow-lg">
            <h2 className="text-lg font-semibold">Correction request details</h2>
            <p className="mt-2 text-sm text-muted-foreground">{selected.reason}</p>
            <div className="mt-4 rounded-lg border bg-surface p-3 text-sm">Original attendance record, attachment placeholder, staff decision, rejection reason, and safe audit timeline are represented by mock data.</div>
            <div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></div>
          </div>
        </section>
      ) : null}
    </StudentFrame>
  );
}
