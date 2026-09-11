import { describe, expect, it, vi } from "vitest";
import { claimOneLeaseAndScheduleExit } from "../electron/stagingLeaseExpiryHarness";
import { resolveStagingLeaseExpiryTestConfig, STAGING_LEASE_DURATION_MS } from "../electron/stagingLeaseExpiryTestMode";
import { validateStagingLeaseExpiryPhase } from "@/test-support/stagingLeaseExpiryFault";

const stagingUrl = "https://fgbmbzdnrfjdudevmdcu.supabase.co";

describe("staging lease-expiry test controls", () => {
  it("permits only the fixed five-second lease in an unpackaged claim launch", () => {
    expect(resolveStagingLeaseExpiryTestConfig({ PLPASS_STAGING_TEST_SCENARIO: "lease-expiry", PLPASS_STAGING_TEST_LEASE_MS: "5000" }, false))
      .toEqual({ leaseDurationMs: STAGING_LEASE_DURATION_MS });
  });

  it("keeps ordinary and packaged builds on the default lease", () => {
    expect(resolveStagingLeaseExpiryTestConfig({}, false)).toBeNull();
    expect(() => resolveStagingLeaseExpiryTestConfig({ PLPASS_STAGING_TEST_SCENARIO: "lease-expiry", PLPASS_STAGING_TEST_LEASE_MS: "5000" }, true)).toThrow(/packaged/);
    expect(() => resolveStagingLeaseExpiryTestConfig({ PLPASS_STAGING_TEST_SCENARIO: "lease-expiry", PLPASS_STAGING_TEST_LEASE_MS: "6000" }, false)).toThrow(/five-second/);
  });

  it("rejects production, automatic sync, and an unspecified phase", () => {
    expect(() => validateStagingLeaseExpiryPhase({ mode: "staging-lease-expiry", enabled: true, phase: "claim", url: "https://ouwyhaozkqvhjalqdsvc.supabase.co", autoSyncEnabled: false })).toThrow(/production/);
    expect(() => validateStagingLeaseExpiryPhase({ mode: "staging-lease-expiry", enabled: true, phase: "claim", url: stagingUrl, autoSyncEnabled: true })).toThrow(/automatic sync/);
    expect(() => validateStagingLeaseExpiryPhase({ mode: "staging-lease-expiry", enabled: true, phase: undefined, url: stagingUrl, autoSyncEnabled: false })).toThrow(/explicit claim or recover/);
  });

  it("claims at most one row and schedules exit only after a durable claim", () => {
    const claimBatch = vi.fn().mockReturnValue({ owner: "lease", records: [{ localAttendanceUuid: "local" }] });
    const scheduleExit = vi.fn();
    expect(claimOneLeaseAndScheduleExit(claimBatch, scheduleExit)).toBe(true);
    expect(claimBatch).toHaveBeenCalledWith(1);
    expect(scheduleExit).toHaveBeenCalledOnce();
    expect(claimOneLeaseAndScheduleExit(vi.fn().mockReturnValue(null), scheduleExit)).toBe(false);
  });
});
