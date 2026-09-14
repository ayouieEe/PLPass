import type { UserRole } from "@/types/roles";

export type Permission =
  | "users.read" | "users.manage" | "events.create" | "events.read.owned" | "events.read.all"
  | "events.manage.owned" | "attendance.read.owned" | "attendance.read.all" | "attendance.manage.owned"
  | "corrections.review.owned" | "corrections.review.all" | "reports.read.owned" | "analytics.read.owned"
  | "analytics.read.all" | "credentials.use.owned_event" | "audit.read.own" | "audit.read.all"
  | "profile.manage.own" | "notifications.read.own" | "settings.manage.own" | "settings.manage";

const organizerPermissions: Permission[] = [
  "events.create", "events.read.owned", "events.manage.owned", "attendance.read.owned", "attendance.manage.owned",
  "corrections.review.owned", "reports.read.owned", "analytics.read.owned", "credentials.use.owned_event",
  "audit.read.own", "profile.manage.own", "notifications.read.own", "settings.manage.own"
];

const adminPermissions: Permission[] = [
  "users.read", "users.manage", "events.create", "events.read.owned", "events.read.all", "events.manage.owned",
  "attendance.read.owned", "attendance.read.all", "attendance.manage.owned", "corrections.review.owned", "corrections.review.all",
  "reports.read.owned", "analytics.read.owned", "analytics.read.all", "credentials.use.owned_event", "audit.read.own", "audit.read.all",
  "profile.manage.own", "notifications.read.own", "settings.manage.own", "settings.manage"
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  student: [],
  organizer: organizerPermissions,
  admin: adminPermissions,
  // Legacy data may still contain faculty rows, but faculty is not a supported login role.
  faculty: []
};

export function hasPermission(role: UserRole, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
