import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("non-visual attendance alternatives", () => {
  it("keeps camera-based biometric UI absent while retaining manual alternatives", () => {
    const studentMethods = readFileSync(resolve(process.cwd(), "src/features/student/pages/AttendanceMethodsPage.tsx"), "utf8");
    const organizerAttendance = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventAttendancePage.tsx"), "utf8");

    expect(studentMethods).not.toContain("facial");
    expect(studentMethods).not.toContain("faceDescriptor");
    expect(organizerAttendance).not.toContain("facial");
    expect(organizerAttendance).toContain("Manual");
  });
});
