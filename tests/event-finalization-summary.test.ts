import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("event finalization summary", () => {
  it("derives the summary from the records finalized by the RPC without a follow-up REST read", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"),
      "utf8"
    );
    const endSessionBody = source.slice(source.indexOf("const endSession = useCallback"), source.indexOf("async function openTimeOut"));

    expect(endSessionBody).toContain("attendanceRecords.map((record) => ({");
    expect(endSessionBody).toContain("attendanceStatus: record.status");
    expect(endSessionBody).not.toContain('.from("attendance_records")');
  });
});
