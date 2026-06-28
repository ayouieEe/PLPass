import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { LoadingState } from "@/components/feedback/LoadingState";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useDevelopmentAccounts } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { getAuthorizedHomePath, isPathAllowedForRole } from "@/lib/utils/auth";
import type { DevelopmentAccount } from "@/types/domain";
import type { UserRole } from "@/types/roles";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  faculty: "Faculty",
  organizer: "Organizer",
  student: "Student"
};

export function LoginPage() {
  const accounts = useDevelopmentAccounts();
  const { session, signIn, signInWithPassword, isSessionRestored, isSupabaseMode, authError } = useDevelopmentSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedAccount, setSelectedAccount] = useState<DevelopmentAccount | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locationState = location.state as LocationState | null;

  const groupedAccounts = useMemo(() => {
    const groups: Record<UserRole, DevelopmentAccount[]> = {
      admin: [],
      faculty: [],
      organizer: [],
      student: []
    };
    for (const account of accounts.data ?? []) {
      groups[account.role].push(account);
    }
    return groups;
  }, [accounts.data]);

  if (isSessionRestored && session) {
    return <Navigate to={getAuthorizedHomePath(session.role)} replace />;
  }

  function redirectAfterSignIn(role: UserRole) {
    const requestedPath = locationState?.from?.pathname;
    const destination =
      requestedPath && isPathAllowedForRole(requestedPath, role)
        ? requestedPath
        : getAuthorizedHomePath(role);
    navigate(destination, { replace: true });
  }

  function handleSignIn() {
    if (!selectedAccount) {
      return;
    }

    signIn({
      userId: selectedAccount.userId,
      role: selectedAccount.role,
      displayName: selectedAccount.displayName,
      email: selectedAccount.email,
      isAuthenticated: true
    });

    redirectAfterSignIn(selectedAccount.role);
  }

  async function handleSupabaseSignIn() {
    setIsSubmitting(true);
    const nextSession = await signInWithPassword(email, password);
    setIsSubmitting(false);
    if (nextSession) {
      redirectAfterSignIn(nextSession.role);
    }
  }

  if (isSupabaseMode) {
    return (
      <AuthLayout title="Sign in to PLPass" description="Use your PLPass email and password.">
        <div className="mb-4 rounded-md border border-primary/20 bg-highlight-soft p-3 text-sm text-foreground">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
            <p>Supabase authentication is active. Your role is loaded from the database profile after sign-in.</p>
          </div>
        </div>
        {authError ? <div className="mb-4 rounded-md border border-danger/30 bg-danger-muted p-3 text-sm text-danger">{authError}</div> : null}
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input className="plpass-field mt-1 h-11 w-full rounded-md border px-3 text-sm" type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input className="plpass-field mt-1 h-11 w-full rounded-md border px-3 text-sm" type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <Button type="button" disabled={!email || !password || isSubmitting} onClick={handleSupabaseSignIn}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
          <Button type="button" variant="link" asChild>
            <a href={APP_ROUTES.forgotPassword}>Forgot password?</a>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in to PLPass" description="Choose a fixture account for development testing.">
      <div className="mb-4 rounded-md border border-warning/30 bg-warning-muted p-3 text-sm text-warning-foreground">
        <div className="flex gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <p>Development-only login. No passwords, tokens, or real authentication are used.</p>
        </div>
      </div>
      {accounts.isLoading ? <LoadingState label="Loading fixture accounts" /> : null}
      <div className="space-y-4">
        {Object.entries(groupedAccounts).map(([role, roleAccounts]) => (
          <section key={role} className="space-y-2">
            <h2 className="text-sm font-semibold">{roleLabels[role as UserRole]}</h2>
            <div className="grid gap-2">
              {roleAccounts.map((account) => (
                <label
                  key={account.userId}
                  className="flex cursor-pointer items-start gap-3 rounded-md border bg-surface p-3 hover:bg-surface-muted"
                >
                  <input
                    type="radio"
                    name="account"
                    className="mt-1 accent-primary"
                    checked={selectedAccount?.userId === account.userId}
                    onChange={() => setSelectedAccount(account)}
                  />
                  <span>
                    <span className="block text-sm font-medium">{account.displayName}</span>
                    <span className="block text-xs capitalize text-muted-foreground">
                      {account.role} - {account.email}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <Button type="button" disabled={!selectedAccount} onClick={handleSignIn}>
          Sign in with selected account
        </Button>
        <Button type="button" variant="link" asChild>
          <a href={APP_ROUTES.forgotPassword}>Forgot password?</a>
        </Button>
      </div>
    </AuthLayout>
  );
}
