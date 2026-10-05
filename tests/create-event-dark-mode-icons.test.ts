import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/CreateEventPage.tsx", "utf8");

describe("Create Event dark-mode semantic icons", () => {
  it("uses warning theme tokens for schedule-conflict feedback", () => {
    expect(source).toContain('border-warning/30 bg-warning-muted');
    expect(source).toContain('AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning"');
    expect(source).not.toContain("text-amber-700");
  });
});
