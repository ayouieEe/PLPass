export const STAGING_TERMINAL_CONFLICT_SCENARIO = "terminal-conflict";
export const STAGING_TERMINAL_CONFLICT_LOCAL_UUID = "11111111-1111-4111-8111-111111111111";

type Environment = Record<string, string | undefined>;

export type StagingTerminalConflictTestConfig = { forcedLocalAttendanceUuid: string };

/** A packaged app can never be instructed to generate a controlled local UUID. */
export function resolveStagingTerminalConflictTestConfig(environment: Environment, isPackaged: boolean): StagingTerminalConflictTestConfig | null {
  const scenario = environment.PLPASS_STAGING_TEST_SCENARIO;
  if (!scenario) return null;
  if (isPackaged) throw new Error("Staging terminal-conflict testing is unavailable in packaged builds.");
  if (scenario !== STAGING_TERMINAL_CONFLICT_SCENARIO) throw new Error("Unsupported staging test scenario.");
  if (environment.PLPASS_STAGING_TEST_TERMINAL_CONFLICT !== "true") throw new Error("Staging terminal-conflict testing requires its explicit process flag.");
  return { forcedLocalAttendanceUuid: STAGING_TERMINAL_CONFLICT_LOCAL_UUID };
}
