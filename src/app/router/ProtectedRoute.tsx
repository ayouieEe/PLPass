import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "@/components/feedback/LoadingState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";

export function ProtectedRoute() {
  const location = useLocation();
  const { session, isSessionRestored } = useDevelopmentSession();

  if (!isSessionRestored) {
    return (
      <div className="min-h-screen bg-background p-6">
        <LoadingState label="Opening PLPass workspace" />
      </div>
    );
  }

  if (!session?.isAuthenticated) {
    return <Navigate to={APP_ROUTES.login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
