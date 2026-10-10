import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/features/student/pages/MyAttendancePage.tsx"), "utf8");
const queries = readFileSync(resolve(process.cwd(), "src/hooks/useRepositoryQueries.ts"), "utf8");
const repositories = readFileSync(resolve(process.cwd(), "src/services/supabase/repositories.ts"), "utf8");

describe("student event record flow", () => {
  it("loads the complete record stream before applying stable local pagination", () => {
    expect(page).toContain("const eventsQuery = useEvents({ pageSize: 500 }, scope.context);");
    expect(page).toContain("const sessionsQuery = useAttendanceSessions({ pageSize: 500 }, scope.context);");
    expect(page).toContain("const recordsPageCount = Math.max(1, Math.ceil(visibleRecords.length / studentRecordsPageSize));");
    expect(page).toContain("const pagedRecords = visibleRecords.slice(recordsPage * studentRecordsPageSize");
    expect(page).toContain("sortStudentEventRecords(finalizedRecords.filter");
  });

  it("keeps counters global and invalidates finalized-record summaries after feedback", () => {
    expect(page).toContain("label={`${finalizedRecords.length} completed`}");
    expect(page).toContain("recordCountByYear[group.year]");
    expect(queries).toContain("queryClient.invalidateQueries({ queryKey: [\"studentDashboardSummary\"] })");
    expect(queries).toContain("queryClient.invalidateQueries({ queryKey: [\"finalizedEventYears\"] })");
  });

  it("creates event schedules in the authoritative Manila timezone", () => {
    expect(repositories).toContain("const scheduledStart = manilaDateTimeToIso(input.date, input.startTime);");
    expect(repositories).toContain("const scheduledEnd = manilaDateTimeToIso(input.date, input.endTime);");
  });

  it("keeps the attendance session identity attached to each student record", () => {
    expect(readFileSync(resolve(process.cwd(), "src/features/student/studentExperience.ts"), "utf8"))
      .toContain("sessionId: record.sessionId,");
    expect(page).toContain("sessions.find((entry) => entry.id === selectedRecord.sessionId)");
    expect(readFileSync(resolve(process.cwd(), "src/features/student/pages/StudentEventDetailsPage.tsx"), "utf8"))
      .toContain("find((session) => session.id === currentRecord?.sessionId)");
  });

  it("shows the recording method only for complete attendance capture", () => {
    const experience = readFileSync(resolve(process.cwd(), "src/features/student/studentExperience.ts"), "utf8");
    expect(page).toContain("selectedRecord.timeIn && selectedRecord.timeOut");
    expect(page).toContain('return "QR Code"');
    expect(page).toContain('return "Manual"');
    expect(experience).toContain('if (method === "qr") return "QR Code";');
  });
});
