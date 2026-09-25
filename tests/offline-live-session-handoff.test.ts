import { describe, expect, it } from "vitest";

import {
  clearOfflineLiveSessionHandoff,
  readOfflineLiveSessionHandoff,
  rememberOfflineLiveSessionHandoff
} from "@/features/offline/offlineLiveSessionHandoff";
import type { PreparedEventPackage } from "@/features/offline/types";

const organizerId = "organizer-a";
const sessionId = "session-a";

function packageFor(lifecycle: "NOT_STARTED" | "START_PENDING" | "STARTED" = "START_PENDING"): PreparedEventPackage {
  return {
    cacheVersion: 1,
    organizerProfileId: organizerId,
    event: { id: "event-a", code: "EVT-A", title: "Event A", status: "scheduled", startsAt: "2026-09-26T00:00:00.000Z", endsAt: "2026-09-26T01:00:00.000Z" },
    sessions: [{
      id: sessionId,
      eventId: "event-a",
      title: "Session A",
      venue: "Campus",
      status: "ongoing",
      startsAt: "2026-09-26T00:00:00.000Z",
      endsAt: "2026-09-26T01:00:00.000Z",
      offlineLifecycle: lifecycle
    }],
    participants: [],
    attendance: [],
    preparedAt: "2026-09-26T00:00:00.000Z"
  };
}

describe("offline live-session handoff", () => {
  it("bridges a successfully started local session only for its owner and route", () => {
    rememberOfflineLiveSessionHandoff(packageFor(), organizerId, sessionId);
    expect(readOfflineLiveSessionHandoff(organizerId, sessionId)?.event.id).toBe("event-a");
    expect(readOfflineLiveSessionHandoff("organizer-b", sessionId)).toBeNull();
    expect(readOfflineLiveSessionHandoff(organizerId, "session-b")).toBeNull();
    clearOfflineLiveSessionHandoff(organizerId, sessionId);
  });

  it("does not expose unstarted packages and clears ended routes", () => {
    rememberOfflineLiveSessionHandoff(packageFor("NOT_STARTED"), organizerId, sessionId);
    expect(readOfflineLiveSessionHandoff(organizerId, sessionId)).toBeNull();

    rememberOfflineLiveSessionHandoff(packageFor("STARTED"), organizerId, sessionId);
    clearOfflineLiveSessionHandoff(organizerId, sessionId);
    expect(readOfflineLiveSessionHandoff(organizerId, sessionId)).toBeNull();
  });
});
