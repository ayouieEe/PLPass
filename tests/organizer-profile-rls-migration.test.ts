import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasCapability } from "@/lib/auth/permissions";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260921161000_scope_organizer_profile_reads.sql"),
  "utf8"
);

describe("organizer profile RLS migration", () => {
  it("declares and consumes the cross-college invitation-directory capability", () => {
    expect(hasCapability("organizer", "students.read.event_invite_directory")).toBe(true);
    const repository = readFileSync(resolve(process.cwd(), "src/services/supabase/repositories.ts"), "utf8");
    expect(repository).toContain("hasCapability(\"organizer\", \"students.read.event_invite_directory\")");
    expect(repository).toContain("organizer_list_invitation_students");
  });

  it("limits direct profile reads to active self, active admin, or owned-event participants", () => {
    expect(migration).toContain("drop policy if exists profiles_read on public.profiles");
    expect(migration).toContain("id = (select auth.uid())");
    expect(migration).toContain("private.is_active_user()");
    expect(migration).toContain("private.is_active_admin()");
    expect(migration).toContain("private.organizer_can_access_student(s.id)");
  });

  it("uses an organizer-only minimal invitation RPC instead of global direct student reads", () => {
    expect(migration).toContain("public.organizer_list_invitation_students(");
    expect(migration).toContain("An active organizer account is required.");
    expect(migration).toContain("least(greatest(coalesce(p_limit, 20), 1), 1000)");
    expect(migration).toContain("revoke all on function public.organizer_list_invitation_students");
    expect(migration).toContain("grant execute on function public.organizer_list_invitation_students");
    expect(migration).toContain("drop policy if exists students_read on public.students");
    expect(migration).toContain("private.organizer_can_access_student(id)");
  });

  it("does not let organizers list other organizers and blocks inactive self reads", () => {
    expect(migration).toContain("drop policy if exists organizers_read on public.organizers");
    const organizerPolicy = migration.split("create policy organizers_read")[1]?.split("-- An inactive account")[0] ?? "";
    expect(organizerPolicy).not.toContain("private.is_active_organizer()");
    expect(migration).toMatch(/profile_id = \(select auth\.uid\(\)\)[\s\S]*?private\.is_active_user\(\)/);
    expect(migration).toContain("department_id = (select private.current_department_id())");
  });
});
