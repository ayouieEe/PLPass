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
  const { session, signIn, isSessionRestored } = useDevelopmentSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedAccount, setSelectedAccount] = useState<DevelopmentAccount | null>(null);
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

    const requestedPath = locationState?.from?.pathname;
    const destination =
      requestedPath && isPathAllowedForRole(requestedPath, selectedAccount.role)
        ? requestedPath
        : getAuthorizedHomePath(selectedAccount.role);
    navigate(destination, { replace: true });
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
