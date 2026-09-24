import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardPage = readFileSync("src/features/organizer/pages/OrganizerDashboardPage.tsx", "utf8");

describe("organizer dashboard prediction overview", () => {
  it("keeps the total-events metric inclusive of completed event records", () => {
    expect(dashboardPage).toContain("const totalEventCount = eventsQuery.data?.total ?? events.length");
    expect(dashboardPage).toContain("value={totalEventCount.toLocaleString()}");
    expect(dashboardPage).toContain("to={routes.records}");
  });

  it("pages forecast bars in the same ten-event groups used by analytics", () => {
    expect(dashboardPage).toContain("const predictionPageSize = 10");
    expect(dashboardPage).toContain("paginatedPredictionData");
    expect(dashboardPage).toContain("Previous prediction page");
    expect(dashboardPage).toContain("Next prediction page");
    expect(dashboardPage).toContain("Showing {activePredictionPage * predictionPageSize + 1}");
  });

  it("opens the organizer tab when an admin dashboard organizer metric is selected", () => {
    const userManagementPage = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");

    expect(dashboardPage).toContain('`${routes.users}?tab=organizers`');
    expect(userManagementPage).toContain('searchParams.get("tab")');
    expect(userManagementPage).toContain('requestedTab === "organizers"');
  });
});
