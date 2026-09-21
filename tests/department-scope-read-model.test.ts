import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { simulatedRepositoryRegistry } from "@/test-support/repositories";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("department read-model coverage", () => {
  it("omits the removed Reports page while retaining department audit logs", () => {
    const routes = read("src/app/router/AppRouter.tsx");
    const navigation = read("src/lib/constants/navigation.ts");
    expect(routes).toContain("APP_ROUTES.departmentAuditLogs");
    expect(routes).not.toContain("departmentReports");
    expect(navigation).not.toContain('label: "Reports"');
    expect(navigation).toContain('capability: "audit.read.department"');
    expect(navigation).not.toContain("events.manage.department");
  });

  it("routes each department navigation item to its own page counterpart", () => {
    const routes = read("src/app/router/AppRouter.tsx");
    expect(routes).toContain('path={APP_ROUTES.departmentDashboard} element={<OrganizerDashboardPage workspace="department" />}');
    expect(routes).toContain('path={APP_ROUTES.departmentEvents} element={<EventManagementPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentCredentials} element={<DepartmentAuthenticationMethodsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentRecords} element={<EventRecordsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentAnalytics} element={<OrganizerAnalyticsPage />}');
    expect(routes).not.toContain("departmentReports");
    expect(routes).toContain('path={APP_ROUTES.departmentAuditLogs} element={<OrganizerAuditLogsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentSystemHealth} element={<DepartmentSystemHealthPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentSettings} element={<DepartmentSettingsPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentProfile} element={<AdminOrOrganizerProfilePage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentUsers} element={<OrganizerUserManagementPage />}');
    expect(routes).toContain('path={APP_ROUTES.departmentStudents} element={<Navigate to={APP_ROUTES.departmentUsers} replace />}');
    expect(routes).toContain('path={APP_ROUTES.departmentAttendance} element={<Navigate to={APP_ROUTES.departmentRecords} replace />}');
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

  it("stamps organizer events with their department and keeps department monitoring read-only", () => {
    const migration = read("supabase/migrations/20260921062223_department_event_read_scope_and_admin_monitor.sql");
    const eventPage = read("src/features/organizer/pages/EventManagementPage.tsx");
    const adminHealth = read("src/features/admin/pages/AdminSystemHealthPage.tsx");
    const permissions = read("src/lib/auth/permissions.ts");

    expect(migration).toContain("set department_id = o.department_id");
    expect(migration).toContain("before insert or update of organizer_id, department_id on public.events");
    expect(migration).toContain("'events', 'event_participants'");
    expect(migration).toContain("'admin_read_' || table_name");
    expect(migration).toContain("for select to authenticated using ((select private.is_active_admin()))");
    expect(migration).not.toContain("for all to authenticated");
    expect(migration).toContain("drop policy if exists %I on public.%I");
    expect(migration).toContain("revoke all on function public.admin_finish_event(uuid, text) from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.admin_recover_attendance_session(uuid, text) from public, anon, authenticated");
    expect(eventPage).toContain('aria-label="Read-only live event monitor"');
    expect(eventPage).toContain("Organizers retain all event and attendance controls.");
    expect(eventPage).toContain("if (!isReadOnlyMonitor || !resolvedLiveSessionId) return");
    expect(eventPage).toContain('const isReadOnlyMonitor = isAdmin || isDepartmentAdmin');
    expect(eventPage).toContain("APP_ROUTES.departmentEvents : APP_ROUTES.adminEvents");
    expect(eventPage).toContain("if (!canManageOwnedEvents) {");
    expect(eventPage).toContain("Refresh monitor");
    const adminCapabilities = permissions.slice(permissions.indexOf("const adminCapabilities"), permissions.indexOf("const departmentAdminCapabilities"));
    expect(adminCapabilities).not.toContain("attendance.session.recover");
    expect(adminHealth).not.toContain("Recover session</button>");
    expect(adminHealth).not.toContain("Finish event</button>");
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
