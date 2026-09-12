import { describe, expect, it } from "vitest";
import { automaticSyncDelayMs, AUTOMATIC_SYNC_INITIAL_DELAY_MS, hasRetryableLocalAttendance } from "@/features/offline/autoSyncPolicy";
import type { OfflineStatus } from "@/features/offline/types";

const status = (overrides: Partial<OfflineStatus> = {}): OfflineStatus => ({
  runtimeAvailable: true,
  connectivity: "online",
  packageStatus: "READY",
  pendingCount: 0,
  retryCount: 0,
  conflictCount: 0,
  failedCount: 0,
  syncingCount: 0,
  ...overrides
});

describe("offline automatic-sync policy", () => {
  it("does not schedule connectivity checks when there is no retryable local work", () => {
    expect(hasRetryableLocalAttendance(status())).toBe(false);
    expect(automaticSyncDelayMs(status())).toBeNull();
    expect(automaticSyncDelayMs(status({ pendingCount: 1, conflictCount: 1 }))).toBeNull();
    expect(automaticSyncDelayMs(status({ pendingCount: 1, failedCount: 1 }))).toBeNull();
  });

  it("keeps the existing first automatic attempt delay for eligible work", () => {
    expect(automaticSyncDelayMs(status({ pendingCount: 1 }), 1_000)).toBe(AUTOMATIC_SYNC_INITIAL_DELAY_MS);
  });

  it("waits until a retry backoff is due instead of polling during the backoff", () => {
    expect(automaticSyncDelayMs(status({ pendingCount: 1, retryCount: 1, nextAttemptAt: "1970-01-01T00:01:00.000Z" }), 1_000)).toBe(59_000);
  });
});
