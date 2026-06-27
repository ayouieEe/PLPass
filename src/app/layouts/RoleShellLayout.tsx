import { Outlet } from "react-router-dom";
import { DashboardLayout } from "@/app/layouts/DashboardLayout";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";

export function RoleShellLayout() {
  const { session } = useDevelopmentSession();

  if (!session) {
    return null;
  }

  return (
    <DashboardLayout role={session.role} userLabel={session.displayName}>
      <Outlet />
    </DashboardLayout>
  );
}
