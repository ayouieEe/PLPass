import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera, CheckCircle2, Clock, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useStudents } from "@/hooks/useRepositoryQueries";
import { formatDisplayDate } from "@/lib/utils/date";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { Student } from "@/types/domain";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  isLoading: boolean;
  isError: boolean;
};

const issueReportSchema = z.object({
  issueDescription: z.string().min(10, "Explanation must be at least 10 characters.")
});

type IssueReportFormValues = z.infer<typeof issueReportSchema>;

function useStudentScope(): StudentScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const studentQuery = useStudents({ pageSize: 1 }, context);

  return {
    context: context ?? { actorUserId: "", actorRole: "student" },
    student: studentQuery.data?.items[0],
    isLoading: studentQuery.isLoading,
    isError: studentQuery.isError
  };
}

function buildQrToken(student?: Student) {
  const identifier = student?.studentNumber ?? "STUDENT";
  return `PLPASS-QR-${identifier}-${Math.floor(100000 + Math.random() * 900000)}`;
}

export function AttendanceMethodsPage() {
  const scope = useStudentScope();
  const [activeTab, setActiveTab] = useState<"facial" | "qr">("facial");
  const [isFaceEnrolled, setIsFaceEnrolled] = useState(false);
  const [isEnrollingFace, setIsEnrollingFace] = useState(false);
  const [enrollProgress, setEnrollProgress] = useState(0);
  const [qrCodeVal, setQrCodeVal] = useState("");
  const [qrExpiry, setQrExpiry] = useState<string | null>(null);

  const facialIssueForm = useForm<IssueReportFormValues>({
    resolver: zodResolver(issueReportSchema),
    defaultValues: { issueDescription: "" }
  });

  const qrIssueForm = useForm<IssueReportFormValues>({
    resolver: zodResolver(issueReportSchema),
    defaultValues: { issueDescription: "" }
  });

  useEffect(() => {
    setIsFaceEnrolled(localStorage.getItem("plpass-face-enrolled") === "true");
    setQrCodeVal(localStorage.getItem("plpass-qr-code-val") ?? "");
    setQrExpiry(localStorage.getItem("plpass-qr-expiry"));
  }, []);

  const enrolledDate = localStorage.getItem("plpass-face-enrolled-date");
  const qrStatus = qrCodeVal ? "Active" : "Not generated";
  const verificationReady = useMemo(() => {
    return [isFaceEnrolled, Boolean(qrCodeVal)].filter(Boolean).length;
  }, [isFaceEnrolled, qrCodeVal]);

  if (scope.isLoading) {
    return <LoadingState label="Loading verification methods" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in mock account does not have a student profile fixture." />;
  }

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

  function handleRemoveFace() {
    setIsFaceEnrolled(false);
    localStorage.removeItem("plpass-face-enrolled");
    localStorage.removeItem("plpass-face-enrolled-date");
    toast.info("Facial enrollment removed.");
  }

  function handleGenerateQr() {
    const nextToken = buildQrToken(scope.student);
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    setQrCodeVal(nextToken);
    setQrExpiry(expiry);
    localStorage.setItem("plpass-qr-generated", "true");
    localStorage.setItem("plpass-qr-code-val", nextToken);
    localStorage.setItem("plpass-qr-expiry", expiry);
    toast.success("QR token generated.");
  }

  function handleFacialIssueSubmit() {
    toast.success("Facial verification issue submitted.");
    facialIssueForm.reset();
  }

  function handleQrIssueSubmit() {
    toast.success("QR scanning issue submitted.");
    qrIssueForm.reset();
  }

  return (
    <div className="space-y-6 p-1">
      <PageHeader
        eyebrow="Verification Setup"
        title="Verification Methods"
        description="Set up the two attendance verification methods supported by the current PLPass plan: facial recognition and QR code."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Ready Methods" value={`${verificationReady}/2`} icon={ShieldCheck} tone={verificationReady === 2 ? "success" : "warning"} />
        <StatCard title="Facial Status" value={isFaceEnrolled ? "Enrolled" : "Not enrolled"} icon={Camera} tone={isFaceEnrolled ? "success" : "warning"} />
        <StatCard title="QR Status" value={qrStatus} icon={QrCode} tone={qrCodeVal ? "success" : "warning"} />
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveTab("facial")}
          className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${activeTab === "facial" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          <Camera className="h-4 w-4" />
          Facial Recognition
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("qr")}
          className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${activeTab === "qr" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
        >
          <QrCode className="h-4 w-4" />
          QR Code
        </button>
      </div>

      {activeTab === "facial" ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-lg border bg-surface p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Facial Recognition Enrollment</h2>
                <p className="mt-1 text-sm text-muted-foreground">Used for hands-free event check-in when the organizer enables facial verification.</p>
              </div>
              {isFaceEnrolled ? (
                <Button type="button" variant="outline" onClick={handleRemoveFace}>Remove enrollment</Button>
              ) : (
                <Button type="button" disabled={isEnrollingFace} onClick={handleEnrollFace}>
                  {isEnrollingFace ? "Enrolling..." : "Start enrollment"}
                </Button>
              )}
            </div>

            <div className="mt-6 rounded-lg border bg-background p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {isFaceEnrolled ? <CheckCircle2 className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
                </div>
                <div>
                  <p className="font-semibold">{isFaceEnrolled ? "Enrollment active" : "Enrollment required"}</p>
                  <p className="text-sm text-muted-foreground">
                    {isFaceEnrolled && enrolledDate ? `Registered ${formatDisplayDate(enrolledDate)}` : "Complete enrollment before using facial check-in."}
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
              ) : null}
            </div>
          </div>

          <form onSubmit={facialIssueForm.handleSubmit(handleFacialIssueSubmit)} className="rounded-lg border bg-surface p-6">
            <h2 className="text-lg font-semibold">Report Facial Issue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use this if the event camera cannot verify you.</p>
            <textarea
              {...facialIssueForm.register("issueDescription")}
              className="plpass-field mt-4 min-h-32 w-full rounded-md border p-3 text-sm"
              placeholder="Describe the venue, time, and what happened."
            />
            {facialIssueForm.formState.errors.issueDescription ? (
              <p className="mt-2 text-sm text-danger">{facialIssueForm.formState.errors.issueDescription.message}</p>
            ) : null}
            <Button type="submit" className="mt-4 w-full">Submit issue</Button>
          </form>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-lg border bg-surface p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">QR Code Verification</h2>
                <p className="mt-1 text-sm text-muted-foreground">Generate a secure QR token for event check-in when QR verification is enabled.</p>
              </div>
              <Button type="button" onClick={handleGenerateQr}>
                {qrCodeVal ? <RefreshCw className="mr-2 h-4 w-4" /> : <QrCode className="mr-2 h-4 w-4" />}
                {qrCodeVal ? "Regenerate" : "Generate QR"}
              </Button>
            </div>

            <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border bg-background p-6 text-center">
              <div className="relative flex h-44 w-44 items-center justify-center rounded-lg border bg-card shadow-sm">
                <div className="absolute inset-4 opacity-20 [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:12px_12px]" />
                <div className="absolute left-5 top-5 h-10 w-10 rounded border-4 border-foreground" />
                <div className="absolute right-5 top-5 h-10 w-10 rounded border-4 border-foreground" />
                <div className="absolute bottom-5 left-5 h-10 w-10 rounded border-4 border-foreground" />
                <QrCode className="relative h-16 w-16 text-primary" />
              </div>
              <div>
                <p className="font-mono text-sm font-semibold">{qrCodeVal || "No QR token generated"}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {qrExpiry ? `Valid until ${formatDisplayDate(qrExpiry)}` : "Generate a token before check-in."}
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={qrIssueForm.handleSubmit(handleQrIssueSubmit)} className="rounded-lg border bg-surface p-6">
            <h2 className="text-lg font-semibold">Report QR Issue</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use this if an event scanner cannot read your QR code.</p>
            <textarea
              {...qrIssueForm.register("issueDescription")}
              className="plpass-field mt-4 min-h-32 w-full rounded-md border p-3 text-sm"
              placeholder="Describe the scanner location, event, and error."
            />
            {qrIssueForm.formState.errors.issueDescription ? (
              <p className="mt-2 text-sm text-danger">{qrIssueForm.formState.errors.issueDescription.message}</p>
            ) : null}
            <Button type="submit" className="mt-4 w-full">Submit issue</Button>
          </form>
        </section>
      )}
    </div>
  );
}
