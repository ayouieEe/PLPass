import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPostgresUuid, postgresUuidValues } from "@/lib/utils/postgresUuid";

describe("PostgREST UUID query guards", () => {
  it("allows canonical PostgreSQL UUIDs and excludes mock identifiers", () => {
    const uuid = "2d0f04b1-9185-4d42-a38b-22d540c0bb4e";
    expect(isPostgresUuid(uuid)).toBe(true);
    expect(isPostgresUuid("event-1")).toBe(false);
    expect(postgresUuidValues(["event-1", uuid, uuid, "event-2"])).toEqual([uuid]);
  });

  it("keeps invalid event identifiers away from every bulk analytics request", () => {
    const analytics = readFileSync(resolve(process.cwd(), "src/features/organizer/hooks/useOrganizerDashboardAnalytics.ts"), "utf8");
    const attendance = readFileSync(resolve(process.cwd(), "src/features/organizer/hooks/useEventAttendance.ts"), "utf8");
    const records = readFileSync(resolve(process.cwd(), "src/features/organizer/pages/EventRecordsPage.tsx"), "utf8");
    expect(analytics).toContain("events.filter((event) => isPostgresUuid(event.id))");
    expect(attendance).toContain("const remoteEventIds = postgresUuidValues(eventIds);");
    expect(records).toContain("const eventIds = postgresUuidValues(");
  });
});
