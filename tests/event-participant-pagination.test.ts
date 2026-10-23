import { describe, expect, it, vi } from "vitest";
import { supabaseEventManagementRepository } from "@/services/supabase/repositories";

const { mockSupabaseClient } = vi.hoisted(() => ({
  mockSupabaseClient: { from: vi.fn() }
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => mockSupabaseClient
}));

describe("event participant pagination", () => {
  it("filters by event before applying the page limit", async () => {
    const rows = [
      ...Array.from({ length: 500 }, (_, index) => ({
        id: `other-${index}`,
        event_id: "other-event",
        student_id: `student-${index}`,
        participant_status: "confirmed",
        registered_at: "2026-10-23T00:00:00.000Z"
      })),
      {
        id: "target-1",
        event_id: "target-event",
        student_id: "student-target",
        participant_status: "confirmed",
        registered_at: "2026-10-23T00:00:00.000Z"
      },
      {
        id: "removed-1",
        event_id: "target-event",
        student_id: "student-removed",
        participant_status: "removed",
        registered_at: "2026-10-23T00:00:00.000Z"
      }
    ];

    const filters: Record<string, unknown> = {};
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((field: string, value: unknown) => {
        filters[field] = value;
        return builder;
      }),
      neq: vi.fn().mockImplementation((field: string, value: unknown) => {
        filters[`${field}:neq`] = value;
        return builder;
      }),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockImplementation(async (from: number, to: number) => {
        const filtered = rows.filter((row) =>
          (!filters.event_id || row.event_id === filters.event_id) &&
          (!filters["participant_status:neq"] || row.participant_status !== filters["participant_status:neq"])
        );
        return { data: filtered.slice(from, to + 1), count: filtered.length, error: null };
      })
    };
    mockSupabaseClient.from.mockReturnValue(builder);

    const result = await supabaseEventManagementRepository.listEventParticipants("target-event", { pageIndex: 0, pageSize: 500 });

    expect(result.total).toBe(1);
    expect(result.items.map((participant) => participant.id)).toEqual(["target-1"]);
    expect(builder.eq).toHaveBeenCalledWith("event_id", "target-event");
    expect(builder.neq).toHaveBeenCalledWith("participant_status", "removed");
    expect(builder.range).toHaveBeenCalledWith(0, 499);
  });
});
