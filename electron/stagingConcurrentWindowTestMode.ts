export const STAGING_CONCURRENT_WINDOW_SCENARIO = "concurrent-window";

type Environment = Record<string, string | undefined>;

export type StagingConcurrentWindowTestConfig = { concurrentWindow: true };

export function resolveStagingConcurrentWindowTestConfig(
  environment: Environment,
  isPackaged: boolean
): StagingConcurrentWindowTestConfig | null {
  const scenario = environment.PLPASS_STAGING_TEST_SCENARIO;
  if (!scenario) return null;
  if (isPackaged) throw new Error("Staging concurrent-window testing is unavailable in packaged builds.");
  if (scenario !== STAGING_CONCURRENT_WINDOW_SCENARIO) throw new Error("Unsupported staging test scenario.");
  if (environment.PLPASS_STAGING_TEST_CONCURRENT_WINDOW !== "true") {
    throw new Error("Staging concurrent-window testing requires its explicit process flag.");
  }
  return { concurrentWindow: true };
}
