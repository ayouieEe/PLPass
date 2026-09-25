import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");

describe("event record date range controls", () => {
  it("prevents a To date before the selected From date", () => {
    expect(page).toContain('min={fromDate || undefined}');
    expect(page).toContain('onChange={(event) => handleFromDateChange(event.target.value)}');
  });

  it("clears an invalid existing To date when From date moves later", () => {
    expect(page).toContain('if (nextFromDate && toDate && toDate < nextFromDate)');
    expect(page).toContain('setToDate("");');
  });
});
