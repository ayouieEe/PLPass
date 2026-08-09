import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { ColDef } from "ag-grid-community";
import {
  History,
  CheckCircle,
  Clock,
  XCircle
} from "lucide-react";
import {
  useEvents,
  useCorrectionRequests,
  useAttendanceRecords,
  useAttendanceSessions
} from "@/hooks/useRepositoryQueries";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { StudentSelectField } from "@/components/forms/StudentSelectField";
import { TextAreaField } from "@/components/forms/TextAreaField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { formatDisplayDate } from "@/lib/utils/date";
import {
  correctionRequestTypeLabels,
  getCorrectionRequestTypes,
  recordsForStudentEvents,
  studentVisibleEvents,
  useStudentScope
} from "@/features/student/studentExperience";
import type { CorrectionRequest } from "@/types/domain";

type CorrectionHistoryRow = {
  id: string;
  submittedDate: string;
  subjectOrEventId: string;
  type: string;
  status: CorrectionRequest["status"];
  request: CorrectionRequest;
};

const correctionFormSchema = z.object({
  code: z.string().min(1, "Please select an event code."),
  name: z.string().min(1, "Name is required."),
  requestType: z.enum(["excused", "present", "late"]),
  reason: z.string().min(12, "Explanation must be at least 12 characters."),
  recordId: z.string().min(1, "Select a related attendance record.")
});

type CorrectionFormValues = z.infer<typeof correctionFormSchema>;

export function CorrectionRequestsPage() {
  const scope = useStudentScope();
  const [searchParams] = useSearchParams();
  const [selectedRequest, setSelectedRequest] = useState<CorrectionRequest | null>(null);

  const eventsQuery = useEvents({ pageSize: 100 }, scope.context);
  const recordsQuery = useAttendanceRecords({ pageSize: 100 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const correctionsQuery = useCorrectionRequests({ pageSize: 100 }, scope.context);

  const urlRecordId = searchParams.get("recordId") ?? "";
  const urlCode = searchParams.get("code") ?? "";
  const urlName = searchParams.get("name") ?? "";

  const form = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionFormSchema),
    defaultValues: {
      code: urlCode,
      name: urlName,
      requestType: "excused",
      reason: "",
      recordId: urlRecordId
    }
  });

  const { setValue, control, handleSubmit, reset } = form;
  const watchedCode = useWatch({ control, name: "code" });
  const watchedRecordId = useWatch({ control, name: "recordId" });

  const events = useMemo(() => studentVisibleEvents(eventsQuery.data?.items ?? []), [eventsQuery.data?.items]);
  const records = useMemo(() => recordsQuery.data?.items ?? [], [recordsQuery.data?.items]);
  const sessions = useMemo(() => sessionsQuery.data?.items ?? [], [sessionsQuery.data?.items]);

  const studentEventRecords = useMemo(
    () =>
      scope.student
        ? recordsForStudentEvents({
            studentId: scope.student.id,
            records,
            sessions,
            events
          })
        : [],
    [events, records, scope.student, sessions]
  );
  const selectedStudentEventRecord = studentEventRecords.find((record) => record.id === watchedRecordId);
  const selectedRequestTypes = selectedStudentEventRecord ? getCorrectionRequestTypes(selectedStudentEventRecord.status) : undefined;
  const requestTypeOptions = selectedStudentEventRecord
    ? selectedRequestTypes ?? []
    : (["excused", "present", "late"] as CorrectionFormValues["requestType"][]);

  const codeOptions = events.map((event) => ({ label: `${event.code} - ${event.title}`, value: event.code }));
  const attendanceRecordOptions = studentEventRecords.map((record) => ({
    label: `${record.eventCode} - ${record.eventName} (${record.status})`,
    value: record.id
  }));

  // Automatically update the Name field when Code changes
  useEffect(() => {
    if (!watchedCode) return;
    const match = events.find((event) => event.code === watchedCode);
    if (match) setValue("name", match.title);
  }, [watchedCode, events, setValue]);

  useEffect(() => {
    if (!watchedRecordId) return;
    if (selectedStudentEventRecord) {
      const nextType = getCorrectionRequestTypes(selectedStudentEventRecord.status)[0];
      setValue("code", selectedStudentEventRecord.eventCode);
      setValue("name", selectedStudentEventRecord.eventName);
      if (nextType) setValue("requestType", nextType);
    }
  }, [selectedStudentEventRecord, setValue, watchedRecordId]);

  // Handle URL redirect query parameter synchronization
  useEffect(() => {
    if (urlCode && urlName) {
      setValue("code", urlCode);
      setValue("name", urlName);
      setValue("recordId", urlRecordId);
    }
  }, [urlCode, urlName, urlRecordId, setValue]);

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in account does not have a student profile record." />;
  }

  if (
    eventsQuery.isLoading ||
    recordsQuery.isLoading ||
    sessionsQuery.isLoading
  ) {
    return <LoadingState label="Loading correction page" />;
  }

  if (eventsQuery.isError || recordsQuery.isError || sessionsQuery.isError) {
    return <ErrorState title="Unable to load correction requests" message="Please try refreshing the page." />;
  }

  async function onSubmit(values: CorrectionFormValues) {
    try {
      let eventId: string | undefined;
      let attendanceRecordId = values.recordId || undefined;
      const selectedEventRecord = studentEventRecords.find((record) => record.id === values.recordId);

      if (selectedEventRecord) {
        const allowedTypes = getCorrectionRequestTypes(selectedEventRecord.status);
        if (!allowedTypes.length) {
          toast.info("Present attendance records do not need a correction request.");
          return;
        }
        if (!allowedTypes.includes(values.requestType)) {
          toast.error("Select a valid correction type for this attendance status.");
          return;
        }
        eventId = selectedEventRecord.eventId;
        attendanceRecordId = selectedEventRecord.id;
      }

      const matchingEvent = events.find((event) => event.code === values.code);
      eventId = eventId ?? matchingEvent?.id;

      if (!attendanceRecordId && eventId) {
        const matchSession = sessions.find((s) => s.eventId === eventId);
        if (matchSession) {
          const matchRecord = records.find((r) => r.sessionId === matchSession.id && r.studentId === scope.student?.id);
          attendanceRecordId = matchRecord?.id;
        }
      }

      await correctionsQuery.createMutation.mutateAsync({
        studentId: scope.student?.id ?? "",
        attendanceRecordId: attendanceRecordId ?? "",
        eventId,
        requestedStatus: values.requestType,
        reason: values.reason
      });

      toast.success("Correction request submitted successfully.");
      reset({
        code: "",
        name: "",
        requestType: "excused",
        reason: "",
        recordId: ""
      });
    } catch {
      toast.error("Failed to submit request. You may have a pending request already.");
    }
  }

  function getStatusTone(status: string) {
    if (status === "approved") return "success";
    if (status === "pending") return "warning";
    return "danger";
  }

  const correctionHistoryRows: CorrectionHistoryRow[] = correctionsQuery.isError ? [] : (correctionsQuery.data?.items ?? []).filter((request) => request.studentId === scope.student?.id).map((request) => ({
    id: request.id,
    submittedDate: formatDisplayDate(request.requestedAt, "N/A"),
    subjectOrEventId: request.eventId ?? "Session Record",
    type: request.requestedStatus === "excused" ? "Excused Absence" : "Correction",
    status: request.status,
    request
  }));

  const correctionHistoryColumns: ColDef<CorrectionHistoryRow>[] = [
    { field: "submittedDate", headerName: "Submitted Date", minWidth: 170 },
    { field: "subjectOrEventId", headerName: "Event ID", minWidth: 180 },
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
        description="File event absence excuse notices or request corrections for organizer-recorded event attendance."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Submit Form */}
        <div className="lg:col-span-1 student-glass-card p-6 space-y-4 shadow-sm h-fit">
          <div>
            <h3 className="font-semibold text-foreground text-base">File New Request</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Submit a Supabase-backed correction request with a clear explanation.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <StudentSelectField
              control={control}
              name="recordId"
              label="Related Attendance Record"
              options={attendanceRecordOptions}
              placeholder="Select attendance record..."
            />

            <StudentSelectField
              control={control}
              name="code"
              label="Event Code"
              options={codeOptions}
              placeholder="-- Select Code --"
            />

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Event Name</label>
              <input
                type="text"
                readOnly
                {...form.register("name")}
                className="student-input h-10 w-full bg-secondary px-3 py-2 text-sm font-medium focus:outline-none cursor-not-allowed text-muted-foreground animate-none"
              />
            </div>

            <StudentSelectField
              control={control}
              name="requestType"
              label="Request Type"
              options={requestTypeOptions.map((type) => ({ label: correctionRequestTypeLabels[type], value: type }))}
              placeholder={requestTypeOptions.length ? "Select request type..." : "No correction needed"}
              disabled={!requestTypeOptions.length}
            />
            {selectedStudentEventRecord && !requestTypeOptions.length ? (
              <p className="rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-xs font-medium text-success">
                This record is already present, so no correction request is needed.
              </p>
            ) : null}

            <TextAreaField
              control={control}
              name="reason"
              label="Reason & Explanation"
              placeholder="State clearly why you missed the session or why correction is requested..."
            />

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
            <History className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground text-base">Correction History</h3>
          </div>
          {correctionsQuery.isLoading ? (
            <LoadingState label="Loading correction history" />
          ) : correctionsQuery.isError ? (
            <section className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
              <p className="font-semibold text-warning">Correction history is temporarily unavailable.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You can still prepare a new correction request above. Refresh later to view submitted requests.
              </p>
            </section>
          ) : (

            <PLPassDataGrid
              data={correctionHistoryRows}
              columns={correctionHistoryColumns}
              label="Correction request history"
              emptyTitle="No correction requests recorded"
              enableQuickFilter={false}
              enableColumnVisibility={false}
            />
          )}
        </div>
      </div>

      {/* DETAILED REQUEST VIEW DIALOG */}
      {selectedRequest && (
        <section
          className="fixed inset-0 z-50 grid place-items-center bg-primary/25 p-4 backdrop-blur-md animate-in fade-in-30"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-[28px] border border-border bg-card/75 p-6 shadow-2xl space-y-5 backdrop-blur-xl animate-in zoom-in-95">
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground">Correction Request Detail</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Submitted on {formatDisplayDate(selectedRequest.requestedAt, "N/A")}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(null)} className="text-foreground hover:bg-secondary">
                ✕
              </Button>
            </div>

            <div className="space-y-3.5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card/40 p-3 rounded-xl border border-border">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Record ID</span>
                  <p className="font-semibold text-foreground mt-0.5 truncate">{selectedRequest.attendanceRecordId || "N/A"}</p>
                </div>
                <div className="bg-card/40 p-3 rounded-xl border border-border">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Request Type</span>
                  <p className="font-semibold text-foreground mt-0.5 capitalize">{selectedRequest.requestedStatus}</p>
                </div>
              </div>

              <div className="bg-card/40 p-4 rounded-xl border border-border space-y-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Explanation / Reason</span>
                <p className="text-xs leading-relaxed text-foreground">{selectedRequest.reason}</p>
              </div>

              <div className="bg-card/40 p-4 rounded-xl border border-border space-y-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Review Decision</span>
                <div className="flex items-center gap-2 mt-1">
                  {selectedRequest.status === "approved" ? (
                    <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                  ) : selectedRequest.status === "rejected" ? (
                    <XCircle className="h-5 w-5 text-danger shrink-0" />
                  ) : (
                    <Clock className="h-5 w-5 text-warning shrink-0" />
                  )}
                  <span className="font-semibold text-xs uppercase text-foreground">
                    {selectedRequest.status === "pending" ? "Awaiting review" : `Reviewed: ${selectedRequest.status}`}
                  </span>
                </div>
                {selectedRequest.reviewedAt && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Review Date: {formatDisplayDate(selectedRequest.reviewedAt, "N/A")}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button onClick={() => setSelectedRequest(null)} className="student-btn-primary px-6">Close</Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
