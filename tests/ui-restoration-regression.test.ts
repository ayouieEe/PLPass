import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync("src/index.css", "utf8");
const brandingPage = readFileSync("src/features/department/pages/DepartmentWorkspacePages.tsx", "utf8");
const recordsPage = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");
const createEventPage = readFileSync("src/features/organizer/pages/CreateEventPage.tsx", "utf8");

describe("restored organizer UI improvements", () => {
  it("keeps shared headings and the department preview theme-aware", () => {
    expect(styles).toContain("h1,\n  h2,\n  h3,\n  h4 {\n    text-transform: capitalize;");
    expect(brandingPage).toContain("bg-[var(--department-preview-secondary)] p-5 dark:bg-surface-muted");
    expect(brandingPage).not.toContain('style={{ backgroundColor: secondaryColor || "#e8f1e6" }}');
  });

  it("uses the Create Event choices in Event Records and groups review editing actions", () => {
    expect(recordsPage).toContain("EVENT_CATEGORY_OPTIONS");
    expect(recordsPage).toContain("EVENT_VENUE_OPTIONS");
    expect(createEventPage).toContain("<summary className=");
    expect(createEventPage).toContain("Edit event details");
    expect(createEventPage).toContain("Edit participants");
  });
});
