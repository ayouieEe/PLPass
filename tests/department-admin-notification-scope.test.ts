import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261005090000_repair_department_admin_notification_scope.sql",
  "utf8"
);

describe("department-admin notification scope repair", () => {
  it("uses admin profile department scope for creation and event-start recipients", () => {
    expect(migration).toContain("left join public.admin_profiles ap on ap.profile_id = p.id");
    expect(migration).toContain("coalesce(p.department_id, ap.department_id)");
    expect(migration).toContain("p.role = 'department_admin' and coalesce(p.department_id, ap.department_id) = v_event.department_id");
  });
});
