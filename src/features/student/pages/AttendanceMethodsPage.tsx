import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { ColDef } from "ag-grid-community";
import {
  Nfc,
  UserCheck,
  QrCode,
  ShieldCheck,
  History,
  Camera,
  RefreshCw,
  Clock,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useStudents,
  useNfcCredentialForStudent,
  useNfcTapAttempts,
  useAttendanceSessions,
  useNfcCredentialRequests
} from "@/hooks/useRepositoryQueries";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { Student } from "@/types/domain";

type StudentScope = {
  context: RepositoryContext;
  student?: Student;
  studentName: string;
  isLoading: boolean;
  isError: boolean;
};

type NfcTapHistoryRow = {
  id: string;
  dateTime: string;
  sessionTitle: string;
  status: "Accepted" | "Rejected";
  message: string;
};

const nfcRequestSchema = z.object({
  type: z.enum(["lost", "damaged", "replacement"]),
  reason: z.string().min(10, "Reason must be at least 10 characters.")
});

const issueReportSchema = z.object({
  issueDescription: z.string().min(10, "Explanation must be at least 10 characters.")
});

type NfcRequestFormValues = z.infer<typeof nfcRequestSchema>;
type IssueReportFormValues = z.infer<typeof issueReportSchema>;

const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

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

function maskCredential(value: string | undefined) {
  if (!value) return "Not available";
  return `${value.slice(0, 3)}-${"*".repeat(Math.max(value.length - 6, 4))}-${value.slice(-3)}`;
}

export function AttendanceMethodsPage() {
  const scope = useStudentScope();
  const [activeTab, setActiveTab] = useState<"nfc" | "facial" | "qr">("nfc");
  const [isFaceEnrolled, setIsFaceEnrolled] = useState(false);
  const [isEnrollingFace, setIsEnrollingFace] = useState(false);
  const [enrollProgress, setEnrollProgress] = useState(0);
  const [isQrGenerated, setIsQrGenerated] = useState(false);
  const [qrCodeVal, setQrCodeVal] = useState("");
  const [qrExpiry, setQrExpiry] = useState<string | null>(null);

  // Sync state with localStorage
  useEffect(() => {
    setIsFaceEnrolled(localStorage.getItem("plpass-face-enrolled") === "true");
    setIsQrGenerated(localStorage.getItem("plpass-qr-generated") === "true");
    const storedQr = localStorage.getItem("plpass-qr-code-val");
    if (storedQr) {
      setQrCodeVal(storedQr);
      setQrExpiry(localStorage.getItem("plpass-qr-expiry"));
    }
  }, []);

  const credentialQuery = useNfcCredentialForStudent(scope.student?.id, scope.context);
  const tapsQuery = useNfcTapAttempts({ pageSize: 50 }, scope.context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 50 }, scope.context);
  const requestsQuery = useNfcCredentialRequests({ pageSize: 50 }, scope.context);

  const nfcForm = useForm<NfcRequestFormValues>({
    resolver: zodResolver(nfcRequestSchema),
    defaultValues: { type: "lost", reason: "" }
  });

  const facialIssueForm = useForm<IssueReportFormValues>({
    resolver: zodResolver(issueReportSchema),
    defaultValues: { issueDescription: "" }
  });

  const qrIssueForm = useForm<IssueReportFormValues>({
    resolver: zodResolver(issueReportSchema),
    defaultValues: { issueDescription: "" }
  });

  if (scope.isLoading) {
    return <LoadingState label="Loading student workspace" />;
  }

  if (scope.isError || !scope.student) {
    return <ErrorState title="Student profile unavailable" message="The signed-in mock account does not have a student profile fixture." />;
  }

  if (credentialQuery.isLoading || tapsQuery.isLoading || requestsQuery.isLoading) {
    return <LoadingState label="Loading attendance methods" />;
  }

  // NFC Submit lost/damaged
  async function handleNfcSubmit(values: NfcRequestFormValues) {
    try {
      await requestsQuery.createMutation.mutateAsync({
        studentId: scope.student?.id ?? "",
        credentialId: credentialQuery.data?.id,
        ...values
      });
      toast.success("NFC replacement request submitted successfully.");
      nfcForm.reset({ type: "lost", reason: "" });
    } catch {
      toast.error("Failed to submit request.");
    }
  }

  // Facial enrollment simulate
  function handleEnrollFace() {
    setIsEnrollingFace(true);
    setEnrollProgress(0);
    const interval = setInterval(() => {
      setEnrollProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsEnrollingFace(false);
            setIsFaceEnrolled(true);
            localStorage.setItem("plpass-face-enrolled", "true");
            localStorage.setItem("plpass-face-enrolled-date", new Date().toISOString());
            toast.success("Facial registration complete!");
          }, 500);
          return 100;
        }
        return prev + 20;
      });
    }, 200);
  }

  function handleUnenrollFace() {
    setIsFaceEnrolled(false);
    localStorage.removeItem("plpass-face-enrolled");
    localStorage.removeItem("plpass-face-enrolled-date");
    toast.info("Facial biometrics removed.");
  }

  // Submit facial issues report
  function handleFacialIssueSubmit() {
    toast.success("Issue report submitted to admin.");
    facialIssueForm.reset();
  }

  // QR code generate simulate
  function handleGenerateQr() {
    const randomId = `PLPASS-QR-${Math.floor(100000 + Math.random() * 900000)}`;
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    setQrCodeVal(randomId);
    setQrExpiry(expiry);
    setIsQrGenerated(true);
    localStorage.setItem("plpass-qr-generated", "true");
    localStorage.setItem("plpass-qr-code-val", randomId);
    localStorage.setItem("plpass-qr-expiry", expiry);
    toast.success("Secure QR code generated and saved!");
  }

  function handleRegenerateQr() {
    handleGenerateQr();
  }

  // Submit QR issue report
  function handleQrIssueSubmit() {
    toast.success("Issue report submitted to admin.");
    qrIssueForm.reset();
  }

  const enrolledDate = localStorage.getItem("plpass-face-enrolled-date");
  const nfcTapRows: NfcTapHistoryRow[] = (tapsQuery.data?.items ?? []).map((tap) => {
    const session = sessionsQuery.data?.items.find((entry) => entry.id === tap.sessionId);
    return {
      id: tap.id,
      dateTime: `${dateFormatter.format(new Date(tap.attemptedAt))} ${timeFormatter.format(new Date(tap.attemptedAt))}`,
      sessionTitle: session?.title ?? "NFC Reader Tap",
      status: tap.accepted ? "Accepted" : "Rejected",
      message: tap.message || "Tapped at reader"
    };
  });

  const nfcTapColumns: ColDef<NfcTapHistoryRow>[] = [
    { field: "dateTime", headerName: "Date & Time", minWidth: 190 },
    { field: "sessionTitle", headerName: "Session / Class", minWidth: 210 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 140,
      cellRenderer: ({ data }: { data?: NfcTapHistoryRow }) =>
        data ? <StatusBadge label={data.status} tone={data.status === "Accepted" ? "success" : "danger"} /> : null
    },
    { field: "message", headerName: "Message / Note", minWidth: 220 }
  ];

  return (
    <div className="space-y-8 p-1">
      <PageHeader
        eyebrow="Verification Setup"
        title="NFC Credential"
        description="Configure your active verification tokens, view live scan instructions, and manage credentials."
      />

      {/* Tabs Selector Navigation */}
      <div className="grid grid-cols-3 gap-2 rounded-[24px] border border-white/40 bg-white/50 p-2 shadow-sm backdrop-blur-md">
        <button
          onClick={() => setActiveTab("nfc")}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all duration-300 ${
            activeTab === "nfc"
              ? "bg-[#C3E956] text-[#1F4B2C] shadow-sm"
              : "text-slate-500 hover:bg-white/40 hover:text-[#4F5654]"
          }`}
        >
          <Nfc className="h-4 w-4" />
          <span>NFC Sticker</span>
        </button>
        <button
          onClick={() => setActiveTab("facial")}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all duration-300 ${
            activeTab === "facial"
              ? "bg-[#C3E956] text-[#1F4B2C] shadow-sm"
              : "text-slate-500 hover:bg-white/40 hover:text-[#4F5654]"
          }`}
        >
          <UserCheck className="h-4 w-4" />
          <span>Facial Reco</span>
        </button>
        <button
          onClick={() => setActiveTab("qr")}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-all duration-300 ${
            activeTab === "qr"
              ? "bg-[#C3E956] text-[#1F4B2C] shadow-sm"
              : "text-slate-500 hover:bg-white/40 hover:text-[#4F5654]"
          }`}
        >
          <QrCode className="h-4 w-4" />
          <span>Secure QR Code</span>
        </button>
      </div>

      {/* NFC TAB PANEL */}
      {activeTab === "nfc" && (
        <div className="space-y-6">
          {/* KPI NFC Status */}
          <div className="grid gap-6 md:grid-cols-3">
            <StatCard
              className="student-glass-card border-none hover:shadow-lg"
              title="Credential Status"
              value={credentialQuery.data?.status ?? "Not Available"}
              icon={Nfc}
              tone={credentialQuery.data?.status === "activated" ? "success" : "warning"}
            />
            <StatCard
              className="student-glass-card border-none hover:shadow-lg"
              title="Masked Identifier"
              value={maskCredential(credentialQuery.data?.nfcUid)}
              icon={ShieldCheck}
            />
            <StatCard
              className="student-glass-card border-none hover:shadow-lg"
              title="Date Issued"
              value={credentialQuery.data?.issuedAt ? dateFormatter.format(new Date(credentialQuery.data.issuedAt)) : "N/A"}
              icon={Clock}
            />
          </div>

          {/* Instructions */}
          <div className="student-glass-card p-6 space-y-3">
            <h3 className="font-semibold text-[#4F5654] flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#4D7117]" />
              NFC Usage Instructions
            </h3>
            <ul className="list-decimal pl-5 text-sm space-y-2 text-slate-600 leading-relaxed">
              <li>Keep the physical PLPass NFC sticker attached securely to the back of your school ID card.</li>
              <li>When entering classes or event venues, tap your ID against the wall-mounted NFC reader.</li>
              <li>Wait for the reader to beep once and display a solid green indicator before entering.</li>
              <li>If you lose your sticker or it fails to register, report the issue immediately using the form below.</li>
            </ul>
          </div>

          {/* Report Form */}
          <form onSubmit={nfcForm.handleSubmit(handleNfcSubmit)} className="student-glass-card p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-[#4F5654]">Report NFC Sticker Issues</h3>
              <p className="text-xs text-[#B9C1BF] mt-0.5">Submit request for lost or damaged sticker replacements.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#4F5654]">Report Type</label>
                <select
                  {...nfcForm.register("type")}
                  className="student-input h-10 w-full px-3 text-sm focus:outline-none"
                >
                  <option value="lost">Lost Sticker</option>
                  <option value="damaged">Damaged/Scratched Sticker</option>
                  <option value="replacement">Request General Replacement</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#4F5654] mb-1.5 block">Detailed Explanation</label>
                <textarea
                  {...nfcForm.register("reason")}
                  placeholder="Explain what happened to your sticker (e.g. peel off, lost card)..."
                  className="student-input w-full min-h-[80px] p-3 text-sm focus:outline-none"
                />
                {nfcForm.formState.errors.reason && (
                  <p className="text-xs text-rose-500 mt-1">{nfcForm.formState.errors.reason.message}</p>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-[#B9C1BF]">Requests are reviewed by admin within 24-48 hours.</span>
              <Button type="submit" disabled={requestsQuery.createMutation.isPending} className="student-btn-primary px-6">
                {requestsQuery.createMutation.isPending ? "Submitting..." : "Submit NFC issue request"}
              </Button>
            </div>
          </form>

          {/* Tap History */}
          <div className="student-glass-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#4D7117]" />
              <h3 className="font-semibold text-[#4F5654]">NFC Tap History (Recent)</h3>
            </div>
            <PLPassDataGrid
              data={nfcTapRows}
              columns={nfcTapColumns}
              label="NFC tap history"
              emptyTitle="No tap attempts logged on this account"
              enableQuickFilter={false}
              enableColumnVisibility={false}
            />
          </div>

          {/* Next Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setActiveTab("facial")} className="student-btn-primary px-6 gap-2">
              <span>Next: Facial Recognition Setup</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* FACIAL RECOGNITION TAB PANEL */}
      {activeTab === "facial" && (
        <div className="space-y-6">
          {!isFaceEnrolled ? (
            /* Enrollment View */
            <div className="grid gap-6 md:grid-cols-2">
              <div className="student-glass-card p-6 space-y-4">
                <h3 className="font-semibold text-[#4F5654] flex items-center gap-2">
                  <Camera className="h-5 w-5 text-[#4D7117]" />
                  Facial Recognition Enrollment
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  PLPass utilizes high-precision local facial biometrics for hands-free verification in supported classrooms.
                </p>

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#4D7117]">Guidelines</h4>
                  <ul className="list-disc pl-5 text-xs text-slate-500 space-y-2">
                    <li>Ensure you are in a well-lit area with neutral background light.</li>
                    <li>Look straight into the camera frame during the scanner process.</li>
                    <li>Avoid hats, hoods, or sunglasses. Normal prescription glasses are okay.</li>
                    <li>Your biometric markers are processed and saved securely inside a sandboxed module.</li>
                  </ul>
                </div>

                <div className="pt-4">
                  <Button onClick={handleEnrollFace} disabled={isEnrollingFace} className="student-btn-primary w-full py-6 text-base font-semibold shadow-lg">
                    {isEnrollingFace ? "Analyzing Scan Markers..." : "Start Biometric Enrollment"}
                  </Button>
                </div>
              </div>

              {/* Live camera scan visualizer mock */}
              <div className="rounded-[24px] border flex flex-col items-center justify-center p-6 min-h-[300px] relative overflow-hidden bg-gradient-to-br from-[#1F4B2C] via-emerald-950 to-slate-900 border-white/10 text-white shadow-xl">
                {isEnrollingFace ? (
                  <div className="text-center space-y-4 z-10">
                    {/* Face Wireframe pulsating */}
                    <div className="relative h-44 w-44 rounded-full border-4 border-dashed border-[#91EAAF] animate-spin flex items-center justify-center mx-auto">
                      <div className="absolute h-36 w-36 rounded-full border border-emerald-300 opacity-60 animate-pulse" />
                      <UserCheck className="h-16 w-16 text-emerald-400 animate-bounce" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold tracking-wider text-emerald-300">Biometric Scan Active</p>
                      <p className="text-xs text-slate-400 mt-1">Progress: {enrollProgress}%</p>
                    </div>
                    {/* Progress bar */}
                    <div className="w-64 bg-slate-800 rounded-full h-2.5 mx-auto">
                      <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-200" style={{ width: `${enrollProgress}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-3 z-10">
                    <div className="h-32 w-32 rounded-full border border-slate-700 bg-slate-900/50 flex items-center justify-center mx-auto shadow-inner">
                      <Camera className="h-12 w-12 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-300">Scan Module Offline</p>
                      <p className="text-xs text-slate-500 mt-1">Start enrollment to activate camera feed simulation.</p>
                    </div>
                  </div>
                )}
                {/* scanning laser beam mock */}
                {isEnrollingFace && (
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#C3E956] shadow-[0_0_15px_rgba(195,233,86,1)] animate-ping" />
                )}
              </div>
            </div>
          ) : (
            /* AFTER ENROLL VIEW */
            <div className="grid gap-6 md:grid-cols-2">
              {/* Credentials / Info */}
              <div className="student-glass-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#4F5654] flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-emerald-600" />
                    Facial Biometrics Enrolled
                  </h3>
                  <Button variant="outline" size="sm" onClick={handleUnenrollFace} className="student-btn-secondary border-rose-300 text-rose-600 hover:bg-rose-50 px-4 h-9">
                    Delete Data
                  </Button>
                </div>

                <div className="flex items-center gap-4 bg-emerald-50/20 border border-emerald-500/20 rounded-2xl p-4">
                  <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-[#4D7117] border border-emerald-400/50">
                    <Sparkles className="h-8 w-8 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-[#4F5654]">Status: Enrolled & Active</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Registered Date: {enrolledDate ? dateFormatter.format(new Date(enrolledDate)) : "Today"}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white/40 border-[#E8ECEB] p-4 space-y-2 text-xs text-slate-600">
                  <p className="font-semibold text-[#4F5654]">Active Verification Details</p>
                  <p>Biometric Hash: sha256-plpass-face-08ac3f91ae88b1</p>
                  <p>Devices Registered: Campus Gate Camera 03, Room 402 Gate Camera</p>
                  <p>Security Audit: Approved (Local Vault Storage encrypted with user token)</p>
                </div>
              </div>

              {/* Issues Form */}
              <form onSubmit={facialIssueForm.handleSubmit(handleFacialIssueSubmit)} className="student-glass-card p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-[#4F5654]">Report Face Recognition Issues</h3>
                  <p className="text-xs text-[#B9C1BF] mt-0.5">Let administrators know if gates or classrooms fail to detect your face.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#4F5654] mb-1.5 block">Describe the recognition issue</label>
                  <textarea
                    {...facialIssueForm.register("issueDescription")}
                    placeholder="Detail which classroom or reader failed, approximate time, and error messages shown..."
                    className="student-input w-full min-h-[110px] p-3 text-sm focus:outline-none"
                  />
                  {facialIssueForm.formState.errors.issueDescription && (
                    <p className="text-xs text-rose-500 mt-1">{facialIssueForm.formState.errors.issueDescription.message}</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button type="submit" className="student-btn-primary px-6">
                    Report Issue to Admin
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Next Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setActiveTab("qr")} className="student-btn-primary px-6 gap-2">
              <span>Next: Secure QR Setup</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* SECURE QR CODE TAB PANEL */}
      {activeTab === "qr" && (
        <div className="space-y-6">
          {!isQrGenerated ? (
            /* Generate View */
            <div className="student-glass-card p-8 space-y-6 max-w-xl mx-auto text-center">
              <div className="h-16 w-16 rounded-full bg-[#91EAAF]/20 flex items-center justify-center mx-auto text-[#4D7117]">
                <QrCode className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-[#4F5654]">Generate Secure Attendance QR</h3>
                <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
                  A dynamic, time-limited QR code you can present to professors or scanning terminals when physical ID stickers are unavailable.
                </p>
              </div>

              <div className="bg-white/40 border border-[#E8ECEB] rounded-2xl p-4 text-xs text-slate-500 max-w-md mx-auto text-left space-y-2">
                <p className="font-semibold text-[#4F5654]">QR Scan Notes</p>
                <p>• Generated QR includes encrypted student metadata matching your profile.</p>
                <p>• The code is valid on all standard terminal webcams.</p>
                <p>• QR regenerations immediately invalidate previous codes.</p>
              </div>

              <div className="pt-4">
                <Button onClick={handleGenerateQr} className="student-btn-primary px-8">
                  Generate Secure QR Code
                </Button>
              </div>
            </div>
          ) : (
            /* AFTER GENERATE VIEW */
            <div className="grid gap-6 md:grid-cols-2">
              {/* Credentials about QR */}
              <div className="student-glass-card p-6 text-center md:text-left flex flex-col md:flex-row gap-6 items-center">
                {/* Mock QR Code element */}
                <div className="shrink-0 bg-white p-4 border border-[#E8ECEB] rounded-2xl shadow-sm flex flex-col items-center">
                  <div className="h-36 w-36 bg-slate-900 rounded-xl relative flex items-center justify-center text-white text-xs font-semibold overflow-hidden">
                    {/* Diagonal grid cells to represent QR blocks */}
                    <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:10px_10px]" />
                    {/* Target boxes representing standard QR anchors */}
                    <div className="absolute top-2 left-2 h-7 w-7 border-2 border-white rounded" />
                    <div className="absolute top-2 right-2 h-7 w-7 border-2 border-white rounded" />
                    <div className="absolute bottom-2 left-2 h-7 w-7 border-2 border-white rounded" />
                    <QrCode className="h-12 w-12 text-[#91EAAF] animate-pulse" />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-2 tracking-widest">{qrCodeVal}</span>
                </div>

                <div className="space-y-3 flex-1">
                  <h3 className="font-semibold text-[#4F5654]">QR Verification Active</h3>
                  <div className="space-y-2 text-xs text-slate-600">
                    <p className="flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      Token Identity: Enrolled & Validated
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-primary" />
                      Valid until: {qrExpiry ? dateFormatter.format(new Date(qrExpiry)) : "N/A"}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRegenerateQr} className="student-btn-secondary px-4 gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Regenerate QR Token</span>
                  </Button>
                </div>
              </div>

              {/* QR Issue Form */}
              <form onSubmit={qrIssueForm.handleSubmit(handleQrIssueSubmit)} className="student-glass-card p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-[#4F5654]">Report QR Scanning Issues</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Report if scanner webcams fail to read your code at gate checks.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#4F5654] mb-1.5 block">Description of issue</label>
                  <textarea
                    {...qrIssueForm.register("issueDescription")}
                    placeholder="Detail reader location, date, and approximate scan time..."
                    className="student-input w-full min-h-[110px] p-3 text-sm focus:outline-none"
                  />
                  {qrIssueForm.formState.errors.issueDescription && (
                    <p className="text-xs text-rose-500 mt-1">{qrIssueForm.formState.errors.issueDescription.message}</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button type="submit" className="student-btn-primary px-6">
                    Report Issue to Admin
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
