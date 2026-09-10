/**
 * Phase 0 containment switch. Only the literal string "false" pauses the
 * background timer so normal installations retain their current behavior.
 */
export function isAutoSyncEnabled(value: string | undefined): boolean {
  return value !== "false";
}
