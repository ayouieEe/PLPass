import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");

describe("event management modal dark mode", () => {
  it("uses semantic surfaces for reschedule and event-attention notices", () => {
    expect(source).toContain('border-info/30 bg-info-muted p-3 text-sm text-foreground');
    expect(source).toContain('bg-warning-muted text-warning');
    expect(source).toContain('border-warning/30 bg-warning-muted p-4 text-sm text-foreground');
  });

  it("keeps reschedule as the primary event-attention action", () => {
    expect(source).toContain(">More actions</summary>");
    expect(source).toContain("onClick={() => setEventAttention(null)}>Remind me later</button>");
    expect(source).toContain("onClick={() => { setConfirmCancelEvent(eventAttention); setEventAttention(null); }}>Cancel event</button>");
    expect(source).toContain('<Button type="button" onClick={() => { setEditEvent(eventAttention); setEventAttention(null); }}>Reschedule</Button>');
  });
});
