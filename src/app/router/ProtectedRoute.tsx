import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";

export function ProtectedRoute() {
  const location = useLocation();
  const { session } = useDevelopmentSession();

  if (!session.isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
