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
    expect(hasCapability("department_admin", "credentials.reset.department")).toBe(true);
    expect(hasCapability("department_admin", "credentials.revoke.department")).toBe(true);
    expect(hasCapability("organizer", "credentials.reset.department")).toBe(false);
    expect(hasCapability("organizer", "credentials.reset.owned_event")).toBe(true);
    expect(hasCapability("organizer", "credentials.revoke.owned_event")).toBe(true);
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

  it("limits department-admin credential mutations to students in their assigned department", () => {
    const migration = read("supabase/migrations/20260921162000_department_admin_manage_department_credentials.sql");
    const repository = read("src/services/supabase/repositories.ts");
    const page = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");

    expect(migration).toContain("public.department_admin_issue_qr_credential");
    expect(migration).toContain("s.department_id = (select private.current_department_id())");
    expect(migration).toContain("private.is_active_department_admin()");
    expect(migration).toContain("revoke all on function public.department_admin_issue_qr_credential");
    expect(migration).not.toMatch(/returns table\s*\([^)]*token_hash/is);
    expect(repository).toContain('client.rpc("department_admin_issue_qr_credential"');
    expect(repository).toContain('"credentials.reset.department" : "credentials.revoke.department"');
    expect(page).toContain("Reissue QR");
    expect(page).not.toContain("credentialActions");
    expect(page).toContain("canResetCredentials");
    expect(page).toContain("canRevokeCredentials");
    expect(read("src/features/department/pages/DepartmentWorkspacePages.tsx")).toContain("return <AuthenticationMethodsPage />;");
  });

  it("loads only visible department students' attendance and credential summaries", () => {
    const page = read("src/features/organizer/pages/OrganizerUserManagement.tsx");

    expect(page).toContain("const departmentStudentIds = useMemo(");
    expect(page).toContain("student.departmentId === session?.departmentId");
    expect(page).toContain("useAttendanceRecords({ pageSize: 100 }, scope.context)");
    expect(page).toContain("useStudentCredentialStatuses(scope.context, departmentStudentIds)");
    expect(page).not.toContain("useAttendanceRecords({ pageSize: 100 }, scope.context, !isDepartmentAdmin)");
    expect(page).not.toContain("useStudentCredentialStatuses(scope.context, undefined, !isDepartmentAdmin)");
  });

  it("blocks production releases when linked Supabase migration history is missing or drifted", () => {
    const preflight = read("scripts/release-preflight.mjs");
    expect(preflight).toContain('checkLinkedSupabaseReadiness(productionProjectRef)');
    expect(preflight).toContain('"run", "check:supabase:linked"');
    expect(preflight).toContain("does not match supabase/config.toml project_id");
    expect(preflight).toContain("Linked Supabase readiness failed for production project");
  });

  it("qualifies status columns that collide with department QR RPC output variables", () => {
    const migration = read("supabase/migrations/20260921163000_fix_department_qr_issue_ambiguous_status.sql");
    expect(migration).toContain("update public.qr_credentials as q");
    expect(migration).toMatch(/where q\.student_id = p_student_id and q\.credential_status = 'activated'/);
  });
});
