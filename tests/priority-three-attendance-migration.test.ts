import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260825144415_organizer_live_attendance_lifecycle.sql"),
  "utf8"
);

describe("Priority 3 live attendance migration", () => {
  it("prevents multiple active sessions for one event", () => {
    expect(migration).toMatch(/event_sessions_one_live_session_idx[\s\S]+where session_status = 'ongoing'/i);
  });

  it("owner-scopes privileged attendance functions", () => {
    expect(migration).toMatch(/start_event_attendance_session[\s\S]+private\.is_active_organizer\(\)/i);
    expect(migration).toMatch(/record_manual_event_attendance[\s\S]+organizer_id = private\.current_organizer_id\(\)/i);
    expect(migration).toMatch(/end_event_attendance_session[\s\S]+organizer_id = private\.current_organizer_id\(\)/i);
  });

  it("requires reasons and reconciles missing participants", () => {
    expect(migration).toMatch(/manual attendance reason of at least 5 characters is required/i);
    expect(migration).toMatch(/ending reason of at least 5 characters is required/i);
    expect(migration).toMatch(/automatically marked absent when session ended/i);
  });

  it("revokes public execution and grants authenticated access explicitly", () => {
    expect(migration).toMatch(/revoke all on function public\.start_event_attendance_session[\s\S]+from public, anon/i);
    expect(migration).toMatch(/grant execute on function public\.record_manual_event_attendance[\s\S]+to authenticated/i);
  });
});
