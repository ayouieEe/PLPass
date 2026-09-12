import type { OfflineStatus } from "./types";

export const AUTOMATIC_SYNC_INITIAL_DELAY_MS = 15_000;

export function hasRetryableLocalAttendance(status: OfflineStatus): boolean {
  const nonRetryable = status.conflictCount + status.failedCount + status.syncingCount;
  return status.pendingCount > nonRetryable;
}

export function automaticSyncDelayMs(status: OfflineStatus, now = Date.now()): number | null {
  if (!hasRetryableLocalAttendance(status)) return null;

  const nextAttemptAt = status.nextAttemptAt ? Date.parse(status.nextAttemptAt) : Number.NaN;
  if (!Number.isFinite(nextAttemptAt) || nextAttemptAt <= now) return AUTOMATIC_SYNC_INITIAL_DELAY_MS;

  return Math.max(1_000, nextAttemptAt - now);
}
