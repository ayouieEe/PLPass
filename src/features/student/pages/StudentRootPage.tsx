import { Navigate } from "react-router-dom";
import { APP_ROUTES } from "@/lib/constants/routes";

export function StudentRootPage() {
  return <Navigate to={APP_ROUTES.studentDashboard} replace />;
}
