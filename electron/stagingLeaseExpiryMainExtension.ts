import { claimOneLeaseAndScheduleExit } from "./stagingLeaseExpiryHarness.js";
import { resolveStagingLeaseExpiryTestConfig } from "./stagingLeaseExpiryTestMode.js";

// Compiled only by tsconfig.electron.staging-lease-expiry.json. Normal desktop
// builds contain neither this IPC implementation nor its staging test guard.
export const resolveConfig = resolveStagingLeaseExpiryTestConfig;
export { claimOneLeaseAndScheduleExit };
