import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");

describe("manual attendance inputs", () => {
  it("uses theme-aware input surfaces", () => {
    expect(source).toMatch(/placeholder="Enter student ID, name, or walk-in student number"\s+className="(?=[^"]*border-input)(?=[^"]*bg-surface)(?=[^"]*text-foreground)(?=[^"]*placeholder:text-muted-foreground)/);
    expect(source).toMatch(/placeholder="Explain why manual capture is needed"\s+className="(?=[^"]*border-input)(?=[^"]*bg-surface)(?=[^"]*text-foreground)(?=[^"]*placeholder:text-muted-foreground)/);
  });
});
