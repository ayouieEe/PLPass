import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/feedback/LoadingState";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { acceptCurrentLegalDocuments, allCurrentLegalDocumentsAccepted, getLegalAcceptanceStatus, LEGAL_POLICY_VERSION } from "@/lib/legal/acceptance";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal/policies";

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
    <AuthLayout title="Terms of Use" description={`PLPass student account information • Version ${LEGAL_POLICY_VERSION}`} wide>
      <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-foreground">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <p>Review the Terms of Use and Privacy Policy before opening your student workspace. Your acceptance is recorded for this account.</p>
        </div>
      </div>
      <div className="mt-5 max-h-[min(52vh,30rem)] overflow-y-auto rounded-xl border border-border bg-surface px-5 py-4 text-sm leading-7 text-muted-foreground">
        <section aria-labelledby="student-terms-heading" className="space-y-5">
          <h2 id="student-terms-heading" className="text-lg font-semibold text-foreground">Terms of Use</h2>
          {TERMS_SECTIONS.map(([heading, body]) => <div key={`terms-${heading}`}><h3 className="font-semibold text-foreground">{heading}</h3><p>{body}</p></div>)}
        </section>
        <section aria-labelledby="student-privacy-heading" className="mt-8 space-y-5 border-t border-border pt-7">
          <h2 id="student-privacy-heading" className="text-lg font-semibold text-foreground">Privacy Policy</h2>
          {PRIVACY_SECTIONS.map(([heading, body]) => <div key={`privacy-${heading}`}><h3 className="font-semibold text-foreground">{heading}</h3><p>{body}</p></div>)}
        </section>
      </div>
      <div className="mt-5 space-y-4 border-t border-border pt-5">
        <label className="flex items-start gap-3 text-sm leading-6 text-foreground">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-input" checked={termsAccepted && privacyAccepted} onChange={(event) => { setTermsAccepted(event.target.checked); setPrivacyAccepted(event.target.checked); }} />
          <span>I have read and agree to the Terms of Use and acknowledge the Privacy Policy.</span>
        </label>
        <Button type="button" className="h-11 w-full rounded-lg" disabled={!termsAccepted || !privacyAccepted || saving} onClick={() => void handleAccept()}>
          <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
          {saving ? "Saving agreement…" : "Accept and continue"}
        </Button>
      </div>
    </AuthLayout>
  );
}
