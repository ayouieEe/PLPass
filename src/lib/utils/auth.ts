import { APP_ROUTES } from "@/lib/constants/routes";
import type { UserRole } from "@/types/roles";

export function getAuthorizedHomePath(role: UserRole) {
  if (role === "admin") {
    return APP_ROUTES.adminDashboard;
  }
  if (role === "faculty") {
    return APP_ROUTES.facultyDashboard;
  }
  if (role === "organizer") {
    return APP_ROUTES.organizerDashboard;
  }
  return APP_ROUTES.studentDashboard;
}

export function isPathAllowedForRole(pathname: string, role: UserRole) {
  if (pathname.startsWith("/admin")) {
    return role === "admin";
  }
  if (pathname.startsWith("/faculty")) {
    return role === "faculty";
  }
  if (pathname.startsWith("/organizer")) {
    return role === "organizer";
  }
  if (pathname.startsWith("/student")) {
    return role === "student";
  }
  return true;
}
