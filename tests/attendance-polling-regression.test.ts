import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("attendance polling safeguards", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"),
    "utf8"
  );

  it("keeps live attendance reads scoped to an active session", () => {
    expect(source).toContain("sessionId: activeScannerSessionId");
    expect(source).toContain("activeScannerSessionId ? context : undefined");
  });

  it("does not reintroduce a timer-based attendance refresh", () => {
    expect(source).not.toContain("setInterval(() => { void refreshPhoneAttendance(); }, 1000)");
  });
});
