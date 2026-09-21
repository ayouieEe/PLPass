import { describe, expect, it } from "vitest";
import { CAPABILITIES, hasCapability } from "@/lib/auth/permissions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("department-admin permission contract", () => {
  it("grants only the declared department scope and personal capabilities", () => {
    expect(hasCapability("department_admin", "departments.read.owned")).toBe(true);
    expect(hasCapability("department_admin", "departments.branding.manage.owned")).toBe(true);
    expect(hasCapability("department_admin", "events.read.department")).toBe(true);
    expect(hasCapability("department_admin", "attendance.read.department")).toBe(true);
    expect(hasCapability("department_admin", "students.read.department")).toBe(true);
    expect(hasCapability("department_admin", "profile.manage.own")).toBe(true);
    expect(hasCapability("department_admin", "notifications.read.own")).toBe(true);

    expect(hasCapability("department_admin", "events.create")).toBe(false);
    expect(hasCapability("department_admin", "events.manage.owned")).toBe(false);
    expect(hasCapability("department_admin", "users.read.all")).toBe(false);
    expect(hasCapability("department_admin", "system.settings.manage")).toBe(false);
    expect(hasCapability("department_admin", "audit.read.all")).toBe(false);
    expect(hasCapability("department_admin", "credentials.reset")).toBe(false);
  });

  it("keeps the coordinator as a desktop subsystem, not an account role", () => {
    expect(CAPABILITIES).not.toContain("coordinator.manage");
    expect(read("src/features/offline/ScannerStationsPanel.tsx")).toContain("ScannerCoordinatorStatus");
    expect(read("electron/scannerCoordinator.ts")).toContain("class ScannerCoordinator");
  });

  it("requires the department scope helpers and RLS boundaries before deployment", () => {
    const migration = read("supabase/migrations/20260920120000_add_department_admin_scope.sql");
    expect(migration).toContain("private.is_active_department_admin()");
    expect(migration).toContain("private.current_department_id()");
    expect(migration).toContain("department_id = (select private.current_department_id())");
    expect(migration).toContain("drop policy if exists admin_profiles_read_all");
    expect(migration).toContain("revoke all on public.admin_profiles from anon");
  });

  it("keeps department user management on a department-only route", () => {
    const routes = read("src/lib/constants/routes.ts");
    const navigation = read("src/lib/constants/navigation.ts");
    const router = read("src/app/router/AppRouter.tsx");

    expect(routes).toContain('departmentUsers: "/department/users"');
    expect(navigation).toContain("path: APP_ROUTES.departmentUsers");
    expect(router).toContain("path={APP_ROUTES.departmentUsers} element={<OrganizerUserManagementPage />}");
    expect(router).toContain("path={APP_ROUTES.adminUsers} element={<OrganizerUserManagementPage />}");
  });
});
