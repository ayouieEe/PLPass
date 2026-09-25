import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/features/organizer/pages/EventManagementPage.tsx"),
  "utf8",
);

describe("manual live attendance routing", () => {
  it("records cached participants through the desktop offline attendance queue", () => {
    expect(page).toContain('identifyOfflineStudent(eventId, "manual", manualInput)');
    expect(page).toContain('identificationMethod: "manual"');
    expect(page).toContain("recordOfflineAttendance({");
  });

  it("retains a typed valid student number as an offline walk-in", () => {
    expect(page).toContain("valid walk-in student number");
    expect(page).toContain("api.queueWalkInScan({");
    expect(page).toContain("identificationMethod: \"manual\"");
  });

  it("does not fall through to the server lookup when a prepared desktop package rejects the entry", () => {
    expect(page).toContain("const preparedLocally = Boolean(");
    expect(page).toContain("if (preparedLocally) {");
    expect(page).toContain("could not be saved locally");
  });

  it("submits manual attendance from either input with Enter", () => {
    expect(page).toContain("onSubmit={(event) => {");
    expect(page).toContain("event.preventDefault();");
    expect(page).toContain("void submitManualAttendance();");
    expect(page).toContain('onKeyDown={(event) => {');
    expect(page).toContain('event.key !== "Enter" || event.nativeEvent.isComposing');
    expect(page).toContain('<Button type="submit" className="h-11 rounded-lg px-6">');
  });

  it("opens the Manual form with the student field ready for Time In or Time Out", () => {
    expect(page).toContain("function activateManualCapture()");
    expect(page).toContain("window.requestAnimationFrame(() => manualInputRef.current?.focus())");
    expect(page).toContain("ref={manualInputRef}");
  });
});
