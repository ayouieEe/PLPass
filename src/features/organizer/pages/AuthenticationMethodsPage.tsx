/* eslint-disable @typescript-eslint/no-unused-vars */
import { Camera, FileDown, QrCode, RefreshCw, ScanLine, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";

type FacialStatus = "Activated" | "Damaged" | "Inactive";
type QRStatus = "Active" | "Expired" | "Disabled";
type ActiveTab = "facial" | "qr";

type QrRow = {
  studentId: string;
  studentName: string;
  status: QRStatus;
  dateGenerated: string;
  lastUsed: string;
};

type FacialRow = {
  studentId: string;
  studentName: string;
  enrollmentDate: string;
  status: FacialStatus;
  lastScan: string;
};

const USER_MANAGEMENT_STUDENTS: Array<{ id: string; name: string; qrStatus: string; facialStatus: string }> = [
  { id: "2023-00001", name: "John Doe", qrStatus: "Ready", facialStatus: "Ready" },
  { id: "2023-00002", name: "Jane Smith", qrStatus: "Needs Review", facialStatus: "Needs Review" }
];

type RegenerationRequest = {
  id: string;
  studentName: string;
  dateRequested: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
};

function facialTone(status: FacialStatus) {
  if (status === "Activated") {
    return "success" as const;
  }
  if (status === "Inactive") {
    return "warning" as const;
  }
  return "danger" as const;
}

function qrTone(status: QRStatus) {
  if (status === "Active") {
    return "success" as const;
  }
  if (status === "Disabled") {
    return "danger" as const;
  }
  return "warning" as const;
}

export function AuthenticationMethodsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("qr");
  const [activeModal, setActiveModal] = useState<null | { type: "qr" | "facial" | "request"; title: string; description: string; confirmLabel: string; cancelLabel?: string; tone?: "default" | "danger"; studentName?: string; requestId?: string }>(null);
  const [qrRows, setQrRows] = useState<QrRow[]>(() =>
    USER_MANAGEMENT_STUDENTS.map((student) => ({
      studentId: student.id,
      studentName: student.name,
      status: student.qrStatus === "Ready" ? "Active" : student.qrStatus === "Needs Review" ? "Expired" : "Disabled",
      dateGenerated: student.qrStatus === "Ready" ? "2026-07-01" : student.qrStatus === "Needs Review" ? "2026-06-20" : "2026-07-03",
      lastUsed: student.qrStatus === "Ready" ? "2026-07-04" : student.qrStatus === "Needs Review" ? "2026-06-22" : "-"
    }))
  );
  const [facialRows, setFacialRows] = useState<FacialRow[]>(() =>
    USER_MANAGEMENT_STUDENTS.map((student) => ({
      studentId: student.id,
      studentName: student.name,
      enrollmentDate: student.facialStatus === "Ready" ? "2026-06-15" : student.facialStatus === "Needs Review" ? "2026-06-24" : "-",
      status: student.facialStatus === "Ready" ? "Activated" : student.facialStatus === "Needs Review" ? "Damaged" : "Inactive",
      lastScan: student.facialStatus === "Ready" ? "2026-07-04" : student.facialStatus === "Needs Review" ? "2026-06-30" : "-"
    }))
  );
  const [regenerationRequests, setRegenerationRequests] = useState<RegenerationRequest[]>([]);
  const facialStatuses: Array<{ label: FacialStatus; detail: string }> = [
    { label: "Activated", detail: "Student can use facial recognition for check-in." },
    { label: "Damaged", detail: "Face template is corrupted and needs re-enrollment." },
    { label: "Inactive", detail: "Student has not enrolled or access has been disabled." }
  ];

  function exportQrReport() {
    toast.success("QR credential report exported.");
  }

  function exportFacialReport() {
    toast.success("Facial enrollment report exported.");
  }

  function exportQrRegenerationReport() {
    toast.success("QR regeneration report exported.");
  }

  function exportFacialStatusReport() {
    toast.success("Facial status report exported.");
  }

  function handleViewQr(studentName: string) {
    setActiveModal({
      type: "qr",
      title: "QR credential details",
      description: `Review the current QR credential for ${studentName}.`,
      confirmLabel: "Close",
      studentName
    });
  }

  function handleRegenerateQr(studentName: string) {
    setActiveModal({
      type: "qr",
      title: "Regenerate QR credential",
      description: `This preview action will issue a fresh QR credential for ${studentName}.`,
      confirmLabel: "Confirm regeneration",
      cancelLabel: "Cancel",
      studentName
    });
  }

  function handleDisableQr(studentName: string) {
    setActiveModal({
      type: "qr",
      title: "Are you sure?",
      description: `Temporarily disable the QR credential for ${studentName}? This action can be reversed later.`,
      confirmLabel: "Disable credential",
      cancelLabel: "Cancel",
      tone: "danger",
      studentName
    });
  }

  function handleApproveRequest(requestId: string) {
    setActiveModal({
      type: "request",
      title: "Are you sure?",
      description: `Approve the pending request ${requestId}? This review flow updates the request status.`,
      confirmLabel: "Approve request",
      cancelLabel: "Cancel",
      requestId
    });
  }

  function handleViewFacial(studentName: string) {
    setActiveModal({
      type: "facial",
      title: "Facial enrollment details",
      description: `Review the current facial enrollment for ${studentName}.`,
      confirmLabel: "Close",
      studentName
    });
  }

  function handleReEnrollFacial(studentName: string) {
    setActiveModal({
      type: "facial",
      title: "Re-enroll facial credential",
      description: `Start a fresh facial enrollment flow for ${studentName}.`,
      confirmLabel: "Start re-enrollment",
      cancelLabel: "Cancel",
      studentName
    });
  }

  function handleDeactivateFacial(studentName: string) {
    setActiveModal({
      type: "facial",
      title: "Are you sure?",
      description: `Deactivate the facial recognition credential for ${studentName}? This will block future facial check-ins.`,
      confirmLabel: "Deactivate",
      cancelLabel: "Cancel",
      tone: "danger",
      studentName
    });
  }

  function confirmModalAction() {
    if (!activeModal) {
      return;
    }

    if (activeModal.type === "qr" && activeModal.studentName) {
      if (activeModal.title.includes("Regenerate")) {
        setQrRows((current) =>
          current.map((row) => (row.studentName === activeModal.studentName ? { ...row, status: "Active", dateGenerated: new Date().toISOString().slice(0, 10), lastUsed: "-" } : row))
        );
        toast.success(`QR credential regenerated for ${activeModal.studentName}.`);
      } else if (activeModal.title.includes("Disable")) {
        setQrRows((current) => current.map((row) => (row.studentName === activeModal.studentName ? { ...row, status: "Disabled", lastUsed: "-" } : row)));
        toast.success(`QR credential disabled for ${activeModal.studentName}.`);
      } else {
        toast.success(`QR credential for ${activeModal.studentName} opened.`);
      }
    }

    if (activeModal.type === "facial" && activeModal.studentName) {
      if (activeModal.title.includes("Re-enroll")) {
        setFacialRows((current) => current.map((row) => (row.studentName === activeModal.studentName ? { ...row, status: "Activated", enrollmentDate: new Date().toISOString().slice(0, 10), lastScan: "-" } : row)));
        toast.success(`Facial enrollment re-initiated for ${activeModal.studentName}.`);
      } else if (activeModal.title.includes("Deactivate")) {
        setFacialRows((current) => current.map((row) => (row.studentName === activeModal.studentName ? { ...row, status: "Inactive", lastScan: "-" } : row)));
        toast.success(`Facial enrollment deactivated for ${activeModal.studentName}.`);
      } else {
        toast.success(`Facial enrollment for ${activeModal.studentName} opened.`);
      }
    }

    if (activeModal.type === "request" && activeModal.requestId) {
      setRegenerationRequests((current) => current.map((request) => (request.id === activeModal.requestId ? { ...request, status: "Approved" } : request)));
      toast.success(`Request ${activeModal.requestId} approved.`);
    }

    setActiveModal(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Authentication Methods"
        description="Manage and monitor the two authentication credentials students use for event check-ins."
      />

      <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveTab("qr")}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-sm ${activeTab === "qr" ? "bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <QrCode className="h-4 w-4" />
          QR Code
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("facial")}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold shadow-sm ${activeTab === "facial" ? "bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}
        >
          <Camera className="h-4 w-4" />
          Facial Recognition
        </button>
      </div>

      <ConfirmModal
        open={Boolean(activeModal)}
        title={activeModal?.title ?? "Action"}
        description={activeModal?.description}
        confirmLabel={activeModal?.confirmLabel}
        cancelLabel={activeModal?.cancelLabel}
        tone={activeModal?.tone}
        onConfirm={confirmModalAction}
        onCancel={() => setActiveModal(null)}
      >
        {activeModal?.type === "qr" && activeModal.studentName ? (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">QR credential preview</p>
              <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                {activeModal.title.includes("Regenerate") ? "New credential" : "Current credential"}
              </span>
            </div>
            <div className="rounded-md border border-dashed border-border bg-background p-3">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <QrCode className="h-12 w-12" />
              </div>
              <div className="mt-3 space-y-1 text-center">
                <p className="font-semibold text-foreground">{activeModal.studentName}</p>
                <p>QR status: {activeModal.title.includes("Regenerate") ? "Pending refresh" : "Active"}</p>
                <p>Issued: 2026-07-10</p>
              </div>
            </div>
            <p>
              {activeModal.title.includes("Regenerate")
                ? "A fresh QR code will be generated and assigned to this student for the next event." 
                : "This preview shows the student’s current QR credential details before attendance check-in."}
            </p>
          </div>
        ) : null}

        {activeModal?.type === "facial" && activeModal.studentName ? (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <p className="font-medium text-foreground">Facial profile preview</p>
              <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                {activeModal.title.includes("Re-enroll") ? "Enrollment refresh" : "Current profile"}
              </span>
            </div>
            <div className="rounded-md border border-dashed border-border bg-background p-3">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-10 w-10" />
              </div>
              <div className="mt-3 space-y-1 text-center">
                <p className="font-semibold text-foreground">{activeModal.studentName}</p>
                <p>Last verified: 2026-07-10</p>
                <p>Status: {activeModal.title.includes("Re-enroll") ? "Re-enrollment requested" : "Active"}</p>
              </div>
            </div>
            <p>
              {activeModal.title.includes("Re-enroll")
                ? "A fresh facial profile will be captured and linked to the student’s account for future check-ins."
                : "This preview shows the stored facial profile and recent verification activity for the student."}
            </p>
          </div>
        ) : null}

        {activeModal?.type === "request" ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Request review</p>
            <p className="mt-1">The request will be approved and reflected in the organizer review queue.</p>
          </div>
        ) : null}
      </ConfirmModal>

      {activeTab === "qr" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Total QR Credentials</p>
              <p className="mt-2 text-2xl font-semibold">{qrRows.length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Active QR Credentials</p>
              <p className="mt-2 text-2xl font-semibold">{qrRows.filter((row) => row.status === "Active").length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Pending Regeneration Requests</p>
              <p className="mt-2 text-2xl font-semibold">{regenerationRequests.filter((row) => row.status === "Pending").length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Disabled QR Credentials</p>
              <p className="mt-2 text-2xl font-semibold">{qrRows.filter((row) => row.status === "Disabled").length}</p>
            </div>
          </div>

          <section className="rounded-lg border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Student QR Credentials</h2>
                <p className="mt-1 text-sm text-muted-foreground">Manage student QR credentials used for authentication.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">XLSX / PDF</span>
                <Button type="button" variant="outline" onClick={exportQrReport}><FileDown className="mr-2 h-4 w-4" />QR Credential Report</Button>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">Student Name</th>
                    <th className="px-3 py-2">QR Status</th>
                    <th className="px-3 py-2">Date Generated</th>
                    <th className="px-3 py-2">Last Used</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {qrRows.map((row) => (
                    <tr key={row.studentId} className="border-t">
                      <td className="px-3 py-2">{row.studentId}</td>
                      <td className="px-3 py-2">{row.studentName}</td>
                      <td className="px-3 py-2"><StatusBadge label={row.status} tone={qrTone(row.status)} /></td>
                      <td className="px-3 py-2">{row.dateGenerated}</td>
                      <td className="px-3 py-2">{row.lastUsed}</td>
                      <td className="px-3 py-2">
                        <div className="rounded-lg border border-border/80 bg-muted/40 p-2 shadow-sm">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" className="border-border bg-background shadow-sm" onClick={() => handleViewQr(row.studentName)}><ScanLine className="mr-2 h-4 w-4" />View QR</Button>
                            <Button type="button" variant="secondary" size="sm" className="shadow-sm" onClick={() => handleRegenerateQr(row.studentName)}><RefreshCw className="mr-2 h-4 w-4" />Regenerate</Button>
                            <Button type="button" variant="destructive" size="sm" className="shadow-sm" onClick={() => handleDisableQr(row.studentName)}>Disable</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">QR Regeneration Requests</h2>
                <p className="mt-1 text-sm text-muted-foreground">Students can request new QR credentials when their code is not working.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">XLSX / PDF</span>
                <Button type="button" variant="outline" onClick={exportQrRegenerationReport}><FileDown className="mr-2 h-4 w-4" />QR Regenerate Report</Button>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Request ID</th>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Date Requested</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {regenerationRequests.map((request) => (
                    <tr key={request.id} className="border-t">
                      <td className="px-3 py-2">{request.id}</td>
                      <td className="px-3 py-2">{request.studentName}</td>
                      <td className="px-3 py-2">{request.dateRequested}</td>
                      <td className="px-3 py-2">{request.reason}</td>
                      <td className="px-3 py-2"><StatusBadge label={request.status} tone={request.status === "Approved" ? "success" : request.status === "Rejected" ? "danger" : "warning"} /></td>
                      <td className="px-3 py-2">
                        <Button type="button" size="sm" onClick={() => handleApproveRequest(request.id)} disabled={request.status === "Approved"}>Approve</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Total Enrolled</p>
              <p className="mt-2 text-2xl font-semibold">{facialRows.length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Activated</p>
              <p className="mt-2 text-2xl font-semibold">{facialRows.filter((row) => row.status === "Activated").length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Damaged</p>
              <p className="mt-2 text-2xl font-semibold">{facialRows.filter((row) => row.status === "Damaged").length}</p>
            </div>
            <div className="rounded-lg border bg-surface p-4">
              <p className="text-sm text-muted-foreground">Inactive</p>
              <p className="mt-2 text-2xl font-semibold">{facialRows.filter((row) => row.status === "Inactive").length}</p>
            </div>
          </div>

          <section className="rounded-lg border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Facial Enrollment Records</h2>
                <p className="mt-1 text-sm text-muted-foreground">Monitor facial enrollment status and manage credential issues.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">XLSX / PDF</span>
                <Button type="button" variant="outline" onClick={exportFacialReport}><FileDown className="mr-2 h-4 w-4" />Facial Enrollment Report</Button>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">Student Name</th>
                    <th className="px-3 py-2">Enrollment Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Last Scan</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {facialRows.map((row) => (
                    <tr key={row.studentId} className="border-t">
                      <td className="px-3 py-2">{row.studentId}</td>
                      <td className="px-3 py-2">{row.studentName}</td>
                      <td className="px-3 py-2">{row.enrollmentDate}</td>
                      <td className="px-3 py-2"><StatusBadge label={row.status} tone={facialTone(row.status)} /></td>
                      <td className="px-3 py-2">{row.lastScan}</td>
                      <td className="px-3 py-2">
                        <div className="rounded-lg border border-border/80 bg-muted/40 p-2 shadow-sm">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" className="border-border bg-background shadow-sm" onClick={() => handleViewFacial(row.studentName)}><UserRound className="mr-2 h-4 w-4" />View</Button>
                            <Button type="button" variant="secondary" size="sm" className="shadow-sm" onClick={() => handleReEnrollFacial(row.studentName)}><RefreshCw className="mr-2 h-4 w-4" />Re-enroll</Button>
                            <Button type="button" variant="destructive" size="sm" className="shadow-sm" onClick={() => handleDeactivateFacial(row.studentName)}>Deactivate</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Enrollment Requests</h2>
                <p className="mt-1 text-sm text-muted-foreground">Review student-reported facial enrollment issues and re-enrollment requests.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium uppercase text-muted-foreground">XLSX / PDF</span>
                <Button type="button" variant="outline" onClick={exportFacialStatusReport}><FileDown className="mr-2 h-4 w-4" />Facial Status Report</Button>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border bg-background">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left">
                  <tr>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Issue</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="px-3 py-2">Kaye Rivera</td>
                    <td className="px-3 py-2">Camera cannot recognize face</td>
                    <td className="px-3 py-2">2026-07-07</td>
                    <td className="px-3 py-2"><StatusBadge label="Pending" tone="warning" /></td>
                    <td className="px-3 py-2"><Button type="button" size="sm" onClick={() => toast.success("Re-enrollment request approved.")}>Approve</Button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
