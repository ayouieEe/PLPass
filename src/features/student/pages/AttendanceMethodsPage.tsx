import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Globe2,
  Lock,
  QrCode,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useCredentialRequests, useStudentCredentialStatus } from "@/hooks/useRepositoryQueries";
import { cn } from "@/lib/utils/cn";
import {
  ensureStudentIdentityReadiness,
  formatCredentialStatus,
  hasUsableQrCredential,
  useStudentScope
} from "@/features/student/studentExperience";

const issueReportSchema = z.object({
  issueDescription: z.string().min(10, "Explanation must be at least 10 characters.")
});
type IssueReportFormValues = z.infer<typeof issueReportSchema>;

const changeRequestSchema = z.object({
  reason: z.string().min(10, "Tell the organizer why you need to re-enroll.")
});
type ChangeRequestFormValues = z.infer<typeof changeRequestSchema>;

const cardShellClass = "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm";
const qrMatrixSize = 15;

function CardAccent() {
  return <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />;
}

function isFinderCell(row: number, col: number) {
  const inTopLeft = row < 5 && col < 5;
  const inTopRight = row < 5 && col >= qrMatrixSize - 5;
  const inBottomLeft = row >= qrMatrixSize - 5 && col < 5;

  if (!inTopLeft && !inTopRight && !inBottomLeft) {
    return false;
  }

  const localRow = row < 5 ? row : row - (qrMatrixSize - 5);
  const localCol = col < 5 ? col : col - (qrMatrixSize - 5);
  const isOuterFrame = localRow === 0 || localRow === 4 || localCol === 0 || localCol === 4;
  const isCenter = localRow === 2 && localCol === 2;
  return isOuterFrame || isCenter;
}

function isDataCell(row: number, col: number) {
  return (row * 7 + col * 11 + row * col) % 5 === 0 || (row + col * 3) % 7 === 0 || (row * 2 + col) % 11 === 0;
}

function QrPreview({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        "grid h-48 w-48 rounded-2xl border bg-white p-3 shadow-sm ring-8 ring-primary/5",
        !active && "opacity-70 grayscale"
      )}
      style={{ gridTemplateColumns: `repeat(${qrMatrixSize}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: qrMatrixSize * qrMatrixSize }).map((_, index) => {
        const row = Math.floor(index / qrMatrixSize);
        const col = index % qrMatrixSize;
        const filled = isFinderCell(row, col) || isDataCell(row, col);

        return (
          <span
            key={`${row}-${col}`}
            className={cn("m-[1px] rounded-[2px]", filled ? "bg-foreground" : "bg-transparent", isFinderCell(row, col) && "rounded-[3px]")}
          />
        );
      })}
    </div>
  );
}

export function AttendanceMethodsPage() {
  const scope = useStudentScope();
  const credentialRequestsQuery = useCredentialRequests({ pageSize: 100 }, scope.context);
  const credentialStatusQuery = useStudentCredentialStatus(scope.student?.id, scope.context);
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [showIssueReport, setShowIssueReport] = useState(false);

  const issueForm = useForm<IssueReportFormValues>({
    resolver: zodResolver(issueReportSchema),
    defaultValues: { issueDescription: "" }
  });
  const changeRequestForm = useForm<ChangeRequestFormValues>({
    resolver: zodResolver(changeRequestSchema),
    defaultValues: { reason: "" }
  });

  if (scope.isLoading) return <LoadingState label="Loading attendance methods" />;
  if (scope.isError || !scope.student) return <ErrorState title="Student profile unavailable" message="The signed-in account does not have a student profile record." />;
  if (credentialRequestsQuery.isLoading) return <LoadingState label="Loading attendance method requests" />;
  if (credentialRequestsQuery.isError) return <ErrorState title="Unable to load attendance method requests" message="Please try refreshing the page." />;
  if (credentialStatusQuery.isLoading) return <LoadingState label="Loading attendance access" />;
  if (credentialStatusQuery.isError) return <ErrorState title="Unable to load attendance access" message="Please refresh the page. If this continues, ask an organizer to verify your attendance manually." />;

  const student = scope.student;
  const studentCredentialRequests = (credentialRequestsQuery.data?.items ?? []).filter((request) => request.studentId === student.id);
  const pendingQrIssue = studentCredentialRequests.some((request) => request.credentialType === "qr" && request.status === "pending");
  const pendingFacialRequest = studentCredentialRequests.some((request) => request.credentialType === "facial" && request.status === "pending");
  const identityReadiness = ensureStudentIdentityReadiness(credentialStatusQuery.data);
  const hasQrCredential = hasUsableQrCredential(identityReadiness);
  const qrStatus = pendingQrIssue ? "Issue pending" : hasQrCredential ? formatCredentialStatus(identityReadiness.qrStatus) : "Not configured";
  const facialStatus = pendingFacialRequest ? "Request pending" : formatCredentialStatus(identityReadiness.faceStatus);
  const readiness = Number(hasQrCredential) + Number(identityReadiness.faceEnrolled);
  const qrReference = identityReadiness.qrCredentialId ? `QR ID ${identityReadiness.qrCredentialId}` : "QR not issued yet";

  async function handleIssueSubmit(values: IssueReportFormValues) {
    try {
      await credentialRequestsQuery.createMutation.mutateAsync({
        studentId: student.id,
        credentialType: "qr",
        requestType: "technical_issue",
        reason: values.issueDescription
      });
      toast.success("Check-in issue submitted.");
      issueForm.reset();
      setShowIssueReport(false);
    } catch {
      toast.error("Unable to submit check-in issue. Check if you already have a pending request.");
    }
  }

  async function handleChangeRequestSubmit(values: ChangeRequestFormValues) {
    try {
      await credentialRequestsQuery.createMutation.mutateAsync({
        studentId: student.id,
        credentialType: "facial",
        requestType: "re_enrollment",
        reason: values.reason
      });
      toast.success("Facial review request sent.");
      changeRequestForm.reset();
      setShowChangeRequest(false);
    } catch {
      toast.error("Unable to send facial review request. Check if you already have a pending request.");
    }
  }

  const verificationSteps: Array<{ icon: LucideIcon; label: string; tag: string; description: string }> = [
    { icon: QrCode, label: "QR", tag: "Primary", description: "The normal method for Time In and Time Out during onsite events." },
    { icon: Camera, label: "Facial", tag: "Backup", description: "Used by organizers only when QR scanning cannot be completed." },
    { icon: ClipboardCheck, label: "Manual", tag: "Organizer recorded", description: "Organizer records attendance when a check-in needs review." },
    { icon: Globe2, label: "Online", tag: "Remote event", description: "Used only when the event allows remote attendance." }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verification Setup"
        title="Attendance Methods"
        description="Check if your QR is ready, know the backup methods, and report any check-in problem before or during an event."
        actions={
          <Button type="button" variant="outline" onClick={() => setShowIssueReport(true)}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Report check-in problem
          </Button>
        }
      />

      <section className="space-y-4">
        <div className="space-y-4">
          <section className={cn(cardShellClass, "p-0")}>
            <CardAccent />
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance access</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{readiness} of 2 verification options ready</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    QR is the main method students use. Facial, manual, and online attendance are handled by organizers only when the event setup requires it.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={`QR - ${qrStatus}`} tone={pendingQrIssue ? "warning" : hasQrCredential ? "success" : "muted"} />
                <StatusBadge label={`Face - ${facialStatus}`} tone={pendingFacialRequest ? "warning" : identityReadiness.faceEnrolled ? "success" : "muted"} />
              </div>
            </div>

            <div className="grid gap-4 border-t bg-surface-muted/30 p-5 md:auto-rows-fr md:grid-cols-2 md:p-6">
              <div className="flex h-full min-h-[34rem] flex-col rounded-2xl border bg-surface p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Primary</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">QR Credential</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Use this for Time In and Time Out scans when attending onsite events.
                    </p>
                  </div>
                  <StatusBadge label={qrStatus} tone={pendingQrIssue ? "warning" : hasQrCredential ? "success" : "muted"} />
                </div>

                <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-xl border bg-background p-5 text-center">
                  <QrPreview active={hasQrCredential} />
                  <p className="mt-4 max-w-full break-all font-mono text-sm font-semibold text-foreground">
                    {qrReference}
                  </p>
                  <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    {hasQrCredential ? "Ready for organizer scanning." : "Ask an organizer or admin to issue your QR."}
                  </p>
                </div>
              </div>

              <div className="flex h-full min-h-[34rem] flex-col rounded-2xl border bg-surface p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Backup</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">Facial Recognition</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Used by organizers only when QR scanning cannot be completed.
                    </p>
                  </div>
                  <div className="shrink-0 self-start sm:self-start">
                    <StatusBadge label={facialStatus} tone={pendingFacialRequest ? "warning" : identityReadiness.faceEnrolled ? "success" : "muted"} />
                  </div>
                </div>

                <div className="mt-5 flex flex-1 flex-col rounded-xl border bg-background p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {pendingFacialRequest || identityReadiness.faceEnrolled ? <CheckCircle2 className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
                    </div>
                    <div>
                      <p className="font-semibold">{identityReadiness.faceEnrolled ? "Facial backup ready" : pendingFacialRequest ? "Organizer review requested" : "Facial backup not set up"}</p>
                      <p className="text-sm text-muted-foreground">
                        {identityReadiness.faceEnrolled
                          ? `Your facial backup is active${identityReadiness.faceEnrolledDate ? ` since ${new Date(identityReadiness.faceEnrolledDate).toLocaleDateString()}` : ""}.`
                          : pendingFacialRequest ? "Your request is waiting for organizer review." : "Ask an organizer or admin if you need backup verification."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-dashed bg-muted/30 p-4">
                      <div className="flex items-start gap-3">
                        <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-muted-foreground">Facial setup is organizer-managed</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Send a request only if the organizer asks you to update your facial backup.
                          </p>
                          {pendingFacialRequest && !showChangeRequest && (
                            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Request sent - awaiting organizer review.
                            </p>
                          )}
                          {!showChangeRequest && !pendingFacialRequest && !identityReadiness.faceEnrolled && (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setShowChangeRequest(true)}>
                              Request review
                            </Button>
                          )}
                        </div>
                      </div>

                      {showChangeRequest && (
                        <form onSubmit={changeRequestForm.handleSubmit(handleChangeRequestSubmit)} className="mt-4 border-t pt-4">
                          <textarea
                            {...changeRequestForm.register("reason")}
                            className="plpass-field min-h-24 w-full rounded-xl border p-3 text-sm"
                            placeholder="Tell the organizer why your backup verification needs review."
                          />
                          {changeRequestForm.formState.errors.reason ? (
                            <p className="mt-2 text-sm text-danger">{changeRequestForm.formState.errors.reason.message}</p>
                          ) : null}
                          <div className="mt-3 flex gap-2">
                            <Button type="submit" size="sm" disabled={credentialRequestsQuery.createMutation.isPending}>
                              {credentialRequestsQuery.createMutation.isPending ? "Sending..." : "Send request"}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setShowChangeRequest(false)}>Cancel</Button>
                          </div>
                        </form>
                      )}
                    </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="grid gap-4 lg:grid-cols-2">
          <div className={cardShellClass}>
            <CardAccent />
            <h2 className="text-base font-semibold tracking-tight">Supported attendance modes</h2>
            <p className="mt-1 text-sm text-muted-foreground">These are the attendance methods students may encounter in PLPass.</p>
            <div className="mt-5">
              {verificationSteps.map((step, index) => (
                <div key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
                  {index < verificationSteps.length - 1 && (
                    <span className="absolute left-4 top-9 h-full w-px bg-border" />
                  )}
                  <span className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 ring-4 ring-surface">
                    <step.icon className="h-3.5 w-3.5 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{step.label}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{step.tag}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={cardShellClass}>
            <CardAccent />
            <h2 className="text-base font-semibold tracking-tight">What to prepare</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border bg-background p-4">
                <p className="text-sm font-semibold">Before the event</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Make sure your QR is ready. If it is not available, contact the organizer before the event.</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-sm font-semibold">At the venue</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Let the organizer scan your QR. If scanning fails, follow the organizer’s backup attendance instructions.</p>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <ModalShell
        open={showIssueReport}
        title="Report check-in problem"
        description="Use this only when QR scanning or backup verification did not work during an event."
        size="md"
        onClose={() => {
          setShowIssueReport(false);
          issueForm.clearErrors();
        }}
      >
        <form onSubmit={issueForm.handleSubmit(handleIssueSubmit)} className="space-y-4">
          <div className="rounded-2xl border bg-warning/5 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-warning/10">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </span>
              <div>
                <p className="font-semibold">Before sending, check with the event organizer first.</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Submit this report if your attendance could not be recorded because the QR scan, camera backup, or organizer verification failed.
                </p>
              </div>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-semibold">What happened?</span>
            <textarea
              {...issueForm.register("issueDescription")}
              className="plpass-field mt-2 min-h-32 w-full rounded-xl border p-3 text-sm"
              placeholder="Example: My QR could not be scanned during EVT-2026-005 at the venue entrance."
            />
          </label>
          {issueForm.formState.errors.issueDescription ? (
            <p className="text-sm text-danger">{issueForm.formState.errors.issueDescription.message}</p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowIssueReport(false);
                issueForm.clearErrors();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={credentialRequestsQuery.createMutation.isPending}>
              {credentialRequestsQuery.createMutation.isPending ? "Submitting..." : "Submit report"}
            </Button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
