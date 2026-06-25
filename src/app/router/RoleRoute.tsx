import { Navigate, Outlet } from "react-router-dom";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { UserRole } from "@/types/roles";

type RoleRouteProps = {
  allowedRoles: UserRole[];
};

export function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const { session } = useDevelopmentSession();

  if (!allowedRoles.includes(session.role)) {
    return <Navigate to={APP_ROUTES.accessDenied} replace />;
  }

  return <Outlet />;
}
