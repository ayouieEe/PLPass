import { APP_ROUTES } from "@/lib/constants/routes";
import type { UserRole } from "@/types/roles";

const organizerEventPath = /^\/organizer\/events\/[^/]+\/?$/;
const organizerLiveAttendancePath = /^\/organizer\/live-attendance\/[^/]+\/?$/;

export function isOfflineOrganizerRoute(pathname: string) {
  return pathname === APP_ROUTES.organizerEvents
    || organizerEventPath.test(pathname)
    || organizerLiveAttendancePath.test(pathname);
}

export function canAccessOfflineRoute(role: UserRole | undefined, pathname: string) {
  return role === "organizer" && isOfflineOrganizerRoute(pathname);
}
