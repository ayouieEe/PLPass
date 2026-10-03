import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");

describe("completed event summary layout", () => {
  it("uses equal columns for either five or six overview cards", () => {
    expect(source).toContain('record.attendancePopulation !== record.totalRegistered ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-5"');
  });
});
