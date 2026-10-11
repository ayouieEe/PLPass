import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");

describe("completed event summary layout", () => {
  it("uses equal columns for either five or six overview cards", () => {
    expect(source).toContain('record.attendancePopulation !== record.totalRegistered ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-5"');
  });

  it("keeps scheduled and actual session times distinct in the completed record", () => {
    expect(source).toContain("Scheduled {record.startTime} - {record.endTime}");
    expect(source).toContain("Actual session:");
    expect(source).toContain("actualStart: summary.actualStart");
    expect(source).toContain("actualEnd: summary.actualEnd");
  });

  it("keeps all result cards equal-height with independently scrollable content", () => {
    expect(source).toContain('grid gap-4 lg:grid-cols-3 lg:items-start');
    expect(source.match(/flex h-96 flex-col rounded-lg border bg-background p-4/g)).toHaveLength(3);
    expect(source.match(/min-h-0 flex-1.*overflow-y-auto overscroll-contain pr-1/g)).toHaveLength(3);
    expect(source.match(/plpass-modern-scrollbar mt-[34]/g)).toHaveLength(3);
  });

  it("keeps the completed-record banner outside its scrollable body", () => {
    expect(source).toContain('flex min-h-0 flex-col bg-muted/30');
    expect(source).toContain('plpass-modern-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6');
  });
});
