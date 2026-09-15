import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const eventDetailsPage = readFileSync("src/features/organizer/pages/EventDetailsPage.tsx", "utf8");

describe("event details resources", () => {
  it("separates link and file titles so each action is clear", () => {
    expect(eventDetailsPage).toContain("const [resourceFileTitle, setResourceFileTitle]");
    expect(eventDetailsPage).toContain("Link title<input");
    expect(eventDetailsPage).toContain("File title <span");
    expect(eventDetailsPage).toContain("uploadEventFileResource(eventId, resourceFileTitle, file)");
    expect(eventDetailsPage).toContain(">Choose file</Button>");
  });
});
