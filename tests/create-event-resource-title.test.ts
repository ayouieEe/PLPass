import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const createEventPage = readFileSync("src/features/organizer/pages/CreateEventPage.tsx", "utf8");

describe("create-event resources", () => {
  it("uses a shared editable title for links and attached files", () => {
    expect(createEventPage).toContain("Link title<input");
    expect(createEventPage).toContain("File title <span");
    expect(createEventPage).toContain('placeholder="e.g. Workshop slides"');
    expect(createEventPage).toContain('title: newFileResourceTitle.trim() || file.name');
    expect(createEventPage).toContain("updatePendingResourceTitle");
    expect(createEventPage).toContain("If blank, the uploaded filename is used.");
    expect(createEventPage).toContain('aria-label="Added resources"');
  });
});
