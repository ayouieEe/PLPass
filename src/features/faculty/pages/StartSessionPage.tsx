import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, DoorOpen, GraduationCap, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { SelectField } from "@/components/forms/SelectField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { TextField } from "@/components/forms/TextField";
import { TimePickerField } from "@/components/forms/TimePickerField";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { ActiveSessionHeader } from "@/features/attendance/ActiveSessionHeader";
import { LiveAttendanceList } from "@/features/attendance/LiveAttendanceList";
import { SessionSummaryCards } from "@/features/attendance/SessionSummaryCards";
import type { LiveAttendanceRecord } from "@/features/attendance/types";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAttendanceRecords,
  useAttendanceSession,
  useAttendanceSessionMutations,
  useClasses,
  useFacultyProfiles,
  useStudentsForClass
} from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { AttendanceRecord, Class, Student } from "@/types/domain";

type FacultyScope = {
  context: RepositoryContext;
  facultyId?: string;
  facultyName: string;
  isLoading: boolean;
  isError: boolean;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function useFacultyScope(): FacultyScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const facultyQuery = useFacultyProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "faculty" },
    facultyId: facultyQuery.data?.items[0]?.id,
    facultyName: session?.displayName ?? "Faculty",
    isLoading: facultyQuery.isLoading,
    isError: facultyQuery.isError
  };
}

function classLabel(classRecord: Class | undefined) {
  return classRecord ? `${classRecord.subjectCode} ${classRecord.section}` : "Unknown class";
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function formatStartedAt(value: string | undefined) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not started";
}

function formatStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function recordsForSession(records: AttendanceRecord[], sessionId: string) {
  return records.filter((record) => record.sessionId === sessionId);
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
  if (records.length === 0) return 0;
  const attended = records.filter((record) => record.status === "present" || record.status === "late").length;
  return Math.round((attended / records.length) * 100);
}

/** Joins the full class roster with whatever attendance_records exist for this
 * session, so students who haven't tapped yet still show up (as "absent")
 * instead of being dropped from the list entirely.
 *
 * NOTE: Student has no name field yet (only studentNumber, via userId), so
 * studentNumber stands in for both studentName and identifier — swap in a
 * real name once one is available. AttendanceRecord also only carries a
 * single `recordedAt` timestamp (no separate time-in/time-out), so this
 * shows "time recorded" rather than two distinct times. */
function mapToLiveStatus(status: AttendanceRecord["status"] | undefined): LiveAttendanceRecord["status"] {
  if (status === "present") return "present";
  if (status === "late") return "late";
  // LiveAttendanceRecord has no "excused" state — "manual" is the closest fit.
  if (status === "excused") return "manual";
  return "absent";
}

function buildLiveRecords(students: Student[], sessionRecords: AttendanceRecord[]): LiveAttendanceRecord[] {
  return students.map((student) => {
    const record = sessionRecords.find((r) => r.studentId === student.id);
    return {
      id: record?.id ?? student.id,
      studentName: student.studentNumber,
      identifier: student.studentNumber,
      status: mapToLiveStatus(record?.status),
      timestamp: record?.recordedAt ?? ""
    };
  });
}

/* ------------------------------------------------------------------ */
/* Start Session modal — edits Room, Schedule, Mode                    */
/* ------------------------------------------------------------------ */

const startSessionSchema = z
  .object({
    room: z.string().min(2, "Room is required."),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    expectedEndTime: z.string().min(1, "Expected end time is required."),
    attendanceMode: z.enum(["face-to-face", "online"])
  })
  .refine((value) => value.expectedEndTime > value.startTime, {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time."
  });

type StartSessionValues = z.infer<typeof startSessionSchema>;

function StartSessionModal({
  classRecord,
  isSubmitting,
  onCancel,
  onConfirm
}: {
  classRecord: Class;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (values: StartSessionValues) => void;
}) {
  const form = useForm<StartSessionValues>({
    resolver: zodResolver(startSessionSchema),
    defaultValues: {
      room: classRecord.room,
      date: new Date().toISOString().slice(0, 10),
      startTime: "08:00",
      expectedEndTime: "09:00",
      attendanceMode: "face-to-face"
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-surface p-6 shadow-lg">
        <div className="border-b pb-4">
          <h2 className="text-lg font-semibold">Start class session</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {classRecord.subjectCode} · {classRecord.subjectTitle} · {classRecord.scheduleLabel}
          </p>
        </div>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onConfirm)}>
          <TextField control={form.control} name="room" label="Room" placeholder={classRecord.room} />
          <SelectField
            control={form.control}
            name="attendanceMode"
            label="Attendance mode"
            options={[
              { label: "Face-to-face", value: "face-to-face" },
              { label: "Online", value: "online" }
            ]}
          />
          <DatePickerField control={form.control} name="date" label="Date" />
          <div className="grid grid-cols-2 gap-2">
            <TimePickerField control={form.control} name="startTime" label="Start time" />
            <TimePickerField control={form.control} name="expectedEndTime" label="Expected end" />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <SubmitButton isSubmitting={isSubmitting}>Start session</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* End Session modal — confirm + reason for early/overtime             */
/* ------------------------------------------------------------------ */

const endSessionSchema = z
  .object({
    reason: z.enum(["on_time", "early_end", "overtime"]),
    remarks: z.string().optional()
  })
  .refine((value) => value.reason === "on_time" || Boolean(value.remarks && value.remarks.trim().length > 0), {
    path: ["remarks"],
    message: "Please explain why the session is ending early or running overtime."
  });

type EndSessionValues = z.infer<typeof endSessionSchema>;

function EndSessionModal({
  isSubmitting,
  onCancel,
  onConfirm
}: {
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (values: EndSessionValues) => void;
}) {
  const form = useForm<EndSessionValues>({
    resolver: zodResolver(endSessionSchema),
    defaultValues: { reason: "on_time", remarks: "" }
  });
  const reason = form.watch("reason");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-surface p-6 shadow-lg">
        <div className="flex items-center gap-2 border-b pb-4 text-warning">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-lg font-semibold text-foreground">End session</h2>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          This closes attendance for this session. Students who haven't tapped in will remain marked absent.
        </p>
        <form className="mt-4 space-y-4" onSubmit={form.handleSubmit(onConfirm)}>
          <SelectField
            control={form.control}
            name="reason"
            label="Ending reason"
            options={[
              { label: "Ending on time", value: "on_time" },
              { label: "Ending early", value: "early_end" },
              { label: "Running overtime", value: "overtime" }
            ]}
          />
          {reason !== "on_time" ? (
            <TextField
              control={form.control}
              name="remarks"
              label="Reason details"
              placeholder={reason === "early_end" ? "e.g. Room needed for another class" : "e.g. Extended for makeup activity"}
            />
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <SubmitButton isSubmitting={isSubmitting} variant="destructive">
              Confirm end session
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function DetailRow({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

const classPickerSchema = z.object({ classId: z.string().min(1, "Select an assigned class.") });
type ClassPickerValues = z.infer<typeof classPickerSchema>;

export function StartSessionPage() {
  const scope = useFacultyScope();
  const navigate = useNavigate();
  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const mutations = useAttendanceSessionMutations(scope.context);

  const classPickerForm = useForm<ClassPickerValues>({
    resolver: zodResolver(classPickerSchema),
    defaultValues: { classId: new URLSearchParams(window.location.search).get("classId") ?? "" }
  });
  const selectedClassId = classPickerForm.watch("classId");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);

  const activeSessionQuery = useAttendanceSession(activeSessionId ?? "", scope.context);
  const studentsQuery = useStudentsForClass(selectedClassId, undefined, scope.context);
  const attendanceRecordsQuery = useAttendanceRecords({}, scope.context);

  if (scope.isLoading) {
    return <LoadingState label="Loading faculty workspace" />;
  }
  if (scope.isError || !scope.facultyId) {
    return <ErrorState title="Faculty profile unavailable" message="The signed-in mock account does not have a faculty profile fixture." />;
  }

  const selectedClass = classesQuery.data?.items.find((classRecord) => classRecord.id === selectedClassId);

  async function handleStartSession(values: StartSessionValues) {
    if (!selectedClass) return;
    try {
      const created = await mutations.createClassSessionMutation.mutateAsync({
        classId: selectedClass.id,
        title: `${selectedClass.subjectCode} Active Session`,
        room: values.room,
        date: values.date,
        startTime: values.startTime,
        expectedEndTime: values.expectedEndTime,
        mode: values.attendanceMode === "face-to-face" ? "required" : "optional"
      });
      setActiveSessionId(created.id);
      setIsStartModalOpen(false);
      toast.success("Session started");
    } catch {
      toast.error("Could not start the session. Please try again.");
    }
  }

  async function handleEndSession(values: EndSessionValues) {
    if (!activeSessionId) return;
    const endedReason =
      values.reason === "on_time" ? null : `${values.reason === "early_end" ? "Ended early" : "Overtime"}: ${values.remarks}`;
    try {
      await mutations.endSessionMutation.mutateAsync({
        sessionId: activeSessionId,
        reason: endedReason ?? "Session ended"
      });
      if (endedReason) {
        toast.success(`Session ended — ${endedReason}`);
      } else {
        toast.success("Session ended");
      }
      setIsEndModalOpen(false);
      const target = selectedClass ? APP_ROUTES.facultyClass(selectedClass.id) : APP_ROUTES.facultyClass("");
      navigate(target);
    } catch {
      toast.error("Could not end the session. Please try again.");
    }
  }

  const sessionRecords = activeSessionId ? recordsForSession(attendanceRecordsQuery.data?.items ?? [], activeSessionId) : [];
  const counts = attendanceCounts(sessionRecords);
  const rate = attendanceRate(sessionRecords);
  const liveRecords = buildLiveRecords(studentsQuery.data?.items ?? [], sessionRecords);

  /* ---------------- Pre-session: pick class, then Start Session ---------------- */
  if (!activeSessionId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          eyebrow="Session preparation"
          title="Start class session"
          description="Choose an assigned class, then confirm room, schedule, and mode to begin taking attendance."
        />

        {classesQuery.isLoading ? <LoadingState label="Loading assigned classes" /> : null}
        {classesQuery.isError ? <ErrorState title="Unable to load classes" message="Assigned class options are unavailable." /> : null}

        <div className="overflow-hidden rounded-xl border bg-surface shadow-sm">
          {/* Step 1 — pick class */}
          <div className="border-b bg-background/40 p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                1
              </span>
              <h2 className="font-semibold">Choose your class</h2>
            </div>
            <div className="mt-3 max-w-sm">
              <SelectField
                control={classPickerForm.control}
                name="classId"
                label="Assigned class"
                options={(classesQuery.data?.items ?? []).map((classRecord) => ({
                  label: `${classRecord.subjectCode} ${classRecord.section}`,
                  value: classRecord.id
                }))}
              />
            </div>
          </div>

          {/* Step 2 — review details */}
          <div className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                2
              </span>
              <h2 className="font-semibold">Review class details</h2>
            </div>

            {selectedClass ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailRow icon={GraduationCap} label="Subject" value={selectedClass.subjectTitle} />
                <DetailRow icon={CalendarClock} label="Schedule" value={selectedClass.scheduleLabel || "Schedule unavailable"} />
                <DetailRow icon={DoorOpen} label="Room" value={selectedClass.room} />
                <DetailRow icon={Users} label="Section" value={`${selectedClass.subjectCode} ${selectedClass.section}`} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center">
                <Users className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select a class above to preview its details.</p>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="flex justify-end border-t bg-background/40 p-5">
            <Button disabled={!selectedClass} onClick={() => setIsStartModalOpen(true)}>
              <DoorOpen className="mr-2 h-4 w-4" />
              Start session
            </Button>
          </div>
        </div>

        {isStartModalOpen && selectedClass ? (
          <StartSessionModal
            classRecord={selectedClass}
            isSubmitting={mutations.createClassSessionMutation.isPending}
            onCancel={() => setIsStartModalOpen(false)}
            onConfirm={handleStartSession}
          />
        ) : null}
      </div>
    );
  }

  /* ---------------- Active session: class info, students, summary, end ---------------- */
  if (activeSessionQuery.isLoading) {
    return <LoadingState label="Loading active session" />;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Active session"
        title={classLabel(selectedClass)}
        description="Attendance is live for this session."
      />

      {activeSessionQuery.data ? (
        <ActiveSessionHeader
          title={activeSessionQuery.data.title}
          venue={selectedClass ? `${selectedClass.room} · ${selectedClass.scheduleLabel}` : "Venue not set"}
          startedAt={formatStartedAt(activeSessionQuery.data.startsAt)}
          statusLabel={formatStatusLabel(activeSessionQuery.data.status)}
        />
      ) : null}

      {/* Session at-a-glance */}
      <div className="grid gap-3 rounded-xl border bg-surface p-5 shadow-sm sm:grid-cols-3">
        <DetailRow icon={CalendarClock} label="Schedule" value={selectedClass?.scheduleLabel ?? "—"} />
        <DetailRow icon={DoorOpen} label="Room" value={selectedClass?.room ?? "—"} />
        <DetailRow icon={Users} label="Enrolled" value={`${liveRecords.length} students`} />
      </div>

      {/* Summary */}
      <div className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Attendance summary</h2>
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {rate}% attendance rate
          </span>
        </div>
        <SessionSummaryCards present={counts.present} late={counts.late} absent={counts.absent} total={liveRecords.length} />
        {counts.excused > 0 ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {counts.excused} student(s) marked excused.
          </p>
        ) : null}
      </div>

      {/* Roster */}
      <div className="rounded-xl border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Students</h2>
        {studentsQuery.isLoading ? <LoadingState label="Loading roster" /> : <LiveAttendanceList records={liveRecords} />}
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button variant="destructive" onClick={() => setIsEndModalOpen(true)}>
          End session
        </Button>
      </div>

      {isEndModalOpen ? (
        <EndSessionModal
          isSubmitting={mutations.endSessionMutation?.isPending ?? false}
          onCancel={() => setIsEndModalOpen(false)}
          onConfirm={handleEndSession}
        />
      ) : null}
    </div>
  );
}