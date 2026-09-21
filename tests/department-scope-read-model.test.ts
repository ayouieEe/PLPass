import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { simulatedRepositoryRegistry } from "@/test-support/repositories";

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

  it("routes each department navigation item to its own page counterpart", () => {
    const routes = read("src/app/router/AppRouter.tsx");
    expect(routes).toContain('path={APP_ROUTES.departmentDashboard} element={<DepartmentAdminPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentEvents} element={<DepartmentEventsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentCredentials} element={<DepartmentAuthenticationMethodsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentRecords} element={<DepartmentAttendancePage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentAnalytics} element={<DepartmentAnalyticsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentReports} element={<DepartmentReportsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentAuditLogs} element={<DepartmentAuditLogsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentSystemHealth} element={<DepartmentSystemHealthPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentSettings} element={<DepartmentSettingsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentProfile} element={<AdminOrOrganizerProfilePage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentUsers} element={<OrganizerUserManagementPage />}');
    expect(routes).not.toContain('path={APP_ROUTES.departmentEvents} element={<DepartmentAdminPage />}');
    expect(routes).not.toContain('path={APP_ROUTES.departmentAnalytics} element={<DepartmentAdminPage />}');
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

  it("extends audit visibility only through department-owned actors and records", () => {
    const migration = read("supabase/migrations/20260921150000_expand_department_audit_read_scope.sql");
    expect(migration).toContain("o.profile_id = audit_logs.actor_user_id");
    expect(migration).toContain("o.department_id = (select private.current_department_id())");
    expect(migration).toContain("target_type in ('event_session', 'attendance_session')");
    expect(migration).toContain("public.qr_credentials");
    expect(migration).toContain("public.facial_profiles");
    expect(migration).toContain("for select to authenticated");
    expect(migration).not.toContain("for insert");
    expect(migration).not.toContain("for update");
    expect(migration).not.toContain("for delete");
  });

  it("fails closed on missing department context and avoids non-organizer credential lookups", () => {
    const repositories = read("src/services/supabase/repositories.ts");
    const credentials = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    const users = read("src/features/organizer/pages/OrganizerUserManagement.tsx");
    expect(repositories).toContain('context?.actorRole === "department_admin"\n      ? context.departmentId');
    expect(repositories).toContain('context?.actorRole === "department_admin" && !context.departmentId');
    expect(credentials).toContain('useEvents({ pageSize: 500 }, scope.context, actorRole === "organizer")');
    expect(users).toContain("fixedDepartmentId={isDepartmentAdmin ? session?.departmentId : undefined}");
    expect(users).toContain('row["Department Code"].trim().toLowerCase() !== dept.code.toLowerCase()');
  });

  it("scopes simulated department workspace read models to the assigned department", async () => {
    const context = { actorUserId: "department-admin-ccs", actorRole: "department_admin" as const, departmentId: "dept-ccs" };
    const [organizers, students, events, sessions, records, departments, programs] = await Promise.all([
      simulatedRepositoryRegistry.userManagement.listOrganizerProfiles({ pageIndex: 0, pageSize: 100 }, context),
      simulatedRepositoryRegistry.userManagement.listStudents({ pageIndex: 0, pageSize: 100 }, context),
      simulatedRepositoryRegistry.eventManagement.listEvents({ pageIndex: 0, pageSize: 100 }, context),
      simulatedRepositoryRegistry.attendanceSessions.listAttendanceSessions({ pageIndex: 0, pageSize: 100 }, context),
      simulatedRepositoryRegistry.attendanceRecords.listAttendanceRecords({ pageIndex: 0, pageSize: 1000 }, context),
      simulatedRepositoryRegistry.academicManagement.listDepartments({ pageIndex: 0, pageSize: 100 }, context),
      simulatedRepositoryRegistry.academicManagement.listPrograms({ pageIndex: 0, pageSize: 100 }, context)
    ]);

    expect(organizers.items.length).toBeGreaterThan(0);
    expect(organizers.items.every((profile) => profile.departmentId === context.departmentId)).toBe(true);
    expect(students.items.every((student) => student.departmentId === context.departmentId)).toBe(true);
    expect(events.items.length).toBeGreaterThan(0);
    expect(events.items.every((event) => event.departmentId === context.departmentId)).toBe(true);
    expect(sessions.items.every((session) => events.items.some((event) => event.id === session.eventId))).toBe(true);
    expect(records.items.every((record) => sessions.items.some((session) => session.id === record.sessionId))).toBe(true);
    expect(departments.items.map((department) => department.id)).toEqual([context.departmentId]);
    expect(programs.items.every((program) => program.departmentId === context.departmentId)).toBe(true);
  });

  it("fails closed in simulated department queries when department scope is absent", async () => {
    const context = { actorUserId: "department-admin-without-department", actorRole: "department_admin" as const };
    const [organizers, students, events] = await Promise.all([
      simulatedRepositoryRegistry.userManagement.listOrganizerProfiles({ pageIndex: 0, pageSize: 100 }, context),
      simulatedRepositoryRegistry.userManagement.listStudents({ pageIndex: 0, pageSize: 100 }, context),
      simulatedRepositoryRegistry.eventManagement.listEvents({ pageIndex: 0, pageSize: 100 }, context)
    ]);
    expect(organizers.items).toEqual([]);
    expect(students.items).toEqual([]);
    expect(events.items).toEqual([]);
  });
});
