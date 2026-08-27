import { FormEvent, useState } from "react";
import { z } from "zod";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
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
      setMessage("If that email exists in PLPass, Supabase has sent password reset instructions.");
    } catch (caught) {
      setMessage(null);
      setError(caught instanceof Error ? caught.message : "Password recovery is unavailable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Forgot password" description="Request a secure password reset through Supabase.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {message ? <p className="rounded-md bg-info-muted p-3 text-sm text-foreground">{message}</p> : null}
        <Button type="submit" disabled={submitting}>{submitting ? "Sending…" : "Continue"}</Button>
        <Button type="button" variant="link" asChild>
          <a href={APP_ROUTES.login}>Return to login</a>
        </Button>
      </form>
    </AuthLayout>
  );
}
