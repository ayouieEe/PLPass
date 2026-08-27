import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("non-visual camera alternatives", () => {
  it("labels and describes student and organizer live camera previews", () => {
    const studentMethods = readFileSync(resolve(process.cwd(), "src/features/student/pages/AttendanceMethodsPage.tsx"), "utf8");
    const organizerAttendance = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventAttendancePage.tsx"), "utf8");

    expect(studentMethods).toContain('aria-label="Live facial enrollment camera preview"');
    expect(studentMethods).toContain('aria-describedby="face-camera-instructions"');
    expect(studentMethods).toContain("If the camera is unavailable, use the file fallback.");
    expect(organizerAttendance).toContain('aria-label="Live facial verification camera preview"');
    expect(organizerAttendance).toContain('aria-describedby="organizer-face-camera-instructions"');
    expect(organizerAttendance).toContain("Use QR or manual attendance if camera verification is unavailable.");
  });
});
