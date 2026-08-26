import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("priority four post-session workflows", () => {
  it("keeps completed event records authoritative to Supabase", () => {
    const source = read("src/features/organizer/pages/EventRecordsPage.tsx");
    expect(source).not.toContain("loadOrganizerUiState");
    expect(source).toContain("repositoryCompletedEventsWithAttendance");
  });

  it("does not merge local correction request fixtures", () => {
    const source = read("src/features/organizer/pages/OrganizerCorrectionRequestsPage.tsx");
    expect(source).not.toContain("const storeRequests");
    expect(source).toContain("await reviewMutation.mutateAsync");
    expect(source).toContain("req.requestedAt.slice(0, 10)");
  });

  it("builds organizer analytics from repository queries", () => {
    const source = read("src/features/organizer/pages/OrganizerAnalyticsPage.tsx");
    expect(source).not.toContain("loadOrganizerUiState");
    expect(source).toContain("useAttendanceSessions");
    expect(source).toContain("useAttendanceRecords");
    expect(source).toContain("useEvents");
  });
});
