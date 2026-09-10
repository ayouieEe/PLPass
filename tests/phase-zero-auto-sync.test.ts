import { describe, expect, it } from "vitest";
import { isAutoSyncEnabled } from "@/features/offline/autoSyncConfig";

describe("Phase 0 automatic synchronization containment", () => {
  it("keeps automatic synchronization enabled unless the emergency switch is exactly false", () => {
    expect(isAutoSyncEnabled(undefined)).toBe(true);
    expect(isAutoSyncEnabled("true")).toBe(true);
    expect(isAutoSyncEnabled("false")).toBe(false);
  });
});
