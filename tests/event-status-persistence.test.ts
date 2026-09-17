import { describe, expect, it } from "vitest";

import { mapEvent } from "@/lib/supabase/mappers";

describe("persisted event lifecycle status", () => {
  it("preserves an ongoing database event status", () => {
    const event = mapEvent({
      id: "event-ongoing",
      event_code: "EVT-ONGOING",
      organizer_id: "organizer-1",
      title: "Ongoing Event",
      venue: "PLP Gymnasium",
      starts_at: "2026-09-17T01:00:00.000Z",
      ends_at: "2026-09-17T04:00:00.000Z",
      event_status: "ongoing",
      approval_status: "approved"
    });

    expect(event.status).toBe("ongoing");
  });
});
