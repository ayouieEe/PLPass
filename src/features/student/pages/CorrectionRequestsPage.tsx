import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { ColDef } from "ag-grid-community";
import {
  History,
  FileUp,
  CheckCircle,
  Clock,
  XCircle
} from "lucide-react";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useStudents,
  useClasses,
  useEvents,
  useCorrectionRequests,
  useAttendanceRecords,
  useAttendanceSessions
} from "@/hooks/useRepositoryQueries";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/forms/SelectField";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { CorrectionRequest, Student } from "@/types/domain";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  studentName: string;
  isLoading: boolean;
  isError: boolean;
};

type CorrectionHistoryRow = {
  id: string;
  submittedDate: string;
  subjectOrEventId: string;
  type: string;
  status: CorrectionRequest["status"];
  request: CorrectionRequest;
};

const correctionFormSchema = z.object({
  category: z.enum(["class", "event"]),
  code: z.string().min(1, "Please select or enter class/event code."),
  name: z.string().min(1, "Name is required."),
  requestType: z.enum(["excused", "present", "late", "absent"]),
  reason: z.string().min(12, "Explanation must be at least 12 characters."),
  recordId: z.string().min(1, "Select a related attendance record.")
});

type CorrectionFormValues = z.infer<typeof correctionFormSchema>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

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

export function CorrectionRequestsPage() {
  const scope = useStudentScope();
  const [searchParams] = useSearchParams();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<CorrectionRequest | null>(null);

  const classesQuery = useClasses({ pageSize: 100 }, scope.context);
  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);

  const urlCategory = searchParams.get("category") === "event" ? "event" : "class";
  const urlRecordId = searchParams.get("recordId") ?? "";
  const urlCode = searchParams.get("code") ?? "";
  const urlName = searchParams.get("name") ?? "";

  const form = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionFormSchema),
    defaultValues: {
      category: urlCategory,
      code: urlCode,
      name: urlName,
      requestType: "excused",
      reason: "",
      recordId: urlRecordId
    }
  });

  const { setValue, control, handleSubmit, reset } = form;
  const watchedCategory = useWatch({ control, name: "category" });
  const watchedCode = useWatch({ control, name: "code" });

  const classes = useMemo(() => classesQuery.data?.items ?? [], [classesQuery.data?.items]);
  const events = useMemo(() => eventsQuery.data?.items ?? [], [eventsQuery.data?.items]);
  const records = useMemo(() => recordsQuery.data?.items ?? [], [recordsQuery.data?.items]);
  const sessions = useMemo(() => sessionsQuery.data?.items ?? [], [sessionsQuery.data?.items]);

  // Update codes dropdown options
  const codeOptions =
    watchedCategory === "class"
      ? classes.map((c) => ({ label: `${c.subjectCode} - ${c.subjectTitle}`, value: c.subjectCode }))
      : events.map((e) => ({ label: `${e.code} - ${e.title}`, value: e.code }));

  const attendanceRecordOptions = records.map((record) => {
    const session = sessions.find((entry) => entry.id === record.sessionId);
    const classRecord = classes.find((entry) => entry.id === session?.classId);
    const event = events.find((entry) => entry.id === session?.eventId);
    const label = classRecord
      ? `${classRecord.subjectCode} - ${classRecord.subjectTitle}`
      : event
        ? `${event.code} - ${event.title}`
        : session?.title ?? record.id;
    return {
      label: `${label} (${record.status})`,
      value: record.id
    };
  });

  // Automatically update the Name field when Code changes
  useEffect(() => {
    if (!watchedCode) return;
    if (watchedCategory === "class") {
      const match = classes.find((c) => c.subjectCode === watchedCode);
      if (match) setValue("name", match.subjectTitle);
    } else {
      const match = events.find((e) => e.code === watchedCode);
      if (match) setValue("name", match.title);
    }
  }, [watchedCode, watchedCategory, classes, events, setValue]);

  // Handle URL redirect query parameter synchronization
  useEffect(() => {
    if (urlCode && urlName) {
      setValue("category", urlCategory);
      setValue("code", urlCode);
      setValue("name", urlName);
      setValue("recordId", urlRecordId);
    }
  }, [urlCategory, urlCode, urlName, urlRecordId, setValue]);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in mock account does not have a student profile fixture." />;
  }

  if (
    classesQuery.isLoading ||
    eventsQuery.isLoading ||
    correctionsQuery.isLoading ||
    recordsQuery.isLoading ||
    sessionsQuery.isLoading
  ) {
    return <LoadingState label="Loading correction page" />;
  }

  async function onSubmit(values: CorrectionFormValues) {
    try {
      let classId: string | undefined;
      let eventId: string | undefined;
      let attendanceRecordId = values.recordId || undefined;

      if (values.category === "class") {
        const matchingClass = classes.find((c) => c.subjectCode === values.code);
        classId = matchingClass?.id;
      } else {
        const matchingEvent = events.find((e) => e.code === values.code);
        eventId = matchingEvent?.id;
      }

      if (!attendanceRecordId && classId) {
        const matchSession = sessions.find((s) => s.classId === classId);
        if (matchSession) {
          const matchRecord = records.find((r) => r.sessionId === matchSession.id);
          attendanceRecordId = matchRecord?.id;
        }
      } else if (!attendanceRecordId && eventId) {
        const matchSession = sessions.find((s) => s.eventId === eventId);
        if (matchSession) {
          const matchRecord = records.find((r) => r.sessionId === matchSession.id);
          attendanceRecordId = matchRecord?.id;
        }
      }

      await correctionsQuery.createMutation.mutateAsync({
        studentId: scope.student?.id ?? "",
        attendanceRecordId: attendanceRecordId ?? "",
        classId,
        eventId,
        requestedStatus: values.requestType,
        reason: values.reason
      });

      toast.success("Excused/Correction request submitted successfully.");
      reset({
        category: "class",
        code: "",
        name: "",
        requestType: "excused",
        reason: "",
        recordId: ""
      });
      setSelectedFile(null);
    } catch {
      toast.error("Failed to submit request. You may have a pending request already.");
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
      toast.info(`Attached file: ${event.target.files[0].name}`);
    }
  }

  function getStatusTone(status: string) {
    if (status === "approved") return "success";
    if (status === "pending") return "warning";
    return "danger";
  }

  const correctionHistoryRows: CorrectionHistoryRow[] = (correctionsQuery.data?.items ?? []).map((request) => ({
    id: request.id,
    submittedDate: dateFormatter.format(new Date(request.requestedAt)),
    subjectOrEventId: request.classId ?? request.eventId ?? "Session Record",
    type: request.requestedStatus === "excused" ? "Excused Absence" : "Correction",
    status: request.status,
    request
  }));

  const correctionHistoryColumns: ColDef<CorrectionHistoryRow>[] = [
    { field: "submittedDate", headerName: "Submitted Date", minWidth: 170 },
    { field: "subjectOrEventId", headerName: "Subject/Event ID", minWidth: 180 },
    { field: "type", headerName: "Type", minWidth: 160 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 140,
      cellRenderer: ({ data }: { data?: CorrectionHistoryRow }) =>
        data ? <StatusBadge label={data.status} tone={getStatusTone(data.status)} /> : null
    },
    {
      colId: "details",
      headerName: "Details",
      minWidth: 150,
      cellRenderer: ({ data }: { data?: CorrectionHistoryRow }) =>
        data ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedRequest(data.request)}
            className="text-xs text-primary font-semibold hover:bg-highlight/60"
          >
            View Details
          </Button>
        ) : null
    }
  ];

  return (
    <div className="space-y-8 p-1">
      <PageHeader
        eyebrow="Absences & Edits"
        title="Correction Requests"
        description="File formal absence excuse notices or request corrections for incorrect attendance check-ins."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Submit Form */}
        <div className="lg:col-span-1 student-glass-card p-6 space-y-4 shadow-sm h-fit">
          <div>
            <h3 className="font-semibold text-[#4F5654] text-base">File New Request</h3>
            <p className="text-xs text-[#B9C1BF] mt-0.5">Please provide supporting files for excused requests.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <SelectField
              control={control}
              name="recordId"
              label="Related Attendance Record"
              options={attendanceRecordOptions}
            />

            <SelectField
              control={control}
              name="category"
              label="Category"
              options={[
                { label: "Class Attendance", value: "class" },
                { label: "Campus Event", value: "event" }
              ]}
            />

            <SelectField
              control={control}
              name="code"
              label="Subject/Event Code"
              options={[{ label: "-- Select Code --", value: "" }, ...codeOptions]}
            />

            <div>
              <label className="block text-xs font-semibold text-[#4F5654] mb-1.5">Class/Event Name</label>
              <input
                type="text"
                readOnly
                {...form.register("name")}
                className="student-input h-10 w-full bg-slate-100/50 px-3 py-2 text-sm font-medium focus:outline-none cursor-not-allowed text-muted-foreground"
              />
            </div>

            <SelectField
              control={control}
              name="requestType"
              label="Request Type"
              options={[
                { label: "Excused Absence (Absent -> Excused)", value: "excused" },
                { label: "Attendance Correction (Absent -> Present)", value: "present" },
                { label: "Recorded Time Correction (Late -> Present)", value: "late" }
              ]}
            />

            <TextAreaField
              control={control}
              name="reason"
              label="Reason & Explanation"
              placeholder="State clearly why you missed the session or why correction is requested..."
            />

            {/* File Attachment Uploader */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#4F5654]">Attach Supporting File</label>
              <div className="relative border border-dashed border-[#B9C1BF] hover:border-primary/50 transition-colors rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer bg-white/40">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <FileUp className="h-6 w-6 text-[#B9C1BF] mb-1" />
                <span className="text-xs font-semibold text-[#4F5654]">
                  {selectedFile ? selectedFile.name : "Choose PDF or Image"}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">Max size: 5MB</span>
              </div>
            </div>

            <SubmitButton
              isSubmitting={correctionsQuery.createMutation.isPending}
              className="student-btn-primary w-full mt-2"
              aria-label="Submit correction request"
            >
              Submit Request
            </SubmitButton>
          </form>
        </div>

        {/* Right Side: History logs list */}
        <div className="lg:col-span-2 student-glass-card p-6 space-y-4 shadow-sm h-fit">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#4D7117]" />
            <h3 className="font-semibold text-[#4F5654] text-base">My Report History</h3>
          </div>

          <PLPassDataGrid
            data={correctionHistoryRows}
            columns={correctionHistoryColumns}
            label="Correction request history"
            emptyTitle="No correction request reports recorded"
            enableQuickFilter={false}
            enableColumnVisibility={false}
          />
        </div>
      </div>

      {/* DETAILED REQUEST VIEW DIALOG */}
      {selectedRequest && (
        <section
          className="fixed inset-0 z-50 grid place-items-center bg-[#1F4B2C]/25 p-4 backdrop-blur-md animate-in fade-in-30"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-[28px] border border-white/50 bg-white/70 p-6 shadow-2xl space-y-5 backdrop-blur-xl animate-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-[#E8ECEB] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#4F5654]">Correction Request Detail</h3>
                <p className="text-xs text-[#B9C1BF] mt-0.5">
                  Submitted on {dateFormatter.format(new Date(selectedRequest.requestedAt))}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(null)} className="text-[#4F5654] hover:bg-slate-100">
                ✕
              </Button>
            </div>

            <div className="space-y-3.5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/40 p-3 rounded-xl border border-[#E8ECEB]">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Record ID</span>
                  <p className="font-semibold text-[#4F5654] mt-0.5 truncate">{selectedRequest.attendanceRecordId || "N/A"}</p>
                </div>
                <div className="bg-white/40 p-3 rounded-xl border border-[#E8ECEB]">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Request Type</span>
                  <p className="font-semibold text-[#4F5654] mt-0.5 capitalize">{selectedRequest.requestedStatus}</p>
                </div>
              </div>

              <div className="bg-white/40 p-4 rounded-xl border border-[#E8ECEB] space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500">Explanation / Reason</span>
                <p className="text-xs leading-relaxed text-[#4F5654]">{selectedRequest.reason}</p>
              </div>

              <div className="bg-white/40 p-4 rounded-xl border border-[#E8ECEB] space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500">Admin Review Decision</span>
                <div className="flex items-center gap-2 mt-1">
                  {selectedRequest.status === "approved" ? (
                    <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : selectedRequest.status === "rejected" ? (
                    <XCircle className="h-5 w-5 text-danger shrink-0" />
                  ) : (
                    <Clock className="h-5 w-5 text-warning shrink-0" />
                  )}
                  <span className="font-semibold text-xs uppercase text-[#4F5654]">
                    {selectedRequest.status === "pending" ? "Awaiting review" : `Reviewed: ${selectedRequest.status}`}
                  </span>
                </div>
                {selectedRequest.reviewedAt && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Review Date: {dateFormatter.format(new Date(selectedRequest.reviewedAt))}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#E8ECEB]">
              <Button onClick={() => setSelectedRequest(null)} className="student-btn-primary px-6">Close</Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
