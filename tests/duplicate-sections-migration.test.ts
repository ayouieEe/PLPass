import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261010022231_prevent_duplicate_sections.sql", "utf8");

describe("duplicate section protection migration", () => {
  it("preserves referenced sections and enforces active section identity", () => {
    expect(migration).toContain("student_enrollments se where se.section_id = s.id");
    expect(migration).toContain("create unique index if not exists sections_active_identity_unique_idx");
    expect(migration).toContain("where is_active");
    expect(migration).toContain("A section with this name already exists");
  });
});
