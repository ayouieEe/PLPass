import { describe, expect, it } from "vitest";
import type { AuditLog } from "@/types/domain";
import { getAuditLogDetailItems } from "@/features/organizer/utils/auditLogUtils";

describe("audit log detail presentation", () => {
  it("keeps safe change details and excludes technical or sensitive metadata", () => {
    const items = getAuditLogDetailItems({
      id: "log-1",
      actorUserId: "user-1",
      action: "event.rescheduled",
      targetType: "event",
      targetId: "event-1",
      timestamp: "2026-06-26T08:00:00.000Z",
      metadata: {
        reason: "Venue changed",
        old_start: "2026-06-26T08:00:00.000Z",
        new_start: "2026-06-27T08:00:00.000Z",
        old_venue: "Old venue",
        new_venue: "New venue",
        targetId: "internal-id",
        sessionId: "internal-session-id",
        token: "secret-token",
        faceDescriptor: "sensitive-data",
        rawPayload: { internal: true }
      } as unknown as AuditLog["metadata"]
    });

    expect(items.map((item) => item.label)).toEqual([
      "Reason",
      "Previous venue",
      "New venue",
      "Previous start",
      "New start"
    ]);
    expect(items.map((item) => item.value)).not.toContain("internal-id");
    expect(items.map((item) => item.value)).not.toContain("secret-token");
    expect(items.map((item) => item.value)).not.toContain("sensitive-data");
  });

  it("omits the detail section when only internal review metadata exists", () => {
    expect(getAuditLogDetailItems({
      id: "log-2",
      actorUserId: "user-1",
      action: "audit_log.reviewed",
      targetType: "audit_log",
      targetId: "log-1",
      timestamp: "2026-06-26T08:00:00.000Z",
      metadata: { reviewedTargetId: "internal-id", reviewedAt: "2026-06-26T08:00:00.000Z" }
    })).toEqual([]);
  });

  it("only exposes allowlisted changed-field names", () => {
    const items = getAuditLogDetailItems({
      id: "log-3",
      actorUserId: "user-1",
      action: "user.updated",
      targetType: "user",
      targetId: "user-1",
      timestamp: "2026-06-26T08:00:00.000Z",
      metadata: {
        changedFields: ["department", "position", "password", "faceDescriptor", "session_id"]
      } as unknown as AuditLog["metadata"]
    });

    expect(items).toEqual([{ label: "Changed fields", value: "Department, Position" }]);
  });
});
