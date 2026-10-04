import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");

describe("event management filters", () => {
  it("uses Create Event options and applies priority filtering to every event tab", () => {
    expect(source).toContain("EVENT_VENUE_OPTIONS");
    expect(source).toContain("EVENT_CATEGORY_OPTIONS");
    expect(source).toContain('const priority = event.priorityLevel ?? "Flexible"');
    expect(source).toContain("matchesEventFilters(event, eventFilters)");
  });
});
