import { Navigate, Outlet } from "react-router-dom";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { UserRole } from "@/types/roles";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

type RoleRouteProps = {
  allowedRoles: UserRole[];
  permission?: Permission;
};

export function RoleRoute({ allowedRoles, permission }: RoleRouteProps) {
  const { session } = useDevelopmentSession();

  if (!session || !allowedRoles.includes(session.role) || (permission && !hasPermission(session.role, permission))) {
    return <Navigate to={APP_ROUTES.accessDenied} replace />;
  }

  return <Outlet />;
}
