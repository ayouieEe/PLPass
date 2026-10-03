import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");

describe("offline status column", () => {
  it("uses the grid adapter sizing metadata and keeps long statuses intact", () => {
    expect(source).toMatch(/header: "Offline status",\s+meta: \{ agGrid: \{ width: 224, minWidth: 224, flex: 0 \} \}/);
    expect(source).toContain('className="whitespace-nowrap"><StatusBadge label="Preparing offline package"');
  });
});
