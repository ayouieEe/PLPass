import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("From/To date restrictions", () => {
  it("restricts analytics To date to the selected From date", () => {
    const page = readFileSync("src/features/organizer/pages/OrganizerAnalyticsPage.tsx", "utf8");
    expect(page).toContain("min={startDate || undefined}");
    expect(page).toContain("handleStartDateChange(e.target.value)");
    expect(page).toContain("if (nextStartDate && endDate && endDate < nextStartDate)");
  });

  it("restricts audit-log To date to the selected From date", () => {
    const page = readFileSync("src/features/organizer/pages/OrganizerAuditLogsPage.tsx", "utf8");
    expect(page).toContain("min={customStartDate || undefined}");
    expect(page).toContain("handleCustomStartDateChange(e.target.value)");
    expect(page).toContain("if (nextStartDate && customEndDate && customEndDate < nextStartDate)");
  });
});
