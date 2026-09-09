import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  hasValidEventSchedule,
  shouldDisplayInEventTab,
  type EventRecord
} from "@/features/organizer/utils/eventManagement";
import { dateKey } from "@/lib/utils/date";

const eventManagementPage = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");
const attendanceStartMigration = readFileSync(
  "supabase/migrations/20260909113720_allow_owned_events_to_start_attendance_without_approval.sql",
  "utf8"
);

describe("event page validation helpers", () => {
  it("rejects incomplete event schedules", () => {
    expect(hasValidEventSchedule({ date: "2026-09-14", startTime: "", endTime: "04:00" })).toBe(false);
    expect(hasValidEventSchedule({ date: "2026-09-14", startTime: "02:00", endTime: "04:00" })).toBe(true);
  });

  it("keeps past events out of incoming when they have no attendance session", () => {
    const event = {
      id: "evt-1",
      code: "EVT-1",
      name: "Past Event",
      category: "General",
      venue: "AVR 1",
      date: "2026-08-10",
      startTime: "02:00",
      endTime: "04:00",
      status: "incoming",
      priorityLevel: "Flexible",
      impactScore: null,
      predictedTurnout: "0%",
      objectives: []
    } satisfies EventRecord;

    expect(shouldDisplayInEventTab(event, "incoming", {
      activeEventCode: undefined,
      cancelledCodes: [],
      completedCodes: new Set(),
      sessionsList: []
    })).toBe(false);
  });

  it("keeps the Philippine calendar date when ISO timestamps are stored in UTC", () => {
    expect(dateKey("2026-08-30T16:00:00.000Z")).toBe("2026-08-31");
    expect(dateKey("2026-08-31T00:00:00.000Z")).toBe("2026-08-31");
  });

  it("runs facial verification in the active event workspace", () => {
    expect(eventManagementPage).toContain("identifyLiveFace(");
    expect(eventManagementPage).toContain("Live facial verification camera preview");
    expect(eventManagementPage).not.toContain("navigate(APP_ROUTES.organizerSession(resolvedLiveSessionId))");
    expect(eventManagementPage).toContain("No active attendance session is available for facial verification.");
  });

  it("allows an organizer to start an owned active event without approval", () => {
    expect(eventManagementPage).not.toContain("awaiting approval and cannot start attendance");
    expect(attendanceStartMigration).not.toContain("approval_status = 'approved'");
    expect(attendanceStartMigration).not.toContain("approval_status <> 'approved'");
    expect(attendanceStartMigration).toContain("v_event.organizer_id <> private.current_organizer_id()");
    expect(attendanceStartMigration).toContain("v_event.event_status in ('completed', 'cancelled')");
  });
});
