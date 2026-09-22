import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { UserRole } from "@/types/roles";
import { hasAnyCapability, type Capability } from "@/lib/auth/permissions";
import { canAccessOfflineRoute } from "@/app/router/offlineRoutePolicy";

type RoleRouteProps = {
  allowedRoles: UserRole[];
  permission?: Capability | readonly Capability[];
};

export function RoleRoute({ allowedRoles, permission }: RoleRouteProps) {
  const { session, isOfflineMode } = useDevelopmentSession();
  const location = useLocation();

  const capabilities = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
  if (!session || !allowedRoles.includes(session.role) || (capabilities.length > 0 && !hasAnyCapability(session.role, capabilities))) {
    return <Navigate to={APP_ROUTES.accessDenied} replace />;
  }

  if (isOfflineMode) {
    if (!canAccessOfflineRoute(session.role, location.pathname)) return <Navigate to={APP_ROUTES.organizerEvents} replace />;
  }

  return <Outlet />;
}
