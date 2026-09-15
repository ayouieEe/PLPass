import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const eventDetailsPage = readFileSync("src/features/organizer/pages/EventDetailsPage.tsx", "utf8");

describe("event participant actions", () => {
  it("keeps both participant action buttons inside a fixed-width column", () => {
    expect(eventDetailsPage).toContain('header: "Actions"');
    expect(eventDetailsPage).toContain("width: 240, minWidth: 240, maxWidth: 240");
    expect(eventDetailsPage).toContain(">View details</Button>");
    expect(eventDetailsPage).toContain(">Remove</Button>");
  });

  it("places the back link above the event title as green text", () => {
    expect(eventDetailsPage).toContain("eyebrow={");
    expect(eventDetailsPage).toContain("Back to events");
    expect(eventDetailsPage).toContain("normal-case text-sm font-medium tracking-normal text-primary");
  });
});
