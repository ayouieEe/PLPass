import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("authoritative organizer audit logging", () => {
  it("records an online session end only in the server-side lifecycle procedure", () => {
    expect(read("src/features/organizer/pages/EventManagementPage.tsx")).not.toContain('action: "Ended Live Session"');
    expect(read("src/features/organizer/pages/EventAttendancePage.tsx")).not.toContain('action: "Ended Live Session"');
    expect(read("supabase/migrations/20260927080321_finalize_completed_attendance_on_session_end.sql"))
      .toContain("'attendance_session.ended', 'event_session', p_session_id");
  });

  it("does not client-log manual attendance already logged by the server procedure", () => {
    expect(read("src/features/organizer/pages/EventAttendancePage.tsx")).not.toContain('action: "Submitted Manual Attendance"');
    expect(read("supabase/migrations/20260828120000_fix_manual_attendance_checkout_late_reason.sql"))
      .toContain("'attendance.manual_recorded'");
  });
});
