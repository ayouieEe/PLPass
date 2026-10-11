import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261012000200_normalize_student_table_name_format.sql", "utf8");

describe("student table name format migration", () => {
  it("updates every server payload that can populate a student table without changing its access boundary", () => {
    expect(migration).toContain("create or replace function public.prepare_offline_event_package");
    expect(migration).toContain("create or replace function public.organizer_list_credential_directory");
    expect(migration).toContain("create or replace function public.record_approved_event_walkin");
    expect(migration).toContain("concat_ws(', ', p.last_name, p.first_name)");
    expect(migration).toContain("grant execute on function public.prepare_offline_event_package(uuid) to authenticated");
    expect(migration).toContain("grant execute on function public.organizer_list_credential_directory() to authenticated");
    expect(migration).toContain("grant execute on function public.record_approved_event_walkin(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text) to authenticated");
  });
});
