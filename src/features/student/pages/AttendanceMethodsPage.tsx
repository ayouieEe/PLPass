import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  type LucideIcon
} from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import { createStudentSupportRequest, ensureStudentIdentityReadiness, qrUidForStudent, useStudentScope } from "@/features/student/studentExperience";

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
  const [isFaceEnrolled, setIsFaceEnrolled] = useState(false);
  const [isEnrollingFace, setIsEnrollingFace] = useState(false);
  const [enrollProgress, setEnrollProgress] = useState(0);
  const [qrCodeVal, setQrCodeVal] = useState("");
  const [qrExpiry, setQrExpiry] = useState<string | null>(null);
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [changeRequestSent, setChangeRequestSent] = useState(false);

  const issueForm = useForm<IssueReportFormValues>({
    resolver: zodResolver(issueReportSchema),
    defaultValues: { issueDescription: "" }
  });
  const changeRequestForm = useForm<ChangeRequestFormValues>({
    resolver: zodResolver(changeRequestSchema),
    defaultValues: { reason: "" }
  });

  useEffect(() => {
    if (!scope.student) return;
    const readiness = ensureStudentIdentityReadiness(scope.student);
    setIsFaceEnrolled(readiness.faceEnrolled);
    setQrCodeVal(readiness.qrCode);
    setQrExpiry(readiness.qrExpiry);
  }, [scope.student]);

  const enrolledDate = scope.student ? ensureStudentIdentityReadiness(scope.student).faceEnrolledDate : null;
  const qrStatus = qrCodeVal ? "Ready" : "Not generated";
  const facialStatus = isFaceEnrolled ? "Ready" : isEnrollingFace ? "Pending" : "Not enrolled";
  const readiness = useMemo(() => [Boolean(qrCodeVal), isFaceEnrolled].filter(Boolean).length, [isFaceEnrolled, qrCodeVal]);

  if (scope.isLoading) return <LoadingState label="Loading attendance methods" />;
  if (scope.isError || !scope.student) return <ErrorState title="Student profile unavailable" message="The signed-in account does not have a student profile record." />;

  const student = scope.student;

  function handleEnrollFace() {
    setIsEnrollingFace(true);
    setEnrollProgress(0);
    const interval = window.setInterval(() => {
      setEnrollProgress((current) => {
        if (current >= 100) {
          window.clearInterval(interval);
          setIsEnrollingFace(false);
          setIsFaceEnrolled(true);
          localStorage.setItem("plpass-face-enrolled", "true");
          localStorage.setItem("plpass-face-enrolled-date", new Date().toISOString());
          toast.success("Facial enrollment completed.");
          return 100;
        }
        return current + 20;
      });
    }, 180);
  }

  function handleGenerateQr() {
    const nextToken = qrUidForStudent(scope.student);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setQrCodeVal(nextToken);
    setQrExpiry(expiry);
    localStorage.setItem("plpass-qr-generated", "true");
    localStorage.setItem("plpass-qr-code-val", nextToken);
    localStorage.setItem("plpass-qr-expiry", expiry);
    toast.success("QR UID prepared.");
  }

  function handleIssueSubmit(values: IssueReportFormValues) {
    createStudentSupportRequest(student.id, {
      kind: "authentication_issue",
      title: "Authentication issue",
      description: values.issueDescription
    });
    toast.success("Authentication issue submitted.");
    issueForm.reset();
  }

  function handleChangeRequestSubmit(values: ChangeRequestFormValues) {
    createStudentSupportRequest(student.id, {
      kind: "face_reenrollment",
      title: "Facial re-enrollment request",
      description: values.reason
    });
    toast.success("Re-enrollment request sent. An organizer will review it.");
    changeRequestForm.reset();
    setShowChangeRequest(false);
    setChangeRequestSent(true);
  }

  const verificationSteps: Array<{ icon: LucideIcon; label: string; tag: string; description: string }> = [
    { icon: QrCode, label: "QR UID", tag: "Primary", description: "Organizer scans this first for Time In and Time Out." },
    { icon: Camera, label: "Facial Recognition", tag: "Fallback", description: "Used only if the QR scan cannot be completed." },
    { icon: UserCheck, label: "Manual Verification", tag: "Organizer only", description: "Last resort - nothing for you to set up." }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Verification Setup"
        title="Attendance Methods"
        description="Manage the identity signals organizers use to record your Time In and Time Out. Keep both methods ready so attendance can move quickly at the venue."
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
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{readiness} of 2 signals ready</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    QR handles normal attendance scans. Facial recognition is the fallback when a scan cannot be completed.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={`QR - ${qrStatus}`} tone={qrCodeVal ? "success" : "muted"} />
                <StatusBadge label={`Face - ${facialStatus}`} tone={isFaceEnrolled ? "success" : isEnrollingFace ? "warning" : "muted"} />
              </div>
            </div>

            <div className="grid gap-4 border-t bg-surface-muted/30 p-5 md:auto-rows-fr md:grid-cols-2 md:p-6">
              <div className="flex h-full min-h-[34rem] flex-col rounded-2xl border bg-surface p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Primary</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">QR UID</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Show this code to the organizer for Time In and Time Out scans.
                    </p>
                  </div>
                  <Button type="button" onClick={handleGenerateQr} className="w-fit shrink-0 self-start sm:self-start">
                    {qrCodeVal ? <RefreshCw className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
                    {qrCodeVal ? "Refresh" : "Prepare"}
                  </Button>
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
                    {qrCodeVal || qrUidForStudent(scope.student)}
                  </p>
                  <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {qrExpiry ? `Prepared until ${formatDisplayDate(qrExpiry)}` : "Available when organizer requests your UID."}
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
                    <StatusBadge label={facialStatus} tone={isFaceEnrolled ? "success" : isEnrollingFace ? "warning" : "muted"} />
                  </div>
                </div>

                <div className="mt-5 flex flex-1 flex-col rounded-xl border bg-background p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {isFaceEnrolled ? <CheckCircle2 className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
                    </div>
                    <div>
                      <p className="font-semibold">{isFaceEnrolled ? "Enrollment active" : "Enrollment not completed"}</p>
                      <p className="text-sm text-muted-foreground">
                        {isFaceEnrolled && enrolledDate ? `Registered ${formatDisplayDate(enrolledDate)}` : "Enroll once so a fallback is ready."}
                      </p>
                    </div>
                  </div>

                  {isEnrollingFace ? (
                    <div className="mt-5">
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${enrollProgress}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Scan progress: {enrollProgress}%</p>
                    </div>
                  ) : !isFaceEnrolled ? (
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">Choose a moment with good lighting.</p>
                      <Button type="button" onClick={handleEnrollFace}>
                        <Camera className="h-4 w-4" />
                        Start enrollment
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-xl border border-dashed bg-muted/30 p-4">
                      <div className="flex items-start gap-3">
                        <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-muted-foreground">Enrollment is locked</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Re-enrollment requires organizer review.
                          </p>
                          {changeRequestSent && !showChangeRequest && (
                            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Request sent - awaiting organizer review.
                            </p>
                          )}
                          {!showChangeRequest && (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setShowChangeRequest(true)}>
                              Request re-enrollment
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
                            <Button type="submit" size="sm">Send request</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setShowChangeRequest(false)}>Cancel</Button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
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
            <Button type="submit" className="mt-4 w-full sm:w-auto">Submit issue</Button>
          </form>
        </div>

        <aside className="grid gap-4 lg:grid-cols-2">
          <div className={cardShellClass}>
            <CardAccent />
            <h2 className="text-base font-semibold tracking-tight">Verification order</h2>
            <p className="mt-1 text-sm text-muted-foreground">How organizers check you in, in order.</p>
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
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Prepare or refresh your QR UID from this page.</p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="text-sm font-semibold">At the venue</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Let the organizer scan your code. They choose a fallback only if needed.</p>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
