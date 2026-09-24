import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("privileged RPC hardening migration", () => {
  it("removes direct authenticated access from internal-only helpers", () => {
    const migration = readFileSync(resolve("supabase/migrations/20260923173741_restrict_internal_rpc_execution.sql"), "utf8");

    expect(migration).toContain("revoke execute on function public.create_organizer_event");
    expect(migration).toContain("revoke execute on function public.finalize_event_attendance_session");
    expect(migration).toContain("revoke execute on function public.identify_event_participant_by_face");
    expect(migration).toContain("from authenticated");
  });
});
