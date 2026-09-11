import { describe, expect, it, vi } from "vitest";
import { createTwoPartyBarrier } from "../electron/stagingConcurrentWindowHarness";
import { resolveStagingConcurrentWindowTestConfig } from "../electron/stagingConcurrentWindowTestMode";
import { validateStagingConcurrentWindowTest } from "@/test-support/stagingConcurrentWindowFault";

const stagingUrl = "https://fgbmbzdnrfjdudevmdcu.supabase.co";

describe("staging concurrent-window test controls", () => {
  it("requires the explicit unpackaged process flag", () => {
    expect(resolveStagingConcurrentWindowTestConfig({ PLPASS_STAGING_TEST_SCENARIO: "concurrent-window", PLPASS_STAGING_TEST_CONCURRENT_WINDOW: "true" }, false)).toEqual({ concurrentWindow: true });
    expect(resolveStagingConcurrentWindowTestConfig({}, false)).toBeNull();
    expect(() => resolveStagingConcurrentWindowTestConfig({ PLPASS_STAGING_TEST_SCENARIO: "concurrent-window", PLPASS_STAGING_TEST_CONCURRENT_WINDOW: "true" }, true)).toThrow(/packaged/);
    expect(() => resolveStagingConcurrentWindowTestConfig({ PLPASS_STAGING_TEST_SCENARIO: "concurrent-window" }, false)).toThrow(/explicit process flag/);
  });

  it("rejects production and automatic sync", () => {
    expect(() => validateStagingConcurrentWindowTest({ mode: "staging-concurrent-window", enabled: true, url: "https://ouwyhaozkqvhjalqdsvc.supabase.co", autoSyncEnabled: false })).toThrow(/production/);
    expect(() => validateStagingConcurrentWindowTest({ mode: "staging-concurrent-window", enabled: true, url: stagingUrl, autoSyncEnabled: true })).toThrow(/automatic sync/);
  });

  it("releases exactly two joined renderers and times out a singleton", async () => {
    vi.useFakeTimers();
    const pair = createTwoPartyBarrier(1_000);
    await expect(Promise.all([pair(), pair()])).resolves.toEqual([true, true]);
    const alone = pair(); vi.advanceTimersByTime(1_000);
    await expect(alone).resolves.toBe(false);
    vi.useRealTimers();
  });
});
