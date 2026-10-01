import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal/policies";
import { useLegalDocument } from "@/hooks/useRepositoryQueries";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { getErrorMessage } from "@/lib/utils/errors";

type LegalPolicyPageProps = {
  document: "terms" | "privacy";
  backTo?: string;
  backLabel?: string;
  workspace?: boolean;
};

export function LegalPolicyPage({ document, backTo = "/login", backLabel = "Back to sign in", workspace = false }: LegalPolicyPageProps) {
  const isTerms = document === "terms";
  const query = useLegalDocument(document);
  const sections = query.data?.sections ?? ((isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS).map(([heading, body]) => ({ heading, body })));
  const version = query.data?.version ?? "2026-09-21.1";
  const title = isTerms ? "Terms of Use" : "Privacy Policy";

  if (query.isLoading) return <LoadingState label="Loading legal document" />;
  if (query.isError && import.meta.env.MODE !== "test") return <ErrorState title="Unable to load legal document" message={getErrorMessage(query.error)} />;

  const policyContent = (
    <article className="space-y-6 text-sm leading-7 text-muted-foreground">
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
          <p>This is a student-facing PLPass product draft. The institution and its legal/privacy officers must review and approve it before production adoption.</p>
        </div>
        {sections.map(({ heading, body }) => (
          <section key={heading}>
            <h2 className="text-base font-semibold text-foreground">{heading}</h2>
            <p className="mt-1">{body}</p>
          </section>
        ))}
    </article>
  );

  if (workspace) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to={backTo} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {backLabel}
            </Link>
            <h1 className="mt-4 text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">PLPass student account information • Version {version}</p>
          </div>
        </div>
        <section className="student-glass-card rounded-2xl border border-border/80 p-5 shadow-sm sm:p-6 md:p-7">
          {policyContent}
        </section>
      </div>
    );
  }

  return (
    <AuthLayout
      title={title}
      description={`PLPass student account information • Version ${version}`}
      headerAction={(
        <Link to={backTo} className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
      )}
      wide
      legal
    >
      {policyContent}
    </AuthLayout>
  );
}
