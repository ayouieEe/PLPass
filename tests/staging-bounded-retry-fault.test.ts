import { describe, expect, it } from "vitest";
import { configureStagingBoundedRetrySync } from "@/test-support/stagingBoundedRetryFault";

const stagingUrl = "https://fgbmbzdnrfjdudevmdcu.supabase.co";

describe("staging bounded-retry test controls", () => {
  it("caps the test batch at one record", () => {
    expect(configureStagingBoundedRetrySync({ mode: "staging-bounded-retry", enabled: true, url: stagingUrl, autoSyncEnabled: false, requestedBatchSize: 20 })).toBe(1);
  });

  it("refuses production and automatic synchronization", () => {
    expect(() => configureStagingBoundedRetrySync({ mode: "staging-bounded-retry", enabled: true, url: "https://ouwyhaozkqvhjalqdsvc.supabase.co", autoSyncEnabled: false, requestedBatchSize: 1 })).toThrow(/production/);
    expect(() => configureStagingBoundedRetrySync({ mode: "staging-bounded-retry", enabled: true, url: stagingUrl, autoSyncEnabled: true, requestedBatchSize: 1 })).toThrow(/automatic sync/);
  });
});
