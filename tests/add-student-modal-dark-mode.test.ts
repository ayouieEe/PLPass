import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");

describe("Add Student modal dark mode", () => {
  it("uses theme-aware modal, field, and control tokens", () => {
    expect(source).toContain('border-border bg-surface text-foreground shadow-2xl');
    expect(source).toContain('bg-gradient-to-r from-primary/15 via-surface to-surface');
    expect(source).toContain('border border-input bg-surface px-3 text-sm text-foreground');
    expect(source).toContain('border border-input bg-muted px-3 text-sm text-muted-foreground');
    expect(source).toContain('aria-label="Close add student modal"');
  });
});
