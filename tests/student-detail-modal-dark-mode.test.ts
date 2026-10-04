import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");

describe("Student Details modal dark mode", () => {
  it("uses theme-aware surfaces, actions, and status styles", () => {
    expect(source).toContain('border-border bg-surface text-foreground shadow-2xl');
    expect(source).toContain('bg-gradient-to-r from-primary/15 via-surface to-surface');
    expect(source).toContain('border-danger/30 bg-danger-muted text-danger');
    expect(source).toContain('border-success/30 bg-success-muted text-success');
    expect(source).toContain('border-warning/30 bg-warning-muted');
    expect(source).toContain('aria-label="Close student details"');
  });
});
