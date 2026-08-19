import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import QRCode from "qrcode";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Globe2,
  Lock,
  Paperclip,
  QrCode,
  ShieldCheck,
  UploadCloud,
  X,
  type LucideIcon
} from "lucide-react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useCredentialRequests, useStudentCredentialMutations, useStudentCredentialStatus } from "@/hooks/useRepositoryQueries";
import { buildStudentQrPayload } from "@/lib/credentials/qrCredential";
import { extractFaceDescriptorFromFile, prepareFaceRecognition } from "@/lib/biometrics/humanFace";
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
const issueProofMaxBytes = 5 * 1024 * 1024;
const acceptedIssueProofTypes = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const faceEnrollmentMaxBytes = 5 * 1024 * 1024;
const acceptedFaceEnrollmentTypes = ["image/png", "image/jpeg", "image/webp"];

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CardAccent() {
  return <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/70 via-primary/25 to-transparent" />;
}

function QrPreview({ active, value, fileName }: { active: boolean; value: string; fileName: string }) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (!active || !value) {
      setQrDataUrl("");
      return;
    }

    QRCode.toDataURL(value, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#16351f",
        light: "#ffffff"
      }
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [active, value]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn("grid h-52 w-52 place-items-center rounded-2xl border bg-white p-3 shadow-sm ring-8 ring-primary/5", !active && "opacity-70 grayscale")}>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="PLPass student QR credential" className="h-full w-full object-contain" />
        ) : (
          <QrCode className="h-20 w-20 text-primary/60" aria-hidden="true" />
        )}
      </div>
      {qrDataUrl ? (
        <a
          href={qrDataUrl}
          download={fileName}
          className="inline-flex h-9 items-center justify-center rounded-full border bg-background px-4 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted"
        >
          <Download className="mr-2 h-4 w-4 text-primary" />
          Download QR
        </a>
      ) : null}
    </div>
  );
}

export function AttendanceMethodsPage() {
  const scope = useStudentScope();
  const credentialRequestsQuery = useCredentialRequests({ pageSize: 100 }, scope.context);
  const credentialStatusQuery = useStudentCredentialStatus(scope.student?.id, scope.context);
  const credentialMutations = useStudentCredentialMutations(scope.context);
  const [showChangeRequest, setShowChangeRequest] = useState(false);
  const [showFaceEnrollment, setShowFaceEnrollment] = useState(false);
  const [showIssueReport, setShowIssueReport] = useState(false);
  const [issueProofFile, setIssueProofFile] = useState<File | null>(null);
  const [issueProofError, setIssueProofError] = useState("");
  const [issueProofInputKey, setIssueProofInputKey] = useState(0);
  const [faceEnrollmentFile, setFaceEnrollmentFile] = useState<File | null>(null);
  const [faceEnrollmentError, setFaceEnrollmentError] = useState("");
  const [faceEnrollmentProcessing, setFaceEnrollmentProcessing] = useState(false);
  const [faceRecognitionPreparing, setFaceRecognitionPreparing] = useState(false);
  const [faceEnrollmentInputKey, setFaceEnrollmentInputKey] = useState(0);
  const [facePreviewUrl, setFacePreviewUrl] = useState("");
  const [faceCameraError, setFaceCameraError] = useState("");
  const [faceCameraStarting, setFaceCameraStarting] = useState(false);
  const [faceCameraRestartKey, setFaceCameraRestartKey] = useState(0);
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);

  const issueForm = useForm<IssueReportFormValues>({
    resolver: zodResolver(issueReportSchema),
    defaultValues: { issueDescription: "" }
  });
  const changeRequestForm = useForm<ChangeRequestFormValues>({
    resolver: zodResolver(changeRequestSchema),
    defaultValues: { reason: "" }
  });

  useEffect(() => {
    let cancelled = false;

    async function startFaceCamera() {
      if (!showFaceEnrollment || faceEnrollmentFile) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        setFaceCameraError("Camera capture is not available in this browser. Use the fallback photo picker below.");
        return;
      }

      stopFaceCamera();
      setFaceCameraError("");
      setFaceCameraStarting(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 960 },
            height: { ideal: 720 }
          }
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        faceStreamRef.current = stream;
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          await faceVideoRef.current.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setFaceCameraError("Camera access was blocked or unavailable. Use the fallback photo picker below.");
        }
      } finally {
        if (!cancelled) {
          setFaceCameraStarting(false);
        }
      }
    }

    void startFaceCamera();

    return () => {
      cancelled = true;
      stopFaceCamera();
    };
  }, [showFaceEnrollment, faceEnrollmentFile, faceCameraRestartKey]);

  useEffect(() => {
    if (!showFaceEnrollment) return;
    let cancelled = false;
    setFaceRecognitionPreparing(true);
    void prepareFaceRecognition()
      .catch(() => {
        if (!cancelled) setFaceEnrollmentError("Face recognition could not start. Please check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setFaceRecognitionPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showFaceEnrollment]);

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
  const approvedFacialReEnrollment = studentCredentialRequests.some((request) =>
    request.credentialType === "facial" && request.requestType === "re_enrollment" && request.status === "approved"
  );
  const identityReadiness = ensureStudentIdentityReadiness(credentialStatusQuery.data);
  const hasQrCredential = hasUsableQrCredential(identityReadiness);
  const qrStatus = pendingQrIssue ? "Issue pending" : hasQrCredential ? formatCredentialStatus(identityReadiness.qrStatus) : "Not configured";
  const facialStatus = pendingFacialRequest
    ? "Request pending"
    : approvedFacialReEnrollment
      ? "Re-enrollment approved"
      : formatCredentialStatus(identityReadiness.faceStatus);
  const readiness = Number(hasQrCredential) + Number(identityReadiness.faceEnrolled);
  const qrScanCode = identityReadiness.qrCredentialId ? buildStudentQrPayload(student.studentNumber, identityReadiness.qrCredentialId) : "";
  const qrDownloadFileName = `plpass-qr-${student.studentNumber}.png`;

  async function handleIssueSubmit(values: IssueReportFormValues) {
    try {
      await credentialRequestsQuery.createMutation.mutateAsync({
        studentId: student.id,
        credentialType: "qr",
        requestType: "technical_issue",
        reason: values.issueDescription,
        proofAttachment: issueProofFile ?? undefined
      });
      toast.success("Attendance issue submitted.");
      issueForm.reset();
      resetIssueProofFile();
      setShowIssueReport(false);
    } catch {
      toast.error("Unable to submit attendance issue. Check if you already have a pending request.");
    }
  }

  function resetIssueProofFile() {
    setIssueProofFile(null);
    setIssueProofError("");
    setIssueProofInputKey((key) => key + 1);
  }

  function handleIssueProofChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setIssueProofError("");

    if (!file) {
      setIssueProofFile(null);
      return;
    }

    if (!acceptedIssueProofTypes.includes(file.type)) {
      setIssueProofFile(null);
      setIssueProofError("Use a PNG, JPG, WebP, or PDF file.");
      setIssueProofInputKey((key) => key + 1);
      return;
    }

    if (file.size > issueProofMaxBytes) {
      setIssueProofFile(null);
      setIssueProofError("Proof file must be 5 MB or smaller.");
      setIssueProofInputKey((key) => key + 1);
      return;
    }

    setIssueProofFile(file);
  }

  function resetFaceEnrollmentFile() {
    if (facePreviewUrl) {
      URL.revokeObjectURL(facePreviewUrl);
    }
    setFaceEnrollmentFile(null);
    setFacePreviewUrl("");
    setFaceEnrollmentError("");
    setFaceEnrollmentInputKey((key) => key + 1);
    setFaceCameraRestartKey((key) => key + 1);
  }

  function stopFaceCamera() {
    faceStreamRef.current?.getTracks().forEach((track) => track.stop());
    faceStreamRef.current = null;
    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = null;
    }
  }

  function setFaceEnrollmentCapture(file: File) {
    if (facePreviewUrl) {
      URL.revokeObjectURL(facePreviewUrl);
    }
    setFaceEnrollmentFile(file);
    setFacePreviewUrl(URL.createObjectURL(file));
    setFaceEnrollmentError("");
    stopFaceCamera();
  }

  function handleFaceEnrollmentFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFaceEnrollmentError("");

    if (!file) {
      setFaceEnrollmentFile(null);
      return;
    }

    if (!acceptedFaceEnrollmentTypes.includes(file.type)) {
      setFaceEnrollmentFile(null);
      setFaceEnrollmentError("Use a PNG, JPG, or WebP photo.");
      setFaceEnrollmentInputKey((key) => key + 1);
      return;
    }

    if (file.size > faceEnrollmentMaxBytes) {
      setFaceEnrollmentFile(null);
      setFaceEnrollmentError("Face photo must be 5 MB or smaller.");
      setFaceEnrollmentInputKey((key) => key + 1);
      return;
    }

    setFaceEnrollmentCapture(file);
  }

  function captureLiveFacePhoto() {
    const video = faceVideoRef.current;
    const canvas = faceCanvasRef.current;

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setFaceEnrollmentError("Camera is still loading. Please try again in a moment.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setFaceEnrollmentError("Unable to capture from this camera.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setFaceEnrollmentError("Unable to capture a face photo. Please try again.");
        return;
      }

      if (blob.size > faceEnrollmentMaxBytes) {
        setFaceEnrollmentError("Captured photo is too large. Please try again.");
        return;
      }

      const file = new File([blob], `face-enrollment-${student.studentNumber}.jpg`, { type: "image/jpeg" });
      setFaceEnrollmentCapture(file);
    }, "image/jpeg", 0.9);
  }

  async function handleFaceEnrollmentSubmit() {
    if (!faceEnrollmentFile) {
      setFaceEnrollmentError("Attach a clear face photo before enrolling.");
      return;
    }

    try {
      setFaceEnrollmentError("");
      setFaceEnrollmentProcessing(true);
      const { descriptor } = await extractFaceDescriptorFromFile(faceEnrollmentFile);
      await credentialMutations.enrollFacialProfileMutation.mutateAsync({
        studentId: student.id,
        faceImage: faceEnrollmentFile,
        faceDescriptor: descriptor
      });
      toast.success("Facial backup enrolled.");
      resetFaceEnrollmentFile();
      setShowFaceEnrollment(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to enroll face.";
      setFaceEnrollmentError(message);
      toast.error(`${message} If it was already enrolled, submit a re-enrollment request.`);
    } finally {
      setFaceEnrollmentProcessing(false);
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
        title="Attendance Methods"
        description="View your QR access, backup verification, and attendance issue reporting."
        actions={
          <Button type="button" variant="outline" onClick={() => setShowIssueReport(true)}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Report attendance issue
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
                  <QrPreview active={hasQrCredential} value={qrScanCode} fileName={qrDownloadFileName} />
                  <p className="mt-4 text-sm font-semibold text-foreground">
                    Student No. {student.studentNumber}
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
                        <p className="text-sm font-semibold text-muted-foreground">
                          {identityReadiness.faceEnrolled ? "Re-enrollment requires organizer approval" : "One-time student enrollment"}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {identityReadiness.faceEnrolled
                            ? "Your face is already enrolled. Submit a re-enrollment request only if it needs to be changed."
                            : "Attach one clear face photo. After enrollment, changes must go through a re-enrollment request."}
                        </p>
                        {pendingFacialRequest ? (
                          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Request sent - awaiting organizer review.
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {!identityReadiness.faceEnrolled && !pendingFacialRequest ? (
                            <Button type="button" size="sm" onClick={() => setShowFaceEnrollment(true)}>
                              Enroll face
                            </Button>
                          ) : null}
                          {identityReadiness.faceEnrolled && approvedFacialReEnrollment ? (
                            <Button type="button" size="sm" onClick={() => setShowFaceEnrollment(true)}>
                              Enroll face
                            </Button>
                          ) : null}
                          {identityReadiness.faceEnrolled && !pendingFacialRequest && !approvedFacialReEnrollment ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => setShowChangeRequest(true)}>
                              Request re-enrollment
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
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
        open={showFaceEnrollment}
        title="Enroll facial backup"
        description="Capture a live face photo. You can enroll only once; future changes require a re-enrollment request."
        size="md"
        onClose={() => {
          setShowFaceEnrollment(false);
          resetFaceEnrollmentFile();
        }}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Camera className="h-5 w-5 text-primary" />
              </span>
              <div>
                <p className="font-semibold">Use a clear live front-facing photo.</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  This becomes your backup identity record for organizer-assisted verification. Make sure your face is centered and well-lit.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-surface-muted/40 p-4">
            <div className="overflow-hidden rounded-2xl border bg-black">
              {facePreviewUrl ? (
                <img src={facePreviewUrl} alt="Captured face preview" className="aspect-video w-full object-cover" />
              ) : (
                <div className="relative aspect-video w-full">
                  <video
                    ref={faceVideoRef}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    autoPlay
                  />
                  {faceCameraStarting ? (
                    <div className="absolute inset-0 grid place-items-center bg-black/70 text-sm font-semibold text-white">
                      Starting camera...
                    </div>
                  ) : null}
                  {faceCameraError ? (
                    <div className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-sm font-medium leading-6 text-white">
                      {faceCameraError}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <canvas ref={faceCanvasRef} className="hidden" aria-hidden="true" />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{faceEnrollmentFile ? "Captured face photo" : "Live camera capture"}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {faceEnrollmentFile
                    ? `Ready to enroll. File size: ${formatFileSize(faceEnrollmentFile.size)}.`
                    : `Capture must be clear and front-facing. Maximum file size is ${formatFileSize(faceEnrollmentMaxBytes)}.`}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {faceEnrollmentFile ? (
                  <Button type="button" variant="outline" onClick={resetFaceEnrollmentFile}>
                    Retake photo
                  </Button>
                ) : (
                  <Button type="button" onClick={captureLiveFacePhoto} disabled={faceCameraStarting || Boolean(faceCameraError)}>
                    <Camera className="mr-2 h-4 w-4" />
                    Capture face
                  </Button>
                )}
              </div>
            </div>

            {faceCameraError ? (
              <div className="mt-4 rounded-xl border bg-background p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-muted-foreground">
                    If your device camera is blocked, use this fallback to capture/select a new face photo.
                  </p>
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted">
                    <UploadCloud className="mr-2 h-4 w-4 text-primary" />
                    Use fallback
                    <input
                      key={faceEnrollmentInputKey}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      capture="user"
                      className="sr-only"
                      onChange={handleFaceEnrollmentFileChange}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {faceEnrollmentError ? <p className="mt-2 text-sm text-danger">{faceEnrollmentError}</p> : null}
            {faceRecognitionPreparing ? <p className="mt-2 text-xs text-muted-foreground">Preparing face recognition in the background…</p> : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowFaceEnrollment(false);
                resetFaceEnrollmentFile();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={credentialMutations.enrollFacialProfileMutation.isPending || faceEnrollmentProcessing || !faceEnrollmentFile || Boolean(faceEnrollmentError)}
              onClick={handleFaceEnrollmentSubmit}
            >
              {faceEnrollmentProcessing ? "Checking face..." : credentialMutations.enrollFacialProfileMutation.isPending ? "Enrolling..." : "Enroll face"}
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={showChangeRequest}
        title="Request facial re-enrollment"
        description="Use this when your enrolled face record needs to be changed or reset by an organizer."
        size="md"
        onClose={() => {
          setShowChangeRequest(false);
          changeRequestForm.clearErrors();
        }}
      >
        <form onSubmit={changeRequestForm.handleSubmit(handleChangeRequestSubmit)} className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold">Reason for re-enrollment</span>
            <textarea
              {...changeRequestForm.register("reason")}
              className="plpass-field mt-2 min-h-32 w-full rounded-xl border p-3 text-sm"
              placeholder="Example: My facial backup needs to be updated because my previous photo is unclear."
            />
          </label>
          {changeRequestForm.formState.errors.reason ? (
            <p className="text-sm text-danger">{changeRequestForm.formState.errors.reason.message}</p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowChangeRequest(false);
                changeRequestForm.clearErrors();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={credentialRequestsQuery.createMutation.isPending}>
              {credentialRequestsQuery.createMutation.isPending ? "Sending..." : "Submit request"}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={showIssueReport}
        title="Report attendance issue"
        description="Use this only when QR scanning or backup verification did not work during an event."
        size="md"
        onClose={() => {
          setShowIssueReport(false);
          issueForm.clearErrors();
          resetIssueProofFile();
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

          <div className="rounded-2xl border bg-surface-muted/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Proof attachment</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Optional screenshot, photo, or PDF to help organizers review the problem. Maximum file size is {formatFileSize(issueProofMaxBytes)}.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-full border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface-muted">
                <Paperclip className="mr-2 h-4 w-4 text-primary" />
                Choose file
                <input
                  key={issueProofInputKey}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="sr-only"
                  onChange={handleIssueProofChange}
                />
              </label>
            </div>

            {issueProofFile ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Paperclip className="h-4 w-4 flex-shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{issueProofFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(issueProofFile.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
                  aria-label="Remove proof attachment"
                  onClick={resetIssueProofFile}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {issueProofError ? <p className="mt-2 text-sm text-danger">{issueProofError}</p> : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowIssueReport(false);
                issueForm.clearErrors();
                resetIssueProofFile();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={credentialRequestsQuery.createMutation.isPending || Boolean(issueProofError)}>
              {credentialRequestsQuery.createMutation.isPending ? "Submitting..." : "Submit report"}
            </Button>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
