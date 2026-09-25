import { describe, expect, it } from "vitest";
import { formatDateTime, formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";

describe("date display formatting", () => {
  const timestamp = "2026-09-25T00:30:00.000Z";

  it("uses the shared Manila date and time format", () => {
    expect(formatDateTime(timestamp)).toBe("Sep 25, 2026, 8:30 AM");
    expect(formatDisplayDate(timestamp)).toBe("Sep 25, 2026");
    expect(formatDisplayTime(timestamp)).toBe("08:30 AM");
  });

  it("uses a safe fallback for invalid values", () => {
    expect(formatDateTime("not-a-date")).toBe("N/A");
    expect(formatDisplayDate(undefined)).toBe("Not scheduled");
    expect(formatDisplayTime(null)).toBe("Not set");
  });
});
