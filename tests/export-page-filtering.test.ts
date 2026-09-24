import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("page-filtered report exports", () => {
  it("removes modal filter controls from every report export modal", () => {
    for (const path of [
      "src/features/organizer/pages/EventRecordsPage.tsx",
      "src/features/organizer/pages/OrganizerAnalyticsPage.tsx",
      "src/features/organizer/pages/AuthenticationMethodsPage.tsx",
      "src/features/organizer/pages/OrganizerUserManagement.tsx",
      "src/features/organizer/pages/OrganizerCorrectionRequestsPage.tsx"
    ]) {
      expect(read(path), path).not.toContain("Scope & Filters");
    }
  });

  it("keeps exports available without filters and uses page-filtered datasets", () => {
    for (const path of [
      "src/features/organizer/pages/EventRecordsPage.tsx",
      "src/features/organizer/pages/OrganizerAnalyticsPage.tsx",
      "src/features/organizer/pages/AuthenticationMethodsPage.tsx",
      "src/features/organizer/pages/OrganizerUserManagement.tsx",
      "src/features/organizer/pages/OrganizerCorrectionRequestsPage.tsx"
    ]) {
      expect(read(path), path).not.toContain("Apply at least one filter before exporting.");
    }
    expect(read("src/features/organizer/pages/EventRecordsPage.tsx")).toContain("filteredRecords={pastEvents}");
    expect(read("src/features/organizer/pages/OrganizerCorrectionRequestsPage.tsx")).toContain("requests={filteredRequests}");
  });

  it("groups detailed attendance exports by event with an event header", () => {
    const page = read("src/features/organizer/pages/EventRecordsPage.tsx");
    const utils = read("src/features/organizer/utils/exportUtils.ts");
    expect(page).toContain("exportTabularReportSections");
    expect(page).toContain('name: `${event.code} — ${event.name}`');
    expect(page).toContain("true, collegeName ? { collegeName } : undefined");
    expect(read("src/lib/exports/reportExport.ts")).toContain("options.showSectionHeaders");
    expect(utils).toContain("sections: ReportExportSection[]");
  });
});
