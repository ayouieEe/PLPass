import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");

describe("event record filters", () => {
  it("uses Create Event options and safely filters legacy records without a priority", () => {
    expect(source).toContain("EVENT_VENUE_OPTIONS");
    expect(source).toContain("EVENT_CATEGORY_OPTIONS");
    expect(source).toContain('const eventPriority = event.priorityLevel ?? "Flexible"');
    expect(source).toContain("eventPriority === priorityFilter");
  });
});
