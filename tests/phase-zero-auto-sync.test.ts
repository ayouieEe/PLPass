import { describe, expect, it } from "vitest";
import { isAutoSyncEnabled, isForceLocalAttendanceEnabled } from "@/features/offline/autoSyncConfig";

describe("Phase 0 automatic synchronization containment", () => {
  it("keeps automatic synchronization enabled unless the emergency switch is exactly false", () => {
    expect(isAutoSyncEnabled(undefined)).toBe(true);
    expect(isAutoSyncEnabled("true")).toBe(true);
    expect(isAutoSyncEnabled("false")).toBe(false);
  });

  it("keeps forced-local recording disabled unless the operator explicitly enables it", () => {
    expect(isForceLocalAttendanceEnabled(undefined)).toBe(false);
    expect(isForceLocalAttendanceEnabled("false")).toBe(false);
    expect(isForceLocalAttendanceEnabled("true")).toBe(true);
  });
});
