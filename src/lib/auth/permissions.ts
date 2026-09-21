import type { UserRole } from "@/types/roles";

export const CAPABILITIES = [
  "users.read.all", "users.read.department", "users.create.student", "users.create.student.department", "users.update.student", "users.update.student.department", "users.status.manage.student", "users.status.manage.student.department", "users.sessions.revoke.student", "users.sessions.revoke.student.department", "users.create.organizer", "users.create.organizer.department", "users.create.admin", "users.status.manage", "users.status.manage.department", "users.sessions.revoke", "users.sessions.revoke.department", "users.invitation.resend", "users.invitation.resend.department",
  "events.create", "events.read.owned", "events.manage.owned", "events.read.all",
  "attendance.read.owned", "attendance.manage.owned", "attendance.read.all",
  "corrections.review.owned", "analytics.read.owned", "analytics.read.all",
  "credentials.use.owned_event", "credentials.reset.owned_event", "credentials.revoke.owned_event", "credentials.read.department", "credentials.reset", "credentials.revoke", "credentials.reset.department", "credentials.revoke.department",
  "system.settings.manage", "system.catalog.manage", "system.health.read", "system.health.read.department", "system.errors.read", "system.jobs.retry",
  "system.data_check.run", "system.cache.refresh",
  "audit.read.own", "audit.read.all", "audit.export", "profile.manage.own", "settings.manage.own", "notifications.read.own",
  "departments.read.owned", "departments.branding.manage.owned", "events.read.department",
  "attendance.read.department",
  "analytics.read.department", "audit.read.department", "audit.export.department",
  "students.read.department", "students.read.event_participant", "students.read.event_invite_directory"
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const organizerCapabilities = [
  "events.create", "events.read.owned", "events.manage.owned", "attendance.read.owned", "attendance.manage.owned",
  "corrections.review.owned", "analytics.read.owned", "credentials.use.owned_event", "credentials.reset.owned_event", "credentials.revoke.owned_event",
  "students.read.event_invite_directory",
  "audit.read.own", "audit.export", "profile.manage.own", "settings.manage.own", "notifications.read.own"
] as const satisfies readonly Capability[];

const adminCapabilities = [
  "users.read.all", "users.create.student", "users.update.student", "users.status.manage.student", "users.sessions.revoke.student", "users.create.organizer", "users.create.admin", "users.status.manage", "users.sessions.revoke", "users.invitation.resend",
  "events.read.all", "attendance.read.all", "analytics.read.all",
  "system.settings.manage", "system.catalog.manage", "system.health.read", "system.errors.read", "system.jobs.retry",
  "system.data_check.run", "system.cache.refresh",
  "credentials.reset", "credentials.revoke", "audit.read.all", "audit.export", "profile.manage.own", "notifications.read.own"
] as const satisfies readonly Capability[];

const departmentAdminCapabilities = [
  "users.read.department", "users.create.student.department", "users.update.student.department", "users.status.manage.student.department", "users.sessions.revoke.student.department", "users.create.organizer.department", "users.status.manage.department", "users.sessions.revoke.department", "users.invitation.resend.department",
  "departments.read.owned", "departments.branding.manage.owned", "events.read.department",
  "attendance.read.department",
  "analytics.read.department", "audit.read.department", "audit.export.department",
  "students.read.department", "students.read.event_participant",
  "credentials.read.department", "credentials.reset.department", "credentials.revoke.department", "system.health.read.department",
  "profile.manage.own", "notifications.read.own"
] as const satisfies readonly Capability[];

export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  student: [],
  organizer: organizerCapabilities,
  admin: adminCapabilities,
  department_admin: departmentAdminCapabilities,
  // Legacy data may still contain faculty rows, but faculty is not a supported login role.
  faculty: []
};

export function hasCapability(role: UserRole, capability: Capability) {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function hasAnyCapability(role: UserRole, capabilities: readonly Capability[]) {
  return capabilities.some((capability) => hasCapability(role, capability));
}

// Compatibility aliases for callers that still use the old permission terminology.
export const ROLE_PERMISSIONS = ROLE_CAPABILITIES;
export type Permission = Capability;
export const hasPermission = hasCapability;
