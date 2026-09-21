import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FileText, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/feedback/LoadingState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { acceptCurrentLegalDocuments, allCurrentLegalDocumentsAccepted, getLegalAcceptanceStatus, LEGAL_DOCUMENTS, LEGAL_POLICY_VERSION } from "@/lib/legal/acceptance";

type ReviewState = { from?: { pathname?: string; search?: string; hash?: string } };

export function StudentLegalReviewPage() {
  const { session } = useDevelopmentSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const from = (location.state as ReviewState | null)?.from;

  useEffect(() => {
    if (!session) return;
    void getLegalAcceptanceStatus(session.userId).then((status) => {
      setTermsAccepted(status.terms);
      setPrivacyAccepted(status.privacy);
      if (allCurrentLegalDocumentsAccepted(status)) navigate(from?.pathname ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}` : "/student/dashboard", { replace: true });
    }).catch(() => toast.error("Could not check your legal agreement status.")).finally(() => setLoading(false));
  }, [from?.hash, from?.pathname, from?.search, navigate, session]);

  if (!session || loading) return <LoadingState label="Loading account agreements" />;
  const authenticatedSession = session;

  async function handleAccept() {
    if (!termsAccepted || !privacyAccepted || saving) return;
    setSaving(true);
    try {
      const userId = authenticatedSession.userId;
      await acceptCurrentLegalDocuments(userId);
      queryClient.setQueryData(["legal-acceptance", userId], { terms: true, privacy: true });
      navigate(from?.pathname ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}` : "/student/dashboard", { replace: true });
    } catch {
      toast.error("Your agreements could not be saved. Please try again.");
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-1">
      <div className="student-glass-card space-y-3 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Review PLPass account agreements</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Before opening your student workspace, review and accept both documents. Version {LEGAL_POLICY_VERSION} will be recorded for your account.</p>
          </div>
        </div>
      </div>
      <div className="student-glass-card space-y-4 p-6 shadow-sm">
        <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-input" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
          <span>I have read and agree to the <Link className="font-semibold text-primary hover:underline" to={LEGAL_DOCUMENTS.terms.path} target="_blank" rel="noreferrer">Terms of Use</Link>.</span>
        </label>
        <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-input" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
          <span>I have read and acknowledge the <Link className="font-semibold text-primary hover:underline" to={LEGAL_DOCUMENTS.privacy.path} target="_blank" rel="noreferrer">Privacy Policy</Link>.</span>
        </label>
        <Button type="button" className="w-full sm:w-auto" disabled={!termsAccepted || !privacyAccepted || saving} onClick={() => void handleAccept()}>
          <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
          {saving ? "Saving agreement…" : "Continue to student account"}
        </Button>
      </div>
    </div>
  );
}
