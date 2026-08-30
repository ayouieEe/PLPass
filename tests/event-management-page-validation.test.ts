import { describe, expect, it } from "vitest";

import {
  hasValidEventSchedule,
  shouldDisplayInEventTab,
  type EventRecord
} from "@/features/organizer/utils/eventManagement";
import { dateKey } from "@/lib/utils/date";

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
});
