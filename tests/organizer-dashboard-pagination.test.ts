import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardPage = readFileSync("src/features/organizer/pages/OrganizerDashboardPage.tsx", "utf8");

describe("organizer dashboard prediction overview", () => {
  it("pages forecast bars in the same ten-event groups used by analytics", () => {
    expect(dashboardPage).toContain("const predictionPageSize = 10");
    expect(dashboardPage).toContain("paginatedPredictionData");
    expect(dashboardPage).toContain("Previous prediction page");
    expect(dashboardPage).toContain("Next prediction page");
    expect(dashboardPage).toContain("Showing {activePredictionPage * predictionPageSize + 1}");
  });
});
