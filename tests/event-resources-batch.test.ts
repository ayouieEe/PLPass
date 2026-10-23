import { describe, expect, it, vi } from "vitest";
import { supabaseEventManagementRepository } from "@/services/supabase/repositories";

const { mockSupabaseClient } = vi.hoisted(() => ({
  mockSupabaseClient: { from: vi.fn() }
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => mockSupabaseClient
}));

describe("batched event resources", () => {
  it("loads only the displayed events' resources in one query", async () => {
    const rows = [
      { id: "resource-1", event_id: "event-1", resource_title: "Slides", external_url: "https://example.com/slides" },
      { id: "resource-2", event_id: "event-2", resource_title: "Handout", storage_bucket: "event-resources", storage_object_path: "event-2/handout.pdf" },
      { id: "resource-3", event_id: "other-event", resource_title: "Hidden", external_url: "https://example.com/hidden" }
    ];
    let eventIds: readonly string[] = [];
    const builder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockImplementation((_column: string, ids: readonly string[]) => {
        eventIds = ids;
        return builder;
      }),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockImplementation(async (from: number, to: number) => {
        const filtered = rows.filter((row) => eventIds.includes(row.event_id));
        return { data: filtered.slice(from, to + 1), count: filtered.length, error: null };
      })
    };
    mockSupabaseClient.from.mockReturnValue(builder);

    const result = await supabaseEventManagementRepository.listEventResourcesForEvents(["event-1", "event-2", "event-1"], { pageIndex: 0, pageSize: 500 });

    expect(builder.in).toHaveBeenCalledWith("event_id", ["event-1", "event-2"]);
    expect(result.total).toBe(2);
    expect(result.items.map((resource) => resource.id)).toEqual(["resource-1", "resource-2"]);
  });
});
