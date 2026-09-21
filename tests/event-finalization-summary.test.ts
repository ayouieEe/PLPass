import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("event finalization summary", () => {
  it("keeps attendance with pending feedback out of the final outcome counts", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"),
      "utf8"
    );
    const endSessionBody = source.slice(source.indexOf("const endSession = useCallback"), source.indexOf("async function openTimeOut"));

    expect(endSessionBody).toContain("activeRows.map((row) => ({");
    expect(endSessionBody).toContain("isFinalized: row.isFinalized");
    expect(endSessionBody).toContain("checkOutAt: row.checkOutAt");
    expect(endSessionBody).not.toContain('.from("attendance_records")');
  });
});
