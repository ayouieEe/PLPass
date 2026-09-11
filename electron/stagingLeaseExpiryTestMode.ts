export const STAGING_LEASE_EXPIRY_SCENARIO = "lease-expiry";
export const STAGING_LEASE_DURATION_MS = 5_000;

type Environment = Record<string, string | undefined>;

export type StagingLeaseExpiryTestConfig = {
  leaseDurationMs: number;
};

/**
 * This guard is intentionally independent of renderer configuration: a
 * packaged application can never shorten its durable SQLite lease.
 */
export function resolveStagingLeaseExpiryTestConfig(
  environment: Environment,
  isPackaged: boolean
): StagingLeaseExpiryTestConfig | null {
  const scenario = environment.PLPASS_STAGING_TEST_SCENARIO;
  if (!scenario) return null;
  if (isPackaged) throw new Error("Staging lease-expiry testing is unavailable in packaged builds.");
  if (scenario !== STAGING_LEASE_EXPIRY_SCENARIO) throw new Error("Unsupported staging test scenario.");
  if (environment.PLPASS_STAGING_TEST_LEASE_MS !== String(STAGING_LEASE_DURATION_MS)) {
    throw new Error("Staging lease-expiry testing requires the fixed five-second lease.");
  }
  return { leaseDurationMs: STAGING_LEASE_DURATION_MS };
}
