import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventRecordsPage.tsx", "utf8");

describe("Event Records organizer details", () => {
  it("reuses organizer profile data in the modal and both export types", () => {
    expect(source).toContain("const organizerDetailsById = useMemo(");
    expect(source).toContain("Organized by");
    expect(source).toContain('Organizer: event.organizerName ?? "Not available"');
    expect(source).toContain('Organizer: record.organizerName ?? "Not available"');
    expect(source).toContain('"Organizer Email": event.organizerEmail ?? "Not available"');
  });
});
