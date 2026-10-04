import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");

describe("Student Bulk Import modal dark mode", () => {
  it("uses semantic surfaces for the dialog and upload states", () => {
    expect(source).toContain('aria-label="Close bulk import modal"');
    expect(source).toContain('bg-gradient-to-r from-primary/15 via-surface to-surface');
    expect(source).toContain('border-danger/30 bg-danger-muted');
    expect(source).toContain('border-success/30 bg-success-muted');
    expect(source).toContain('border-dashed border-border bg-surface');
  });
});
