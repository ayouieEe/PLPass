import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("department audit-log isolation", () => {
  it("limits department-admin reads to their own actor or local organizers and students", () => {
    const migration = read("supabase/migrations/20260923174717_scope_department_audit_logs_to_local_actors.sql");

    expect(migration).toContain("audit_logs.actor_user_id = (select auth.uid())");
    expect(migration).toContain("organizer.profile_id = audit_logs.actor_user_id");
    expect(migration).toContain("student.profile_id = audit_logs.actor_user_id");
    expect(migration).toContain("organizer.department_id = (select private.current_department_id())");
    expect(migration).toContain("student.department_id = (select private.current_department_id())");
    expect(migration).not.toContain("target_type = 'event'");
  });

  it("does not offer University Admin in a Department Admin's role filter", () => {
    const page = read("src/features/organizer/pages/OrganizerAuditLogsPage.tsx");

    expect(page).toContain('const DEPARTMENT_AUDIT_ACTOR_ROLE_OPTIONS = ["department_admin", "organizer", "student"]');
    expect(page).toContain("if (isDepartmentAdmin) return DEPARTMENT_AUDIT_ACTOR_ROLE_OPTIONS");
  });
});
