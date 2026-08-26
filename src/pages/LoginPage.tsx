import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getAuthorizedHomePath, isPathAllowedForRole } from "@/lib/utils/auth";
import type { UserRole } from "@/types/roles";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

export function LoginPage() {
  const { session, signInWithPassword, isSessionRestored, authError, logout } = useDevelopmentSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locationState = location.state as LocationState | null;

  function redirectAfterSignIn(role: UserRole) {
    const requestedPath = locationState?.from?.pathname;
    const destination = requestedPath && isPathAllowedForRole(requestedPath, role)
      ? requestedPath
      : getAuthorizedHomePath(role);
    navigate(destination, { replace: true });
  }

  async function handleSignIn() {
    if (!email || !password || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    const nextSession = await signInWithPassword(email, password);
    setIsSubmitting(false);
    if (nextSession) {
      redirectAfterSignIn(nextSession.role);
    }
  }

  return (
    <AuthLayout title="Sign in to PLPass" description="Use your PLPass account to open your assigned workspace.">
      {isSessionRestored && session ? (
        <div className="mb-4 rounded-xl border border-primary/20 bg-highlight-soft p-3 text-sm">
          <p className="font-medium">You are currently signed in as {session.displayName}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => redirectAfterSignIn(session.role)}>Continue to workspace</Button>
            <Button type="button" size="sm" variant="outline" onClick={logout}>Sign out</Button>
          </div>
        </div>
      ) : null}
      {authError ? <div className="mb-4 rounded-xl border border-danger/30 bg-danger-muted p-3 text-sm text-danger" role="alert">{authError}</div> : null}
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleSignIn(); }}>
        <div className="block text-sm font-medium">
          <label htmlFor="plpass-login-email">Email</label>
          <span className="relative mt-1 block">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input id="plpass-login-email" className="plpass-field h-12 w-full rounded-lg border bg-surface pl-10 pr-3 text-sm outline-none" type="email" value={email} autoComplete="email" placeholder="name@plpasig.edu.ph" onChange={(event) => setEmail(event.target.value)} />
          </span>
        </div>
        <div className="block text-sm font-medium">
          <label htmlFor="plpass-login-password">Password</label>
          <span className="relative mt-1 block">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input id="plpass-login-password" className="plpass-field h-12 w-full rounded-lg border bg-surface pl-10 pr-12 text-sm outline-none" type={showPassword ? "text" : "password"} value={password} autoComplete="current-password" placeholder="Enter your password" onChange={(event) => setPassword(event.target.value)} />
            <button type="button" className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </span>
        </div>
        <Button type="submit" className="h-12 w-full rounded-lg" disabled={!email || !password || isSubmitting}>{isSubmitting ? "Signing in..." : "Sign in"}</Button>
        <Button type="button" variant="link" asChild><a href={APP_ROUTES.forgotPassword}>Forgot password?</a></Button>
      </form>
    </AuthLayout>
  );
}
