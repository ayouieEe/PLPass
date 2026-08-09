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

function CardAccent() {
  return <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />;
}

export function AttendanceMethodsPage() {
  const scope = useStudentScope();
  const credentialRequestsQuery = useCredentialRequests({ pageSize: 100 }, scope.context);
  const credentialStatusQuery = useStudentCredentialStatus(scope.student?.id, scope.context);
  const [showChangeRequest, setShowChangeRequest] = useState(false);

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
  if (credentialStatusQuery.isLoading) return <LoadingState label="Loading credential readiness" />;
  if (credentialStatusQuery.isError) return <ErrorState title="Unable to load credential readiness" message="Check that the QR credential and facial profile tables are available in Supabase." />;

  const student = scope.student;
  const studentCredentialRequests = (credentialRequestsQuery.data?.items ?? []).filter((request) => request.studentId === student.id);
  const pendingQrIssue = studentCredentialRequests.some((request) => request.credentialType === "qr" && request.status === "pending");
  const pendingFacialRequest = studentCredentialRequests.some((request) => request.credentialType === "facial" && request.status === "pending");
  const identityReadiness = ensureStudentIdentityReadiness(credentialStatusQuery.data);
  const hasQrCredential = hasUsableQrCredential(identityReadiness);
  const qrStatus = pendingQrIssue ? "Issue pending" : hasQrCredential ? formatCredentialStatus(identityReadiness.qrStatus) : "Not configured";
  const facialStatus = pendingFacialRequest ? "Request pending" : formatCredentialStatus(identityReadiness.faceStatus);
  const readiness = Number(hasQrCredential) + Number(identityReadiness.faceEnrolled);
  const qrReference = identityReadiness.qrCredentialId ? `Credential ${identityReadiness.qrCredentialId}` : "No QR credential found";

  async function handleIssueSubmit(values: IssueReportFormValues) {
    try {
      await credentialRequestsQuery.createMutation.mutateAsync({
        studentId: student.id,
        credentialType: "qr",
        requestType: "technical_issue",
        reason: values.issueDescription
      });
      toast.success("Authentication issue submitted to Supabase.");
      issueForm.reset();
    } catch {
      toast.error("Unable to submit authentication issue. Check if you already have a pending request.");
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
      toast.success("Re-enrollment request sent to Supabase.");
      changeRequestForm.reset();
      setShowChangeRequest(false);
    } catch {
      toast.error("Unable to send re-enrollment request. Check if you already have a pending request.");
    }
  }

  const verificationSteps: Array<{ icon: LucideIcon; label: string; tag: string; description: string }> = [
    { icon: QrCode, label: "QR", tag: "Primary", description: "Organizer scans an active Supabase QR credential for normal Time In and Time Out." },
    { icon: Camera, label: "Facial", tag: "Fallback", description: "Used only if the QR scan cannot be completed." },
    { icon: ClipboardCheck, label: "Manual", tag: "Organizer recorded", description: "Organizer records attendance directly when verification needs review." },
    { icon: Globe2, label: "Online", tag: "Remote event", description: "Used for online events when attendance is accepted remotely." }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verification Setup"
        title="Attendance Methods"
        description="Prepare your QR and facial fallback, and understand the supported attendance modes: QR, facial, manual, and online."
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity readiness</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{readiness} of 2 student verification signals available</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    QR and facial readiness are read from Supabase credential records. Manual and online attendance are recorded by organizers when needed.
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
                      Use the QR credential issued in Supabase for Time In and Time Out scans.
                    </p>
                  </div>
                  <StatusBadge label={qrStatus} tone={pendingQrIssue ? "warning" : hasQrCredential ? "success" : "muted"} />
                </div>

                <div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-xl border bg-background p-5 text-center">
                  <div className="relative grid h-44 w-44 place-items-center rounded-2xl border bg-card shadow-sm">
                    <div className="absolute inset-5 rounded-xl opacity-20 [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:12px_12px]" />
                    <div className="absolute left-5 top-5 h-10 w-10 rounded-md border-4 border-foreground" />
                    <div className="absolute right-5 top-5 h-10 w-10 rounded-md border-4 border-foreground" />
                    <div className="absolute bottom-5 left-5 h-10 w-10 rounded-md border-4 border-foreground" />
                    <QrCode className="relative h-14 w-14 text-primary" />
                  </div>
                  <p className="mt-4 max-w-full break-all font-mono text-sm font-semibold text-foreground">
                    {qrReference}
                  </p>
                  <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    {hasQrCredential ? "Active QR credential found in Supabase." : "Ask an organizer/admin to issue a QR credential."}
                  </p>
                </div>
              </div>

              <div className="flex h-full min-h-[34rem] flex-col rounded-2xl border bg-surface p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fallback</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">Facial Recognition</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Used by organizers only when QR scanning fails.
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
                      <p className="font-semibold">{identityReadiness.faceEnrolled ? "Facial profile active" : pendingFacialRequest ? "Organizer review requested" : "Student self-enrollment disabled"}</p>
                      <p className="text-sm text-muted-foreground">
                        {identityReadiness.faceEnrolled
                          ? `Supabase facial profile enrolled${identityReadiness.faceEnrolledDate ? ` on ${new Date(identityReadiness.faceEnrolledDate).toLocaleDateString()}` : ""}.`
                          : pendingFacialRequest ? "Your request is stored in Supabase and awaiting review." : "Facial fallback must be enabled by an organizer or admin."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border border-dashed bg-muted/30 p-4">
                      <div className="flex items-start gap-3">
                        <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-muted-foreground">Facial setup is organizer-managed</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Send a Supabase request if your facial fallback needs review.
                          </p>
                          {pendingFacialRequest && !showChangeRequest && (
                            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Request sent - awaiting organizer review.
                            </p>
                          )}
                          {!showChangeRequest && !pendingFacialRequest && !identityReadiness.faceEnrolled && (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setShowChangeRequest(true)}>
                              Request facial review
                            </Button>
                          )}
                        </div>
                      </div>

                      {showChangeRequest && (
                        <form onSubmit={changeRequestForm.handleSubmit(handleChangeRequestSubmit)} className="mt-4 border-t pt-4">
                          <textarea
                            {...changeRequestForm.register("reason")}
                            className="plpass-field min-h-24 w-full rounded-xl border p-3 text-sm"
                            placeholder="Tell the organizer why you need to re-enroll."
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

          <form onSubmit={issueForm.handleSubmit(handleIssueSubmit)} className={cardShellClass}>
            <CardAccent />
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight">Report authentication issue</h2>
                <p className="mt-1 text-sm text-muted-foreground">Use this for a failed scan, camera issue, or other check-in problem.</p>
              </div>
            </div>
            <textarea
              {...issueForm.register("issueDescription")}
              className="plpass-field mt-4 min-h-24 w-full rounded-xl border p-3 text-sm"
              placeholder="Describe the event, venue, and what happened."
            />
            {issueForm.formState.errors.issueDescription ? (
              <p className="mt-2 text-sm text-danger">{issueForm.formState.errors.issueDescription.message}</p>
            ) : null}
            <Button type="submit" className="mt-4 w-full sm:w-auto" disabled={credentialRequestsQuery.createMutation.isPending}>
              {credentialRequestsQuery.createMutation.isPending ? "Submitting..." : "Submit issue"}
            </Button>
          </form>
        </div>

        <aside className="grid gap-4 lg:grid-cols-2">
          <div className={cardShellClass}>
            <CardAccent />
            <h2 className="text-base font-semibold tracking-tight">Supported attendance modes</h2>
            <p className="mt-1 text-sm text-muted-foreground">These are the only methods PLPass uses for student attendance.</p>
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
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Make sure your Supabase QR credential is active. Request facial review if your fallback setup needs organizer attention.</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-sm font-semibold">At the venue</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Let the organizer scan your QR. They may use facial, manual, or online attendance only when the event setup requires it.</p>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
