import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Paperclip, QrCode } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useCredentialRequests, useStudentCredentialStatus } from "@/hooks/useRepositoryQueries";
import { useQrCredentialDataUrl } from "@/hooks/useQrCredentialDataUrl";
import { ensureStudentIdentityReadiness, formatCredentialStatus, hasUsableQrCredential, useStudentScope } from "@/features/student/studentExperience";

const issueSchema = z.object({ issueDescription: z.string().min(10, "Explanation must be at least 10 characters.") });
type IssueValues = z.infer<typeof issueSchema>;
const maxProofBytes = 5 * 1024 * 1024;
const acceptedProofTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export function AttendanceMethodsPage() {
  const scope = useStudentScope();
  const requests = useCredentialRequests({ pageSize: 100 }, scope.context);
  const credentials = useStudentCredentialStatus(scope.student?.id, scope.context);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState("");
  const [issueOpen, setIssueOpen] = useState(false);
  const form = useForm<IssueValues>({ resolver: zodResolver(issueSchema), defaultValues: { issueDescription: "" } });
  const qrDataUrl = useQrCredentialDataUrl(Boolean(credentials.data?.qrCredential), scope.student?.studentNumber ?? "");

  if (scope.isLoading || credentials.isLoading || requests.isLoading) return <LoadingState label="Loading attendance methods" />;
  if (scope.isError || !scope.student) return <ErrorState title="Student profile unavailable" message="The signed-in account does not have a student profile record." />;
  if (credentials.isError || requests.isError) return <ErrorState title="Unable to load attendance access" message="Please refresh the page or ask an organizer to verify your attendance manually." />;

  const student = scope.student;
  const readiness = ensureStudentIdentityReadiness(credentials.data);
  const active = hasUsableQrCredential(readiness);

  function handleProofChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setProofError("");
    if (!file) return setProofFile(null);
    if (!acceptedProofTypes.includes(file.type)) return setProofError("Use a PNG, JPG, WebP, or PDF file.");
    if (file.size > maxProofBytes) return setProofError("Proof file must be 5 MB or smaller.");
    setProofFile(file);
  }

  async function submitIssue(values: IssueValues) {
    try {
      await requests.createMutation.mutateAsync({ studentId: student.id, credentialType: "qr", requestType: "technical_issue", reason: values.issueDescription, proofAttachment: proofFile ?? undefined });
      form.reset();
      setProofFile(null);
      toast.success("QR support request submitted.");
    } catch {
      // The shared mutation reports the failure to the user.
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance Methods" description="Use your QR credential for attendance. Manual verification remains available through an organizer." />
      <section className="rounded-2xl border bg-surface p-6 shadow-sm"><h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Supported attendance modes</h2><p className="mb-4 text-sm font-medium">QR</p>
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">QR credential</h2><p className="mt-1 text-sm text-muted-foreground">Status: {active ? formatCredentialStatus(readiness.qrStatus) : "Pending"}</p></div><QrCode className="h-8 w-8 text-primary" aria-hidden="true" /></div>
        <div className="mt-6 flex flex-col items-center gap-4"><div className={`grid h-56 w-56 place-items-center rounded-2xl border bg-white p-3 ${active ? "" : "opacity-60 grayscale"}`} role="img" aria-label={active ? "PLPass student QR credential" : "PLPass QR credential unavailable"}>{qrDataUrl ? <img src={qrDataUrl} alt="" className="h-full w-full object-contain" /> : <QrCode className="h-20 w-20 text-primary/60" aria-hidden="true" />}</div>{qrDataUrl ? <a href={qrDataUrl} download={`plpass-qr-${student.studentNumber}.png`} className="inline-flex items-center rounded-full border px-4 py-2 text-sm font-semibold"><Download className="mr-2 h-4 w-4" />Download QR</a> : null}</div>
      </section>
      <section className="rounded-2xl border bg-surface p-6 shadow-sm"><h2 className="text-xl font-semibold">QR support</h2><p className="mt-1 text-sm text-muted-foreground">If your QR credential cannot be used, send a support request to the credential team.</p><Button type="button" className="mt-4" onClick={() => setIssueOpen(true)}>Report an Issue</Button>{issueOpen ? <form className="mt-4 space-y-4" onSubmit={form.handleSubmit(submitIssue)}><textarea {...form.register("issueDescription")} className="min-h-28 w-full rounded-lg border bg-background p-3 text-sm" placeholder="Example: My QR could not be scanned during EVT-2026-005 at the venue entrance." />{form.formState.errors.issueDescription ? <p className="text-sm text-danger">{form.formState.errors.issueDescription.message}</p> : null}<label className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"><Paperclip className="h-4 w-4" />Attach proof<input type="file" className="sr-only" accept={acceptedProofTypes.join(",")} onChange={handleProofChange} /></label>{proofFile ? <p className="text-sm text-muted-foreground">Attached: {proofFile.name}</p> : null}{proofError ? <p className="text-sm text-danger">{proofError}</p> : null}<Button type="submit" disabled={requests.createMutation.isPending}>{requests.createMutation.isPending ? "Submitting…" : "Submit report"}</Button></form> : null}</section>
    </div>
  );
}
