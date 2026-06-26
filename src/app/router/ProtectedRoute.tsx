import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";

export function ProtectedRoute() {
  const location = useLocation();
  const { session, isSessionRestored } = useDevelopmentSession();

  if (!isSessionRestored) {
    return null;
  }

  if (!session?.isAuthenticated) {
    return <Navigate to={APP_ROUTES.login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
