import type { UserRole } from "@/types/roles";

export const CAPABILITIES = [
  "users.read.all", "users.create.organizer", "users.create.admin", "users.status.manage", "users.sessions.revoke",
  "events.create", "events.read.owned", "events.manage.owned", "events.read.all",
  "attendance.read.owned", "attendance.manage.owned", "attendance.read.all",
  "corrections.review.owned", "analytics.read.owned", "analytics.read.all",
  "reports.read.owned", "reports.read.all", "credentials.use.owned_event", "credentials.reset", "credentials.revoke",
  "system.settings.manage", "system.catalog.manage", "system.health.read", "system.errors.read", "system.jobs.retry",
  "system.data_check.run", "system.cache.refresh", "attendance.session.recover",
  "audit.read.own", "audit.read.all", "audit.export", "profile.manage.own", "settings.manage.own", "notifications.read.own"
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const organizerCapabilities = [
  "events.create", "events.read.owned", "events.manage.owned", "attendance.read.owned", "attendance.manage.owned",
  "corrections.review.owned", "reports.read.owned", "analytics.read.owned", "credentials.use.owned_event",
  "audit.read.own", "profile.manage.own", "settings.manage.own", "notifications.read.own"
] as const satisfies readonly Capability[];

const adminCapabilities = [
  "users.read.all", "users.create.organizer", "users.create.admin", "users.status.manage", "users.sessions.revoke",
  "events.read.all", "attendance.read.all", "analytics.read.all", "reports.read.all",
  "system.settings.manage", "system.catalog.manage", "system.health.read", "system.errors.read", "system.jobs.retry",
  "system.data_check.run", "system.cache.refresh", "attendance.session.recover",
  "credentials.reset", "credentials.revoke", "audit.read.all", "audit.export", "profile.manage.own", "notifications.read.own"
] as const satisfies readonly Capability[];

export const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  student: [],
  organizer: organizerCapabilities,
  admin: adminCapabilities,
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
