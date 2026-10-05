import { beforeEach, describe, expect, it } from "vitest";
import { resetSimulatedRepositoryState, simulatedNotificationRepository } from "@/test-support/repositories";

beforeEach(() => resetSimulatedRepositoryState());

describe("notification repository role access", () => {
  it("allows department admins to read and update their own notifications", async () => {
    const context = { actorUserId: "department-admin-ccs", actorRole: "department_admin" as const, departmentId: "dept-ccs" };
    const result = await simulatedNotificationRepository.listNotifications({ pageIndex: 0, pageSize: 20 }, context);

    expect(result.items).toHaveLength(1);
    const notification = result.items[0];
    if (!notification) throw new Error("Expected a department-admin notification fixture.");
    expect(notification.code).toBe("system.exception.mock_notice");

    await expect(simulatedNotificationRepository.markNotificationRead(notification.id, context)).resolves.toMatchObject({ status: "read" });
  });
});
