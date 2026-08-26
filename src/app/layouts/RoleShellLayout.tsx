import { Outlet } from "react-router-dom";
import { DashboardLayout } from "@/app/layouts/DashboardLayout";
import { HeaderProvider } from "@/app/providers/HeaderProvider";
import { LoadingState } from "@/components/feedback/LoadingState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";

export function RoleShellLayout() {
  const { session } = useDevelopmentSession();

  if (!session) {
    return (
      <div className="min-h-screen bg-background p-6">
        <LoadingState label="Preparing workspace" />
      </div>
    );
  }

  return (
    <HeaderProvider>
      <DashboardLayout role={session.role} userLabel={session.displayName}>
        <Outlet />
      </DashboardLayout>
    </HeaderProvider>
  );
}

