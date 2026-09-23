import { describe, expect, it } from "vitest";
import { getStudentDashboardEvents } from "@/features/student/studentExperience";
import type { AttendanceSession, Event } from "@/types/domain";

const now = Date.parse("2026-09-23T07:30:00.000Z");

function eventFixture(overrides: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    code: "EVT-2026-001",
    title: "Attendance orientation",
    description: "",
    category: "Orientation",
    venue: "Auditorium",
    startsAt: "2026-09-23T07:00:00.000Z",
    endsAt: "2026-09-23T08:00:00.000Z",
    status: "approved",
    organizerId: "organizer-1",
    departmentId: "dept-ccs",
    priorityLevel: "Flexible",
    impactScore: null,
    predictedTurnout: null,
    ...overrides
  };
}

function sessionFixture(status: AttendanceSession["status"]): AttendanceSession {
  return {
    id: "session-1",
    type: "event",
    eventId: "event-1",
    title: "Attendance orientation",
    mode: "required",
    status,
    startsAt: "2026-09-23T07:00:00.000Z",
    endsAt: "2026-09-23T08:00:00.000Z",
    createdByUserId: "organizer-1"
  };
}

describe("student dashboard event state", () => {
  it("does not show an ended attendance session as ongoing while its scheduled window remains open", () => {
    expect(getStudentDashboardEvents([eventFixture()], [sessionFixture("completed")], now)).toEqual([]);
  });

  it("shows an active attendance session as ongoing", () => {
    expect(getStudentDashboardEvents([eventFixture()], [sessionFixture("active")], now)).toMatchObject([
      { id: "event-1", dashboardStatus: "Ongoing" }
    ]);
  });

  it("keeps future scheduled events in the upcoming list", () => {
    expect(getStudentDashboardEvents([
      eventFixture({ startsAt: "2026-09-24T07:00:00.000Z", endsAt: "2026-09-24T08:00:00.000Z" })
    ], [sessionFixture("draft")], now)).toMatchObject([
      { id: "event-1", dashboardStatus: "Upcoming" }
    ]);
  });
});
