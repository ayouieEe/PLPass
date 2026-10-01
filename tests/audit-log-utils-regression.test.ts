import { describe, expect, it } from "vitest";
import type { AuditLog } from "@/types/domain";
import {
  auditActionCategory,
  removeLegacyDuplicateAuditLogs
} from "@/features/organizer/utils/auditLogUtils";

describe("organizer audit log presentation", () => {
  it("retains one authoritative record for each legacy duplicate pair", () => {
    const logs: AuditLog[] = [
      { id: "server-end", actorUserId: "organizer-1", action: "attendance_session.ended", targetType: "event_session", targetId: "session-1", timestamp: "2026-09-30T00:42:00.000Z", metadata: {} },
      { id: "client-end", actorUserId: "organizer-1", action: "Ended Live Session", targetType: "attendance_session", targetId: "session-1", timestamp: "2026-09-30T00:42:01.000Z", metadata: {} },
      { id: "server-manual", actorUserId: "organizer-1", action: "attendance.manual_recorded", targetType: "attendance_record", targetId: "record-1", timestamp: "2026-09-30T00:43:00.000Z", metadata: {} },
      { id: "client-manual", actorUserId: "organizer-1", action: "Submitted Manual Attendance", targetType: "attendance_record", targetId: "record-1", timestamp: "2026-09-30T00:43:01.000Z", metadata: {} }
    ];

    expect(removeLegacyDuplicateAuditLogs(logs).map((log) => log.id)).toEqual(["server-end", "server-manual"]);
  });

  it("keeps organizer-facing filter categories limited to organizer actions", () => {
    expect(auditActionCategory({ id: "1", actorUserId: "organizer-1", action: "Exported Event Record", targetType: "export_action", targetId: "export-1", timestamp: "2026-09-30T00:42:00.000Z", metadata: {} })).toBe("account");
    expect(auditActionCategory({ id: "2", actorUserId: "organizer-1", action: "event.updated", targetType: "event", targetId: "event-1", timestamp: "2026-09-30T00:42:00.000Z", metadata: {} })).toBe("events");
  });
});
