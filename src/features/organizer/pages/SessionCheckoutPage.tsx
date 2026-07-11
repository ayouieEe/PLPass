import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { QRCheckoutPanel } from "@/features/attendance/QRCheckoutPanel";
import { ManualCheckoutPanel } from "@/features/attendance/ManualCheckoutPanel";
import { useAttendanceSession, useStudents, useEventParticipants, useEvent, useOrganizerProfiles } from "@/hooks/useRepositoryQueries";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import type { RepositoryContext } from "@/services/mock/mockRepositoryUtils";
import type { Student } from "@/types/domain";

function OrganizerFrame({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

type OrganizerScope = {
  context: RepositoryContext;
  organizerId?: string;
  organizerName: string;
  isLoading: boolean;
  isError: boolean;
};

function useOrganizerScope(): OrganizerScope {
  const { session } = useDevelopmentSession();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const organizerQuery = useOrganizerProfiles({ pageSize: 1 }, context);
  return {
    context: context ?? { actorUserId: "", actorRole: "organizer" },
    organizerId: organizerQuery.data?.items[0]?.id,
    organizerName: session?.displayName ?? "Organizer",
    isLoading: organizerQuery.isLoading,
    isError: organizerQuery.isError
  };
}

function formatDate(value: string | undefined) {
  return formatDisplayDate(value, "Not scheduled");
}

function formatTime(value: string | undefined) {
  return formatDisplayTime(value, "Not set");
}

function studentName(student: Student | undefined) {
  return student ? student.studentNumber : "Unknown student";
}

export function SessionCheckoutPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const scope = useOrganizerScope();
  
  const sessionQuery = useAttendanceSession(sessionId, scope.context);
  const studentsQuery = useStudents({ pageSize: 500 }, scope.context);
  const participantQuery = useEventParticipants(sessionQuery.data?.eventId ?? "", { pageSize: 500 }, scope.context);
  const eventQuery = useEvent(sessionQuery.data?.eventId ?? "", scope.context);

  const [checkoutQrEnabled, setCheckoutQrEnabled] = useState(false);
  const [checkoutManualStudentId, setCheckoutManualStudentId] = useState("");
  const [checkoutManualReason, setCheckoutManualReason] = useState("");
  const [checkoutManualRemarks, setCheckoutManualRemarks] = useState("");
  const [isCheckoutComplete, setIsCheckoutComplete] = useState(false);

  if (sessionQuery.isLoading || studentsQuery.isLoading || participantQuery.isLoading || eventQuery.isLoading) {
    return <OrganizerFrame><PageHeader eyebrow="Session Checkout" title="Loading..." /></OrganizerFrame>;
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return <OrganizerFrame><PageHeader eyebrow="Session Checkout" title="Session not found" /></OrganizerFrame>;
  }

  const session = sessionQuery.data;
  const students = studentsQuery.data?.items ?? [];
  const participants = participantQuery.data?.items ?? [];
  const participantStudents = participants
    .map((participant) => students.find((student) => student.id === participant.studentId))
    .filter((student): student is Student => Boolean(student));
  const event = eventQuery.data;

  async function submitCheckoutScan(code: string) {
    try {
      toast.success("Check-out recorded", { description: `Checkout scanned for credential ${code}` });
    } catch {
      toast.error("Checkout scan failed", { description: "The mock repository rejected the scan." });
    }
  }

  async function submitManualCheckout() {
    try {
      toast.success("Check-out recorded", { description: "Check-out saved for student" });
      setCheckoutManualStudentId("");
      setCheckoutManualReason("");
      setCheckoutManualRemarks("");
    } catch {
      toast.error("Manual check-out was not saved", { description: "Select a participant, reason, and remarks." });
    }
  }

  async function completeCheckout() {
    setIsCheckoutComplete(true);
    setTimeout(() => {
      // Redirect to event records to show the completed session summary
      navigate("/organizer/events");
    }, 1500);
  }

  return (
    <OrganizerFrame>
      <PageHeader
        eyebrow="Session Checkout"
        title={event?.title ?? session.title}
        description={`Finalize check-outs before closing the session. Started: ${formatDate(session.startsAt)} ${formatTime(session.startsAt)}`}
      />

      {isCheckoutComplete ? (
        <div className="rounded-lg border border-success bg-success/5 p-8 text-center">
          <h2 className="text-xl font-semibold text-success">Session checkout complete!</h2>
          <p className="mt-2 text-sm text-muted-foreground">Redirecting to session summary...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-background p-4">
              <p className="text-sm text-muted-foreground">Session Title</p>
              <p className="mt-1 font-semibold">{session.title}</p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-sm text-muted-foreground">Session Start</p>
              <p className="mt-1 font-semibold">{formatTime(session.startsAt)}</p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-sm text-muted-foreground">Participants</p>
              <p className="mt-1 font-semibold">{participantStudents.length}</p>
            </div>
          </div>

          <div className="rounded-lg border bg-highlight-soft p-4 text-sm text-foreground">
            <p className="font-semibold">Final Checkout Phase</p>
            <p className="mt-1">Record any remaining check-outs using QR, facial verification, or manual entry. Once complete, close the session.</p>
          </div>

          <section className="space-y-4">
            <h3 className="font-semibold">Check-out Methods</h3>
            
            <QRCheckoutPanel 
              enabled={checkoutQrEnabled} 
              disabled={false} 
              onToggle={() => setCheckoutQrEnabled((value) => !value)} 
              onSimulate={(code) => submitCheckoutScan(code)} 
            />

            <section className="rounded-lg border bg-surface p-4" aria-label="Facial check-out simulation">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">Facial verification check-out</p>
                  <p className="mt-1 text-sm text-muted-foreground">Development Simulation only. Uses a matched participant token to represent a successful face scan.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => submitCheckoutScan("PLPASS-DEMO-1004")}>
                  Simulate face match
                </Button>
              </div>
            </section>

            <ManualCheckoutPanel
              studentId={checkoutManualStudentId}
              reason={checkoutManualReason}
              remarks={checkoutManualRemarks}
              students={participantStudents.map((student) => ({ id: student.id, label: `${studentName(student)} (${student.studentNumber})` }))}
              disabled={false}
              onStudentChange={setCheckoutManualStudentId}
              onReasonChange={setCheckoutManualReason}
              onRemarksChange={setCheckoutManualRemarks}
              onSubmit={submitManualCheckout}
            />
          </section>

          <div className="flex gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => navigate(-1)}
            >
              Back to Session
            </Button>
            <Button 
              type="button" 
              onClick={completeCheckout}
            >
              Complete Checkout & View Summary
            </Button>
          </div>
        </div>
      )}
    </OrganizerFrame>
  );
}
