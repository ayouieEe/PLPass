import { describe, expect, it } from "vitest";

import {
  hasValidEventSchedule,
  shouldDisplayInEventTab,
  type EventRecord
} from "@/features/organizer/utils/eventManagement";
import { eventFormSchemaWithObjectives } from "@/features/organizer/pages/CreateEventPage";

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

  it("allows exactly three required objectives and optional extra objectives", () => {
    const valid = {
      code: "EVT-2026-001",
      title: "Career Fair",
      category: "Seminar",
      institutionalCategory: "Academic or Training",
      participationStatus: "Mandatory",
      targetGroup: "University-wide",
      venue: "Auditorium",
      date: "2026-09-14",
      startTime: "09:00",
      endTime: "11:00",
      description: "Campus career event",
      remarks: "",
      priorityLevel: "Flexible",
      impactScore: 6,
      fixedPriority: false,
      requestedBy: "Jane Doe",
      collegeOffice: "Career Services",
      numberOfPax: 120,
      resourceTitle: "",
      resourceUrl: "",
      objectives: [
        { value: "Build student awareness" },
        { value: "Improve internship readiness" },
        { value: "Connect employers with students" },
        { value: "" }
      ]
    };

    expect(eventFormSchemaWithObjectives.safeParse(valid).success).toBe(true);
  });
});
