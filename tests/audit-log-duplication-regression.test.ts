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

  it("does not client-log event publication already logged by the server procedure", () => {
    expect(read("src/features/organizer/pages/CreateEventPage.tsx")).not.toContain('action: "Published Event"');
    expect(read("supabase/migrations/20261004090000_guard_event_code_and_participant_schedule.sql"))
      .toContain("'event.published'");
  });

  it("does not client-log correction decisions already logged by the server procedure", () => {
    const page = read("src/features/organizer/pages/OrganizerCorrectionRequestsPage.tsx");
    expect(page).not.toContain('action: decision.status === "approved" ? "Approved Correction Request"');
    expect(read("supabase/migrations/20260814081157_synchronize_cross_role_workflows.sql"))
      .toContain("'attendance_request.' || p_status");
  });

  it("does not client-log student edits already logged by the account-management function", () => {
    expect(read("src/features/organizer/pages/OrganizerUserManagement.tsx")).not.toContain('onSuccess("Updated Student Details"');
    expect(read("supabase/functions/manage-users/index.ts")).toContain('"user.student_updated"');
  });
});
