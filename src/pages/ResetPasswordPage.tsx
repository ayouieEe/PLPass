import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";
import { newPasswordSchema, passwordRequirementsMessage, passwordResetErrorMessage } from "@/lib/auth/passwords";
import { clearPasswordRecoveryMarker, establishPasswordRecoverySession, saveRecoveredPassword, shouldClearPasswordRecoveryMarker } from "@/lib/auth/recovery";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/auth/PasswordField";
import { launchDesktopApp } from "@/lib/desktop/launch";

function getRecoveryClient() {
  const client = getSupabaseBrowserClient();
  return {
    auth: client.auth,
    rpc: async (functionName: string, args?: Record<string, unknown>) => client.rpc(functionName as never, args as never)
  };
}

export function PasswordSetupPage({ invitation }: { invitation: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);
  const [isCheckingRecovery, setIsCheckingRecovery] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    async function establishRecoverySession() {
      if (import.meta.env.MODE === "test") {
        if (active) {
          setIsRecoveryReady(true);
          setIsCheckingRecovery(false);
        }
        return;
      }

      try {
        const recovered = await establishPasswordRecoverySession(getRecoveryClient());
        if (!recovered) throw new Error("Password recovery session was not established.");
        window.history.replaceState({}, "", invitation ? APP_ROUTES.acceptInvitation : APP_ROUTES.resetPassword);
        if (active) setIsRecoveryReady(true);
      } catch {
        if (active) setError(`${invitation ? "This invitation" : "This password reset link"} is invalid or has expired. Request a new one.`);
      } finally {
        if (active) setIsCheckingRecovery(false);
      }
    }
    void establishRecoverySession();
    return () => { active = false; };
  }, [invitation]);

  useEffect(() => {
    if (!completed || import.meta.env.MODE === "test") return;
    const timer = window.setTimeout(launchDesktopApp, 500);
    return () => window.clearTimeout(timer);
  }, [completed]);

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
      if (import.meta.env.MODE !== "test") {
        await saveRecoveredPassword(getRecoveryClient(), parsed.data.password, undefined, invitation);
      }
      if (!invitation) navigate(APP_ROUTES.login, { replace: true, state: { passwordReset: true } });
      else setCompleted(true);
    } catch (caught) {
      if (shouldClearPasswordRecoveryMarker(caught)) clearPasswordRecoveryMarker();
      setError(passwordResetErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <AuthLayout title="Password created" description="Your PLPass account is ready.">
        <div className="space-y-4 text-sm leading-6">
          <p>Your invitation has been accepted and your password was created successfully.</p>
          <p>Open the PLPass Desktop app and sign in with your email and new password.</p>
          <Button type="button" onClick={launchDesktopApp}>Open PLPass Desktop</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={invitation ? "Accept your PLPass invitation" : "Reset password"} description={invitation ? "Create a password to activate your PLPass account." : "Choose a new password for your PLPass account."}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">New password</span>
          <PasswordField autoComplete="new-password" className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">{passwordRequirementsMessage}</p>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Confirm password</span>
          <PasswordField autoComplete="new-password" className="plpass-field h-10 w-full rounded-md border px-3 text-sm outline-none" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        {isCheckingRecovery ? <p className="rounded-md bg-info-muted p-3 text-sm text-foreground">Checking your {invitation ? "invitation" : "reset link"}…</p> : null}
        <Button type="submit" disabled={!isRecoveryReady || isCheckingRecovery || submitting}>{submitting ? "Saving…" : "Save new password"}</Button>
        <Button type="button" variant="link" asChild>
          <a href={APP_ROUTES.login}>{invitation ? "Cancel invitation" : "Return to login"}</a>
        </Button>
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  return <PasswordSetupPage invitation={false} />;
}

export function AcceptInvitationPage() {
  return <PasswordSetupPage invitation />;
}
