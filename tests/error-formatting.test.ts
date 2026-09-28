import { describe, expect, it } from "vitest";
import { formatUserErrorMessage } from "@/lib/utils/errors";

describe("database migration error formatting", () => {
  it("does not expose a missing attendance-origin column to organizers", () => {
    expect(formatUserErrorMessage("column attendance_records.attendance_origin does not exist"))
      .toBe("The system is currently updating. Please refresh the page or try again in a few moments.");
  });
});
