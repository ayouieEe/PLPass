import { Navigate, Outlet } from "react-router-dom";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { UserRole } from "@/types/roles";
import { hasAnyCapability, type Capability } from "@/lib/auth/permissions";

type RoleRouteProps = {
  allowedRoles: UserRole[];
  permission?: Capability | readonly Capability[];
};

export function RoleRoute({ allowedRoles, permission }: RoleRouteProps) {
  const { session } = useDevelopmentSession();

  const capabilities = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
  if (!session || !allowedRoles.includes(session.role) || (capabilities.length > 0 && !hasAnyCapability(session.role, capabilities))) {
    return <Navigate to={APP_ROUTES.accessDenied} replace />;
  }

  return <Outlet />;
}
