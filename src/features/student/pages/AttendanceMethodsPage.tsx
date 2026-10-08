import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ClipboardCheck, Download, Paperclip, QrCode, ShieldCheck, X } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { ModalShell } from "@/components/modals/ModalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useCredentialRequests, useStudentCredentialStatus } from "@/hooks/useRepositoryQueries";
import { useQrCredentialDataUrl } from "@/hooks/useQrCredentialDataUrl";
import { ensureStudentIdentityReadiness, formatCredentialStatus, hasUsableQrCredential, useStudentScope } from "@/features/student/studentExperience";

const issueReportSchema = z.object({ issueDescription: z.string().min(10, "Explanation must be at least 10 characters.") });
type IssueReportValues = z.infer<typeof issueReportSchema>;
const issueProofMaxBytes = 5 * 1024 * 1024;
const acceptedIssueProofTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const cardShellClass = "relative overflow-hidden rounded-2xl border bg-surface p-5 shadow-sm";

function CardAccent() {
  return <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function QrPreview({ active, value, fileName }: { active: boolean; value: string; fileName: string }) {
  const qrDataUrl = useQrCredentialDataUrl(active, value);
  return <div className="flex flex-col items-center gap-3">
    <div className={`grid h-44 w-44 place-items-center rounded-2xl border bg-white p-3 shadow-sm ring-8 ring-primary/5 sm:h-52 sm:w-52 ${!active ? "opacity-70 grayscale" : ""}`} role="img" aria-label={active ? "PLPass student QR credential, ready for organizer scanning" : "PLPass student QR credential unavailable; contact an organizer or administrator"}>
      {qrDataUrl ? <img src={qrDataUrl} alt="" className="h-full w-full object-contain" /> : <QrCode className="h-20 w-20 text-primary/60" aria-hidden="true" />}
    </div>
    {qrDataUrl ? <a href={qrDataUrl} download={fileName} className="inline-flex h-9 items-center justify-center rounded-full border bg-background px-4 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"><Download className="mr-2 h-4 w-4 text-primary" />Download QR</a> : null}
  </div>;
}

export function AttendanceMethodsPage() {
  const scope = useStudentScope();
  const requests = useCredentialRequests({ pageSize: 100 }, scope.context);
  const credentials = useStudentCredentialStatus(scope.student?.id, scope.context);
  const [showIssueReport, setShowIssueReport] = useState(false);
  const [issueProofFile, setIssueProofFile] = useState<File | null>(null);
  const [issueProofError, setIssueProofError] = useState("");
  const [issueProofInputKey, setIssueProofInputKey] = useState(0);
  const issueForm = useForm<IssueReportValues>({ resolver: zodResolver(issueReportSchema), defaultValues: { issueDescription: "" } });

  if (scope.isLoading || credentials.isLoading || requests.isLoading) return <LoadingState label="Loading attendance methods" />;
  if (scope.isError || !scope.student) return <ErrorState title="Student profile unavailable" message="The signed-in account does not have a student profile record." />;
  if (credentials.isError || requests.isError) return <ErrorState title="Unable to load attendance access" message="Please refresh the page. If this continues, ask an organizer to verify your attendance manually." />;

  const student = scope.student;
  const readiness = ensureStudentIdentityReadiness(credentials.data);
  const hasQrCredential = hasUsableQrCredential(readiness);
  const qrStatus = hasQrCredential ? formatCredentialStatus(readiness.qrStatus) : "Pending";
  const qrDownloadFileName = `plpass-qr-${student.studentNumber}.png`;
  const verificationSteps = [
    { icon: QrCode, label: "QR", tag: "Primary", description: "The normal method for Time In and Time Out during onsite events." },
    { icon: ClipboardCheck, label: "Manual", tag: "Backup", description: "Used by organizers when QR scanning is unavailable." }
  ];

  function resetIssueProofFile() {
    setIssueProofFile(null);
    setIssueProofError("");
    setIssueProofInputKey((key) => key + 1);
  }

  function handleIssueProofChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setIssueProofError("");
    if (!file) return setIssueProofFile(null);
    if (!acceptedIssueProofTypes.includes(file.type)) { setIssueProofError("Use a PNG, JPG, WebP, or PDF file."); setIssueProofInputKey((key) => key + 1); return; }
    if (file.size > issueProofMaxBytes) { setIssueProofError("Proof file must be 5 MB or smaller."); setIssueProofInputKey((key) => key + 1); return; }
    setIssueProofFile(file);
  }

  async function handleIssueSubmit(values: IssueReportValues) {
    try {
      await requests.createMutation.mutateAsync({ studentId: student.id, credentialType: "qr", requestType: "technical_issue", reason: values.issueDescription, proofAttachment: issueProofFile ?? undefined });
      issueForm.reset();
      resetIssueProofFile();
      setShowIssueReport(false);
      toast.success("QR support request submitted.");
    } catch { /* The shared mutation reports the failure. */ }
  }

  function closeIssueReport() {
    setShowIssueReport(false);
    issueForm.clearErrors();
    resetIssueProofFile();
  }

  return <div className="space-y-6">
    <PageHeader title="Attendance Methods" description="View your attendance options and report verification issues." actions={<Button type="button" variant="destructive" onClick={() => setShowIssueReport(true)}><AlertTriangle className="mr-2 h-4 w-4" />Report an Issue</Button>} />

    <section className="space-y-4">
      <section className={`${cardShellClass} p-0`}>
        <CardAccent />
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 md:p-6"><div className="flex items-start gap-3"><span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5"><ShieldCheck className="h-5 w-5 text-primary" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendance access</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{hasQrCredential ? "1 of 1 verification options ready" : "0 of 1 verification options ready"}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">QR is the primary method. If QR scanning fails, organizers can record attendance manually.</p></div></div><StatusBadge label={`QR - ${qrStatus}`} tone={hasQrCredential ? "success" : "muted"} /></div>
        <div className="border-t bg-surface-muted/30 p-5 md:p-6"><div className="flex min-h-[34rem] flex-col rounded-2xl border bg-surface p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Primary</p><h2 className="mt-1 text-xl font-semibold tracking-tight">QR Credential</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Use this for Time In and Time Out scans when attending onsite events.</p></div><div className="shrink-0"><StatusBadge label={qrStatus} tone={hasQrCredential ? "success" : "muted"} /></div></div><div className="mt-5 flex flex-1 flex-col items-center justify-center rounded-xl border bg-background p-3 text-center sm:p-5"><QrPreview active={hasQrCredential} value={student.studentNumber} fileName={qrDownloadFileName} /><p className="mt-4 text-sm font-semibold text-foreground">Student No. {student.studentNumber}</p><p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">{hasQrCredential ? "Ready for organizer scanning." : "Preparing your QR credential…"}</p></div></div></div>
      </section>

      <aside className="grid gap-4 lg:grid-cols-2"><div className={cardShellClass}><CardAccent /><h2 className="text-base font-semibold tracking-tight">Supported attendance modes</h2><p className="mt-1 text-sm text-muted-foreground">These are the attendance methods students may encounter in PLPass.</p><div className="mt-5">{verificationSteps.map((step, index) => <div key={step.label} className="relative flex gap-3 pb-6 last:pb-0">{index < verificationSteps.length - 1 ? <span className="absolute left-4 top-9 h-full w-px bg-border" /> : null}<span className="relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 ring-4 ring-surface"><step.icon className="h-3.5 w-3.5 text-primary" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{step.label}</p><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{step.tag}</span></div><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.description}</p></div></div>)}</div></div><div className={cardShellClass}><CardAccent /><h2 className="text-base font-semibold tracking-tight">What to prepare</h2><div className="mt-4 space-y-3"><div className="rounded-xl border bg-background p-4"><p className="text-sm font-semibold">Before the event</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Make sure your QR is ready. If it is not available, contact the organizer before the event.</p></div><div className="rounded-xl border bg-background p-4"><p className="text-sm font-semibold">At the venue</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Let the organizer scan your QR. If scanning fails, follow the organizer’s manual attendance instructions.</p></div></div></div></aside>
    </section>

    <ModalShell open={showIssueReport} title="Report attendance issue" description="Use this only when QR scanning or backup verification did not work during an event." size="md" onClose={closeIssueReport}><form onSubmit={issueForm.handleSubmit(handleIssueSubmit)} className="space-y-4"><div className="rounded-2xl border bg-warning/5 p-4"><div className="flex items-start gap-3"><span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-warning/10"><AlertTriangle aria-hidden="true" className="h-5 w-5 text-warning" /></span><div><p className="font-semibold">Before sending, check with the event organizer first.</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Submit this report if your attendance could not be recorded because QR scanning or organizer verification failed.</p></div></div></div><label className="block"><span className="text-sm font-semibold">What happened?</span><textarea {...issueForm.register("issueDescription")} aria-invalid={Boolean(issueForm.formState.errors.issueDescription)} className="plpass-field mt-2 min-h-32 w-full rounded-xl border p-3 text-sm" placeholder="Example: My QR could not be scanned during EVT-2026-005 at the venue entrance." /></label>{issueForm.formState.errors.issueDescription ? <p role="alert" className="text-sm text-danger">{issueForm.formState.errors.issueDescription.message}</p> : null}<div className="rounded-2xl border bg-surface-muted/40 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold">Proof attachment</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Optional screenshot, photo, or PDF to help organizers review the problem. Maximum file size is {formatFileSize(issueProofMaxBytes)}.</p></div><label className="inline-flex cursor-pointer items-center justify-center rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"><Paperclip className="mr-2 h-4 w-4 text-primary" />Choose file<input key={issueProofInputKey} type="file" accept={acceptedIssueProofTypes.join(",")} className="sr-only" onChange={handleIssueProofChange} /></label></div>{issueProofFile ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2"><div className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 flex-shrink-0 text-primary" /><p className="truncate text-sm font-semibold">{issueProofFile.name}</p></div><button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-muted hover:text-foreground" aria-label="Remove proof attachment" onClick={resetIssueProofFile}><X className="h-4 w-4" /></button></div> : null}{issueProofError ? <p className="mt-2 text-sm text-danger">{issueProofError}</p> : null}</div><div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={closeIssueReport}>Cancel</Button><Button type="submit" disabled={requests.createMutation.isPending || Boolean(issueProofError)}>{requests.createMutation.isPending ? "Submitting..." : "Submit report"}</Button></div></form></ModalShell>
  </div>;
}
