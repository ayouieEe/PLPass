import type { OfflineStatus } from "./types";

export const AUTOMATIC_SYNC_INITIAL_DELAY_MS = 15_000;

export function automaticSyncDelayMs(status: OfflineStatus, now = Date.now()): number | null {
  const retryable = status.pendingCount - status.conflictCount - status.syncingCount;
  if (retryable <= 0) return null;
  const nextAttemptAt = status.nextAttemptAt ? Date.parse(status.nextAttemptAt) : Number.NaN;
  if (!Number.isFinite(nextAttemptAt) || nextAttemptAt <= now) return AUTOMATIC_SYNC_INITIAL_DELAY_MS;
  return Math.max(1_000, nextAttemptAt - now);
}
