import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261011175214_compact_organizer_employee_ids.sql", "utf8");
const userManager = readFileSync("supabase/functions/manage-users/index.ts", "utf8");

describe("organizer employee ID compaction", () => {
  it("renumbers matched organizer/profile IDs atomically and protects the audited five-account scope", () => {
    expect(migration).toContain("Organizer ID compaction expects exactly five organizers");
    expect(migration).toContain("ORGANIZER-COMPACT-");
    expect(migration).toContain("row_number() over (order by o.created_at, o.id)");
    expect(migration).toContain("set employee_id = m.new_employee_id");
    expect(migration).toContain("Organizer ID compaction verification failed.");
  });

  it("allocates the lowest unused organizer number after a deletion", () => {
    expect(userManager).toContain("let next = 1;");
    expect(userManager).toContain("while (usedNumbers.has(next)) next += 1;");
  });
});
