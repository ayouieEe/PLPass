import { describe, expect, it } from "vitest";
import { resolveStagingTerminalConflictTestConfig, STAGING_TERMINAL_CONFLICT_LOCAL_UUID } from "../electron/stagingTerminalConflictTestMode";
import { configureStagingTerminalConflictSync } from "@/test-support/stagingTerminalConflictFault";

const stagingUrl = "https://fgbmbzdnrfjdudevmdcu.supabase.co";

describe("staging terminal-conflict test controls", () => {
  it("requires an explicit unpackaged process flag and fixed local UUID", () => {
    expect(resolveStagingTerminalConflictTestConfig({ PLPASS_STAGING_TEST_SCENARIO: "terminal-conflict", PLPASS_STAGING_TEST_TERMINAL_CONFLICT: "true" }, false)).toEqual({ forcedLocalAttendanceUuid: STAGING_TERMINAL_CONFLICT_LOCAL_UUID });
    expect(resolveStagingTerminalConflictTestConfig({}, false)).toBeNull();
    expect(() => resolveStagingTerminalConflictTestConfig({ PLPASS_STAGING_TEST_SCENARIO: "terminal-conflict", PLPASS_STAGING_TEST_TERMINAL_CONFLICT: "true" }, true)).toThrow(/packaged/);
  });

  it("refuses production and automatic synchronization", () => {
    expect(() => configureStagingTerminalConflictSync({ mode: "staging-terminal-conflict", enabled: true, url: "https://ouwyhaozkqvhjalqdsvc.supabase.co", autoSyncEnabled: false, requestedBatchSize: 1 })).toThrow(/production/);
    expect(() => configureStagingTerminalConflictSync({ mode: "staging-terminal-conflict", enabled: true, url: stagingUrl, autoSyncEnabled: true, requestedBatchSize: 1 })).toThrow(/automatic sync/);
  });
});
