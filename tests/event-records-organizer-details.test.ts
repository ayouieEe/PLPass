import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");

describe("Event Records organizer details", () => {
  it("keeps organizer details in export headings instead of repeating them on every attendance row", () => {
    expect(source).toContain("const organizerDetailsById = useMemo(");
    expect(source).toContain("Organized by");
    expect(source).toContain('Organizer: ${event.organizerName ?? "Not available"}');
    expect(source).toContain('Organizer: ${record.organizerName ?? "Not available"}');
    expect(source).toContain("Organizer Email: ${event.organizerEmail}");
    expect(source).toContain("Organizer Email: ${record.organizerEmail}");
    expect(source).not.toContain('"Organizer Email": event.organizerEmail ?? "Not available"');
    expect(source).not.toContain('"Organizer Email": record.organizerEmail ?? "Not available"');
  });
});
