import { createTwoPartyBarrier } from "./stagingConcurrentWindowHarness.js";
import { resolveStagingConcurrentWindowTestConfig } from "./stagingConcurrentWindowTestMode.js";

export const resolveConfig = resolveStagingConcurrentWindowTestConfig;
export const createBarrier = () => createTwoPartyBarrier(45_000);
