import type { UserRole } from "@/types/enums";
import type { Notification } from "@/types/domain";

export type NotificationCategory = "attendance" | "events" | "requests" | "credentials" | "reports" | "security" | "system";

export const notificationCategoryLabels: Record<NotificationCategory, string> = {
  attendance: "Attendance",
  events: "Events",
  requests: "Requests",
  credentials: "Credentials",
  reports: "Reports",
  security: "Security",
  system: "System"
};

export function notificationCategory(notification: Notification): NotificationCategory {
  const code = notification.code ?? "";
  if (code.startsWith("credential.")) return "credentials";
  if (code.startsWith("correction.")) return "requests";
  if (code.startsWith("report.")) return "reports";
  if (code.startsWith("security.") || code.startsWith("account.")) return "security";
  if (code.startsWith("event.")) return "events";
  if (code.startsWith("attendance.") || notification.type === "attendance") return "attendance";
  if (code.startsWith("system.") || notification.type === "system") return "system";
  return notification.type === "correction" ? "requests" : notification.type === "report" ? "reports" : "system";
}

export function categoriesForRole(role: UserRole): NotificationCategory[] {
  if (role === "student") return ["attendance", "events", "requests", "credentials", "security"];
  if (role === "organizer") return ["events", "attendance", "requests", "reports", "security"];
  if (role === "admin") return ["security", "system", "requests"];
  return ["security"];
}

export function isNotificationVisibleForRole(notification: Notification, role: UserRole) {
  return categoriesForRole(role).includes(notificationCategory(notification));
}
