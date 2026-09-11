import { describe, expect, it } from "vitest";
import { configureStagingLostResponseSync, shouldInjectStagingLostResponse } from "@/test-support/stagingLostResponseFault";

describe("staging lost-response fault adapter", () => {
  const stagingUrl = "https://fgbmbzdnrfjdudevmdcu.supabase.co";

  it("activates only once for explicit staging-fault mode and staging host", () => {
    expect(shouldInjectStagingLostResponse({ mode: "staging-fault", enabled: true, url: stagingUrl, alreadyInjected: false })).toBe(true);
    expect(shouldInjectStagingLostResponse({ mode: "staging-fault", enabled: true, url: stagingUrl, alreadyInjected: true })).toBe(false);
  });

  it("rejects production mode, a disabled flag, and every non-staging host", () => {
    expect(shouldInjectStagingLostResponse({ mode: "production", enabled: true, url: stagingUrl, alreadyInjected: false })).toBe(false);
    expect(shouldInjectStagingLostResponse({ mode: "staging-fault", enabled: false, url: stagingUrl, alreadyInjected: false })).toBe(false);
    expect(shouldInjectStagingLostResponse({ mode: "staging-fault", enabled: true, url: "https://ouwyhaozkqvhjalqdsvc.supabase.co", alreadyInjected: false })).toBe(false);
  });

  it("caps an armed manual staging sync to one record", () => {
    expect(configureStagingLostResponseSync({ mode: "staging-fault", enabled: true, url: stagingUrl, autoSyncEnabled: false, requestedBatchSize: 20 })).toBe(1);
  });

  it("fails closed for production, other projects, and automatic sync", () => {
    expect(() => configureStagingLostResponseSync({ mode: "staging-fault", enabled: true, url: "https://ouwyhaozkqvhjalqdsvc.supabase.co", autoSyncEnabled: false, requestedBatchSize: 20 })).toThrow(/production/);
    expect(() => configureStagingLostResponseSync({ mode: "staging-fault", enabled: true, url: "https://different.supabase.co", autoSyncEnabled: false, requestedBatchSize: 20 })).toThrow(/approved staging/);
    expect(() => configureStagingLostResponseSync({ mode: "staging-fault", enabled: true, url: stagingUrl, autoSyncEnabled: true, requestedBatchSize: 20 })).toThrow(/automatic sync/);
  });

  it("does not alter ordinary production-mode batch behavior", () => {
    expect(configureStagingLostResponseSync({ mode: "production", enabled: true, url: "https://ouwyhaozkqvhjalqdsvc.supabase.co", autoSyncEnabled: true, requestedBatchSize: 20 })).toBe(20);
  });
});
