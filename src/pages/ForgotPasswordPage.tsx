import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle2, X } from "lucide-react";
import { z } from "zod";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { forgotPasswordErrorMessage } from "@/lib/auth/passwords";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address.")
});

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!message) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMessage(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [message]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      setMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (import.meta.env.VITE_DATA_SOURCE !== "mock" && import.meta.env.MODE !== "test") {
        const redirectTo = `${window.location.origin}${APP_ROUTES.resetPassword}`;
        const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
        if (resetError) throw resetError;
      }
      setMessage("If there is a PLPass account for that email, we sent a password-reset link. Check Gmail for a message from PLPass, including your Spam and Promotions folders.");
    } catch (caught) {
      setMessage(null);
      setError(forgotPasswordErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot password"
      description="Enter your PLPass email address to request a password-reset link."
      headerAction={(
        <Button type="button" variant="link" size="sm" className="px-0" asChild>
          <a href={APP_ROUTES.login}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Back</a>
        </Button>
      )}
    >
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        <label className="block space-y-1.5" htmlFor="forgot-password-email">
          <span className="text-sm font-medium">Email</span>
          <input id="forgot-password-email" type="email" inputMode="email" autoComplete="email" className="plpass-field h-11 w-full rounded-md border px-3 text-sm outline-none" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "forgot-password-error" : undefined} />
        </label>
        {error ? <p id="forgot-password-error" className="text-sm text-danger" role="alert">{error}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" className="w-full sm:w-auto" disabled={submitting}>{submitting ? "Sending link…" : "Send reset link"}</Button>
        </div>
      </form>
      {message ? createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 px-4 py-6 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMessage(null); }}>
          <section className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-white/70 bg-surface/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)] ring-1 ring-foreground/10 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="forgot-password-success-title" aria-describedby="forgot-password-success-description">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-success-muted p-2 text-success"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
                <h2 id="forgot-password-success-title" className="text-lg font-semibold">Check your email</h2>
              </div>
              <button type="button" autoFocus className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Close confirmation" onClick={() => setMessage(null)}>
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div id="forgot-password-success-description" className="mt-4 space-y-3 text-sm leading-6">
              <p>{message}</p>
              <p className="text-muted-foreground">In Gmail, search for <span className="font-medium text-foreground">from:PLPass</span> or <span className="font-medium text-foreground">reset your PLPass password</span>. The link may take a few minutes to arrive.</p>
            </div>
            <Button type="button" className="mt-5 w-full" onClick={() => setMessage(null)}>Got it</Button>
          </section>
        </div>,
        document.body
      ) : null}
    </AuthLayout>
  );
}
