import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("department read-model coverage", () => {
  it("adds department report and audit routes without event controls", () => {
    const routes = read("src/app/router/AppRouter.tsx");
    const navigation = read("src/lib/constants/navigation.ts");
    expect(routes).toContain("APP_ROUTES.departmentReports");
    expect(routes).toContain("APP_ROUTES.departmentAuditLogs");
    expect(navigation).toContain('capability: "reports.read.department"');
    expect(navigation).toContain('capability: "audit.read.department"');
    expect(navigation).not.toContain("events.manage.department");
  });

  it("scopes reports to department organizers and audit logs to department-owned targets", () => {
    const migration = read("supabase/migrations/20260920140000_add_department_report_audit_read_scope.sql");
    expect(migration).toContain("o.department_id = (select private.current_department_id())");
    expect(migration).toContain("target_type = 'event'");
    expect(migration).toContain("target_type = 'event_session'");
    expect(migration).toContain("target_type = 'attendance_record'");
    expect(migration).toContain("target_type = 'event_participant'");
    expect(migration).toContain("for select to authenticated");
    expect(migration).not.toContain("for insert");
    expect(migration).not.toContain("for update");
    expect(migration).not.toContain("for delete");
  });
});
