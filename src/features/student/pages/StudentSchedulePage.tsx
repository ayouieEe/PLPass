import { Navigate } from "react-router-dom";
import { APP_ROUTES } from "@/lib/constants/routes";

export function StudentSchedulePage() {
  return <Navigate to={APP_ROUTES.studentUpcomingEvents} replace />;
}
