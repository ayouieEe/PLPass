import { beforeEach, describe, expect, it } from "vitest";
import { repositories } from "@/services/repositories";
import { resetSimulatedRepositoryState } from "@/test-support/repositories";
import type { RepositoryContext } from "@/services/repositoryUtils";

const adminContext: RepositoryContext = { actorUserId: "user-admin-1", actorRole: "admin" };
const organizerContext: RepositoryContext = { actorUserId: "user-organizer-1", actorRole: "organizer" };
const ccsDepartmentAdminContext: RepositoryContext = { actorUserId: "department-admin-ccs", actorRole: "department_admin", departmentId: "dept-ccs" };
const cbaDepartmentAdminContext: RepositoryContext = { actorUserId: "department-admin-cba", actorRole: "department_admin", departmentId: "dept-cba" };

beforeEach(() => resetSimulatedRepositoryState());

describe("admin system health", () => {
  it("reports a healthy baseline alongside failed-job and stuck-session state", async () => {
    const snapshot = await repositories.systemHealth.getHealthSnapshot(adminContext);

    expect(snapshot.checks.every((check) => check.status === "healthy")).toBe(true);
    expect(snapshot.recentErrors.map((issue) => issue.referenceId)).toContain("report-3");
    expect(snapshot.failedNotifications.map((job) => job.id)).toContain("notification-job-1");
    expect(snapshot.stuckSessions.map((session) => session.id)).toContain("session-2");
  });

  it("enforces admin-only access and reason-gated recovery actions", async () => {
    await expect(repositories.systemHealth.getHealthSnapshot(organizerContext)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(repositories.systemHealth.retryFailedNotification({ jobId: "notification-job-1", source: "event_email", reason: " " }, adminContext)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const retried = await repositories.systemHealth.retryFailedNotification({ jobId: "notification-job-1", source: "event_email", reason: "Provider outage resolved." }, adminContext);
    expect(retried.status).toBe("retrying");

    const recovered = await repositories.systemHealth.recoverAttendanceSession({ sessionId: "session-2", reason: "Closing an abandoned session after verification." }, adminContext);
    expect(recovered.status).toBe("completed");
    const afterRecovery = await repositories.systemHealth.getHealthSnapshot(adminContext);
    expect(afterRecovery.failedNotifications).toHaveLength(0);
    expect(afterRecovery.stuckSessions).toHaveLength(0);
  });

  it("scopes Department Admin health and retry controls to that department's event jobs", async () => {
    const ccsSnapshot = await repositories.systemHealth.getHealthSnapshot(ccsDepartmentAdminContext);
    const cbaSnapshot = await repositories.systemHealth.getHealthSnapshot(cbaDepartmentAdminContext);

    expect(ccsSnapshot.recentErrors).toHaveLength(0);
    expect(ccsSnapshot.failedNotifications.map((job) => job.eventId)).toEqual(["event-1"]);
    expect(cbaSnapshot.failedNotifications).toHaveLength(0);
    await expect(repositories.systemHealth.retryFailedNotification({ jobId: "notification-job-1", source: "event_email", reason: "Retry after provider recovery." }, cbaDepartmentAdminContext)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    const retried = await repositories.systemHealth.retryFailedNotification({ jobId: "notification-job-1", source: "event_email", reason: "Retry after provider recovery." }, ccsDepartmentAdminContext);
    expect(retried.status).toBe("retrying");
  });

  it("records controlled actions in the audit log", async () => {
    await repositories.systemHealth.runDataConsistencyCheck(adminContext);
    const audit = await repositories.auditLogs.listAuditLogs({ pageIndex: 0, pageSize: 50 }, adminContext);
    expect(audit.items.map((entry) => entry.action)).toEqual(expect.arrayContaining(["system.data_consistency_check"]));
  });
});
