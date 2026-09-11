import type { SyncClaim } from "../src/features/offline/types.js";

export function claimOneLeaseAndScheduleExit(
  claimBatch: (limit: number) => SyncClaim | null,
  scheduleExit: () => void
): boolean {
  const claim = claimBatch(1);
  if (!claim?.records.length) return false;
  scheduleExit();
  return true;
}
