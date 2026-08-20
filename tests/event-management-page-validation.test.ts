import { describe, expect, it } from "vitest";

import {
  hasValidEventSchedule,
  shouldDisplayInEventTab
} from "@/features/organizer/pages/EventManagementPage";
import { resolveEventAttendanceCode } from "@/features/organizer/hooks/useEventAttendance";

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
    } as any;

    expect(shouldDisplayInEventTab(event, "incoming", {
      activeEventCode: undefined,
      cancelledCodes: [],
      completedCodes: new Set(),
      sessionsList: []
    })).toBe(false);
  });

  it("uses the persisted event code for attendance rows", () => {
    expect(resolveEventAttendanceCode({ "event-id": "EVT-2026-001" }, "event-id")).toBe("EVT-2026-001");
    expect(resolveEventAttendanceCode({}, "event-id")).toBe("event-id");
  });
});
