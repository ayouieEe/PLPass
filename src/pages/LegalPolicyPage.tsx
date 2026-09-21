import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { LEGAL_POLICY_VERSION, PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal/policies";

type LegalPolicyPageProps = { document: "terms" | "privacy" };

export function LegalPolicyPage({ document }: LegalPolicyPageProps) {
  const isTerms = document === "terms";
  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const title = isTerms ? "Terms of Use" : "Privacy Policy";

  return (
    <AuthLayout title={title} description={`PLPass student account information • Version ${LEGAL_POLICY_VERSION}`} wide legal>
      <article className="space-y-6 text-sm leading-7 text-muted-foreground">
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <p>This is a student-facing PLPass product draft. The institution and its legal/privacy officers must review and approve it before production adoption.</p>
        </div>
        {sections.map(([heading, body]) => (
          <section key={heading}>
            <h2 className="text-base font-semibold text-foreground">{heading}</h2>
            <p className="mt-1">{body}</p>
          </section>
        ))}
        <Link to="/login" className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </article>
    </AuthLayout>
  );
}
