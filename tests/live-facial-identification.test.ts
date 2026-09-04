import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260903034154_add_live_facial_candidate_lookup.sql",
  "utf8"
);
const attendancePage = readFileSync(
  "src/features/organizer/pages/EventAttendancePage.tsx",
  "utf8"
);
const facialService = readFileSync("api/services/facial_recognition.py", "utf8");

describe("live facial identification", () => {
  it("limits candidates and attendance writes to an authenticated organizer's active event", () => {
    expect(migration).toContain("private.is_active_organizer()");
    expect(migration).toContain("participant.participant_status <> 'removed'");
    expect(migration).toContain("session.session_status = 'ongoing'");
    expect(migration).toContain("organizer.profile_id = v_actor");
    expect(migration).toContain("facial_profile.facial_status = 'activated'");
  });

  it("keeps check-in and check-out explicit to prevent repeat-frame checkout", () => {
    expect(migration).toContain("p_action not in ('check_in', 'check_out')");
    expect(migration).toContain("p_action = 'check_in'");
    expect(attendancePage).toContain('useState<"check_in" | "check_out">("check_in")');
  });

  it("performs anti-spoofing and rejects ambiguous one-to-many matches", () => {
    expect(facialService).toContain("anti_spoofing=True");
    expect(facialService).toContain("best_score - matches[1][0] < AMBIGUITY_MARGIN");
    expect(facialService).toContain('DEEPFACE_MIN_SIMILARITY", "0.80"');
    expect(facialService).toContain("return max(MIN_SIMILARITY, model_threshold)");
    expect(facialService).toContain("get_live_facial_candidates");
  });

  it("shows the recognized student's name and recorded check-in/out times", () => {
    expect(attendancePage).toContain("student.formattedName");
    expect(attendancePage).toContain("timeIn: record.timeIn ?? record.recordedAt");
    expect(attendancePage).toContain("timeOut: record.checkedOutAt");
  });
});
