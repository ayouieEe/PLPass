import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261009173100_university_admin_student_progression.sql", "utf8");
const settingsMigration = readFileSync("supabase/migrations/20261009173258_require_explicit_school_year_semester.sql", "utf8");
const transitionMigration = readFileSync("supabase/migrations/20261010102000_atomic_school_year_transition.sql", "utf8");

describe("student progression migrations", () => {
  it("protects the workflow with enrollment history, preview, and university-admin checks", () => {
    expect(migration).toContain("create table public.student_enrollments");
    expect(migration).toContain("admin_preview_student_progression");
    expect(migration).toContain("admin_apply_student_progression");
    expect(migration).toContain("Only university administrators can advance students.");
    expect(migration).toContain("s.student_status = 'enrolled' and s.year_level < 8");
    expect(migration).toContain("No matching next-year section");
  });

  it("casts preview columns to the declared RPC result types", () => {
    const fix = readFileSync("supabase/migrations/20261010100000_fix_student_progression_preview_types.sql", "utf8");
    const transitionFix = readFileSync("supabase/migrations/20261010025436_fix_student_progression_return_types.sql", "utf8");
    expect(fix).toContain("s.student_id::text");
    expect(fix).toContain("(s.year_level + 1)::smallint");
    expect(fix).toContain("sec.section_name::text");
    expect(transitionFix).toContain("s.year_level::smallint");
    expect(transitionFix).toContain("(s.year_level + 1)::smallint");
  });

  it("requires an explicitly selected semester from the selected school year", () => {
    expect(settingsMigration).toContain("admin_prepare_school_year_semesters");
    expect(settingsMigration).toContain("Select a semester belonging to the selected school year before saving.");
    expect(settingsMigration).toContain("The selected semester must belong to the current school year.");
  });

  it("makes the next-year setting change and student progression one guarded transaction", () => {
    expect(transitionMigration).toContain("admin_transition_school_year");
    expect(transitionMigration).toContain("Promotion stopped: no matching section");
    expect(transitionMigration).toContain("admin.school_year_transition.applied");
    expect(transitionMigration).toContain("Use Student progression to change the school year safely.");
  });
});
