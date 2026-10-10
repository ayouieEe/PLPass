import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261009171250_guard_school_year_semester_consistency.sql", "utf8");

describe("school year settings consistency migration", () => {
  it("does not retain a semester from the previous school year", () => {
    expect(migration).toContain("current_semester_id = v_semester_id");
    expect(migration).toContain("The selected semester must belong to the current school year.");
    expect(migration).toContain("where academic_year = v_school_year order by start_date, id limit 1");
  });
});
