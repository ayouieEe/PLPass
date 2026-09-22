import { Outlet, useLocation } from "react-router-dom";
import { DashboardLayout } from "@/app/layouts/DashboardLayout";
import { HeaderProvider } from "@/app/providers/HeaderProvider";
import { LoadingState } from "@/components/feedback/LoadingState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { ActiveSessionOverlay } from "@/features/attendance/ActiveSessionOverlay";
import { APP_ROUTES } from "@/lib/constants/routes";

export function RoleShellLayout() {
  const { session, isOfflineMode } = useDevelopmentSession();
  const location = useLocation();

  if (!session) {
    return (
      <div className="min-h-screen bg-background p-6">
        <LoadingState label="Preparing workspace" />
      </div>
    );
  }

  // The first-login legal review is part of the authenticated flow, but it
  // must be shown before the student workspace chrome becomes available.
  if (location.pathname === APP_ROUTES.studentLegalReview) {
    return <Outlet />;
  }

  return (
    <HeaderProvider>
      <DashboardLayout role={session.role} userLabel={session.displayName}>
        <Outlet />
      </DashboardLayout>
      {!isOfflineMode ? <ActiveSessionOverlay /> : null}
    </HeaderProvider>
  );
}

