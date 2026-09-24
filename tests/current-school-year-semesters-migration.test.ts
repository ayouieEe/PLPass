import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260923161451_ensure_current_school_year_semesters.sql", "utf8");

describe("current school year semester migration", () => {
  it("backfills standard semesters and maintains them when the school year changes", () => {
    expect(migration).toContain("create or replace function private.ensure_current_school_year_semesters()");
    expect(migration).toContain("after insert or update of current_school_year on public.system_settings");
    expect(migration).toContain("'First Semester'");
    expect(migration).toContain("'Midyear Semester'");
    expect(migration).toContain("'Second Semester'");
    expect(migration).toContain("on conflict do nothing");
  });
});
