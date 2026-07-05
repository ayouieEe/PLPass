import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail, UserRound } from "lucide-react";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { LoadingState } from "@/components/feedback/LoadingState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
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

const roleLabels: Partial<Record<UserRole, string>> = {
  admin: "Admin",
  organizer: "Organizer",
  student: "Student"
};

const roleOrder: UserRole[] = ["admin", "organizer", "student"];
type DevelopmentRoleFilter = "all" | UserRole;

export function LoginPage() {
  const accounts = useDevelopmentAccounts();
  const { session, signIn, signInWithPassword, isSessionRestored, isSupabaseMode, authError } = useDevelopmentSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedAccount, setSelectedAccount] = useState<DevelopmentAccount | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<DevelopmentRoleFilter>("all");
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
      if (account.role === "faculty") {
        continue;
      }
      groups[account.role].push(account);
    }
    return groups;
  }, [accounts.data]);

  const availableRoles: DevelopmentRoleFilter[] = ["all", ...roleOrder.filter((role) => groupedAccounts[role].length > 0)];
  const allDevelopmentAccounts = roleOrder.flatMap((role) => groupedAccounts[role]);
  const visibleDevelopmentAccounts = selectedRole === "all" ? allDevelopmentAccounts : groupedAccounts[selectedRole] ?? [];

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

  if (isSupabaseMode) {
    return (
      <AuthLayout title="Sign in to PLPass" description="Use your PLPass account to open your assigned workspace.">
        {authError ? (
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger-muted p-3 text-sm text-danger" role="alert">
            {authError}
          </div>
        ) : null}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSupabaseSignIn();
          }}
        >
          <label className="block text-sm font-medium">
            Email
            <span className="relative mt-1 block">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                className="plpass-field h-12 w-full rounded-lg border bg-surface pl-10 pr-3 text-sm outline-none"
                type="email"
                value={email}
                autoComplete="email"
                placeholder="name@plpasig.edu.ph"
                onChange={(event) => setEmail(event.target.value)}
              />
            </span>
          </label>
          <label className="block text-sm font-medium">
            Password
            <span className="relative mt-1 block">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                className="plpass-field h-12 w-full rounded-lg border bg-surface pl-10 pr-12 text-sm outline-none"
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="current-password"
                placeholder="Enter your password"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </span>
          </label>
          <Button type="submit" className="h-12 w-full rounded-lg" disabled={!email || !password || isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
          <Button type="button" variant="link" asChild>
            <a href={APP_ROUTES.forgotPassword}>Forgot password?</a>
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in to PLPass" description="Choose a development account to preview role-specific workspaces.">
      <div className="mb-5 rounded-xl border border-warning/30 bg-warning-muted p-4 text-sm text-warning-foreground">
        <div className="flex gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Development-only access</p>
            <p className="mt-1">No passwords, tokens, or live authentication are used in this mode.</p>
          </div>
        </div>
      </div>
      {accounts.isLoading ? <LoadingState label="Loading fixture accounts" /> : null}
      {availableRoles.length ? (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-muted p-1 sm:grid-cols-4" role="tablist" aria-label="Development account role">
          {availableRoles.map((role) => (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={selectedRole === role}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selectedRole === role ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:bg-surface hover:text-foreground"
              )}
              onClick={() => {
                setSelectedRole(role);
                setSelectedAccount(null);
              }}
            >
              {role === "all" ? "All" : roleLabels[role]}
            </button>
          ))}
        </div>
      ) : null}
      <section className="space-y-2">
        <h2 className="sr-only">{selectedRole === "all" ? "All development accounts" : `${roleLabels[selectedRole]} accounts`}</h2>
        <div className="grid gap-2">
          {visibleDevelopmentAccounts.map((account) => (
            <label
              key={account.userId}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border bg-surface p-3 transition-colors hover:border-primary/40 hover:bg-surface-muted",
                selectedAccount?.userId === account.userId ? "border-primary/50 bg-highlight-soft" : "border-border"
              )}
            >
              <input
                type="radio"
                name="account"
                className="sr-only"
                checked={selectedAccount?.userId === account.userId}
                onChange={() => setSelectedAccount(account)}
              />
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <UserRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{account.displayName}</span>
                <span className="block truncate text-xs capitalize text-muted-foreground">
                  {account.role} - {account.email}
                </span>
              </span>
              {selectedAccount?.userId === account.userId ? <CheckCircle2 className="mt-2 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /> : null}
            </label>
          ))}
        </div>
      </section>
      <div className="mt-5 flex flex-col gap-2">
        <Button type="button" className="h-12 rounded-lg" disabled={!selectedAccount} onClick={handleSignIn}>
          Sign in with selected account
        </Button>
        <Button type="button" variant="link" asChild>
          <a href={APP_ROUTES.forgotPassword}>Forgot password?</a>
        </Button>
      </div>
    </AuthLayout>
  );
}
