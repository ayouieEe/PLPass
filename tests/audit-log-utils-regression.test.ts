import { describe, expect, it } from "vitest";
import type { AuditLog } from "@/types/domain";
import {
  auditActionCategory,
  filterMainAuditLogs,
  removeRepeatedOfflinePreparationAuditLogs,
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

  it("keeps only decision-level audit entries in the main trail", () => {
    const logs: AuditLog[] = [
      { id: "event", actorUserId: "organizer-1", action: "event.published", targetType: "event", targetId: "event-1", timestamp: "2026-10-01T00:00:00.000Z", metadata: {} },
      { id: "export", actorUserId: "organizer-1", action: "Exported Analytics", targetType: "export_action", targetId: "", timestamp: "2026-10-01T00:01:00.000Z", metadata: {} },
      { id: "manual", actorUserId: "organizer-1", action: "attendance.manual_recorded", targetType: "attendance_record", targetId: "record-1", timestamp: "2026-10-01T00:02:00.000Z", metadata: {} },
      { id: "qr", actorUserId: "student-1", action: "credential.qr_generated_by_student", targetType: "credential", targetId: "credential-1", timestamp: "2026-10-01T00:03:00.000Z", metadata: {} }
    ];

    expect(filterMainAuditLogs(logs).map((log) => log.id)).toEqual(["event", "export"]);
  });

  it("keeps the newest identical offline package preparation", () => {
    const logs: AuditLog[] = [
      { id: "older", actorUserId: "organizer-1", action: "event.offline_prepared", targetType: "event", targetId: "event-1", timestamp: "2026-10-01T00:00:00.000Z", metadata: { session_id: "session-1", participant_count: 20 } },
      { id: "newer", actorUserId: "organizer-1", action: "event.offline_prepared", targetType: "event", targetId: "event-1", timestamp: "2026-10-01T00:02:00.000Z", metadata: { session_id: "session-1", participant_count: 20 } },
      { id: "changed", actorUserId: "organizer-1", action: "event.offline_prepared", targetType: "event", targetId: "event-1", timestamp: "2026-10-01T00:03:00.000Z", metadata: { session_id: "session-1", participant_count: 21 } }
    ];

    expect(removeRepeatedOfflinePreparationAuditLogs(logs).map((log) => log.id)).toEqual(["newer", "changed"]);
  });
});
