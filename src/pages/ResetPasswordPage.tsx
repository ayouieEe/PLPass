import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";
import { newPasswordSchema, passwordRequirementsMessage, passwordResetErrorMessage } from "@/lib/auth/passwords";
import { clearPasswordRecoveryMarker, establishPasswordRecoverySession, saveRecoveredPassword, shouldClearPasswordRecoveryMarker } from "@/lib/auth/recovery";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [isCheckingRecovery, setIsCheckingRecovery] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    async function establishRecoverySession() {
      if (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") {
        if (active) {
          setIsRecoveryReady(true);
          setIsCheckingRecovery(false);
        }
        return;
      }

      try {
        const recovered = await establishPasswordRecoverySession(getSupabaseBrowserClient());
        if (!recovered) throw new Error("Password recovery session was not established.");
        window.history.replaceState({}, "", APP_ROUTES.resetPassword);
        if (active) setIsRecoveryReady(true);
      } catch {
        if (active) setError("This password reset link is invalid or has expired. Request a new one.");
      } finally {
        if (active) setIsCheckingRecovery(false);
      }
    }
    void establishRecoverySession();
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = newPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the password fields.");
      return;
    }
    if (!isRecoveryReady || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      if (import.meta.env.VITE_DATA_SOURCE !== "mock" && import.meta.env.MODE !== "test") {
        await saveRecoveredPassword(getSupabaseBrowserClient(), parsed.data.password);
      }
      navigate(APP_ROUTES.login, { replace: true, state: { passwordReset: true } });
    } catch (caught) {
      if (shouldClearPasswordRecoveryMarker(caught)) clearPasswordRecoveryMarker();
      setError(passwordResetErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Reset password" description="Choose a new password for your PLPass account.">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">New password</span>
          <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">{passwordRequirementsMessage}</p>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Confirm password</span>
          <input className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        {isCheckingRecovery ? <p className="rounded-md bg-info-muted p-3 text-sm text-foreground">Checking your reset link…</p> : null}
        <Button type="submit" disabled={!isRecoveryReady || isCheckingRecovery || submitting}>{submitting ? "Saving…" : "Save new password"}</Button>
        <Button type="button" variant="link" asChild>
          <a href={APP_ROUTES.login}>Return to login</a>
        </Button>
      </form>
    </AuthLayout>
  );
}
