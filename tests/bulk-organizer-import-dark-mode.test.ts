import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/OrganizerUserManagement.tsx", "utf8");
const organizerBulkImport = source.slice(source.indexOf("function BulkAddOrganizerModal"), source.indexOf("function EditStudentModal"));

describe("Organizer Bulk Import modal dark mode", () => {
  it("uses semantic surfaces for the dialog and upload states", () => {
    expect(organizerBulkImport).toContain('aria-label="Close bulk organizer import modal"');
    expect(organizerBulkImport).toContain('border border-border bg-surface text-foreground shadow-2xl');
    expect(organizerBulkImport).toContain('bg-gradient-to-r from-primary/15 via-surface to-surface');
    expect(organizerBulkImport).toContain('border-danger/30 bg-danger-muted');
    expect(organizerBulkImport).toContain('border-success/30 bg-success-muted');
    expect(organizerBulkImport).toContain('border-dashed border-border bg-surface');
  });
});
