import { describe, expect, it } from "vitest";
import { sortCompletedEventsNewestFirst } from "@/features/organizer/utils/completedEventOrdering";

describe("completed event history ordering", () => {
  it("puts the event with the most recent scheduled finish first without mutating the input", () => {
    const older = { code: "OLD", startsAt: "2026-09-01T09:00:00Z", endsAt: "2026-09-01T10:00:00Z" };
    const newer = { code: "NEW", startsAt: "2026-09-10T09:00:00Z", endsAt: "2026-09-10T10:00:00Z" };
    const input = [older, newer];

    const result = sortCompletedEventsNewestFirst(input);

    expect(result.map((event) => event.code)).toEqual(["NEW", "OLD"]);
    expect(input).toEqual([older, newer]);
  });

  it("uses the start date when a finish timestamp is unavailable", () => {
    const events = [
      { code: "OLDER", startsAt: "2026-09-01T09:00:00Z" },
      { code: "NEWER", startsAt: "2026-09-10T09:00:00Z" },
    ];

    expect(sortCompletedEventsNewestFirst(events).map((event) => event.code)).toEqual(["NEWER", "OLDER"]);
  });
});
