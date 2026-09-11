/**
 * Phase 0 containment switch. Only the literal string "false" pauses the
 * background timer so normal installations retain their current behavior.
 */
export function isAutoSyncEnabled(value: string | undefined): boolean {
  return value !== "false";
}

/**
 * A deliberate operator switch for controlled offline recording tests. This is
 * intentionally separate from PLPASS_AUTO_SYNC_ENABLED: pausing background
 * sync must not silently change ordinary online attendance behavior.
 */
export function isForceLocalAttendanceEnabled(value: string | undefined): boolean {
  return value === "true";
}
