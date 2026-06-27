import { afterEach, describe, expect, it } from "vitest";
import {
  adminTestContext,
  facultyTestContext,
  facultyTwoTestContext,
  organizerTestContext,
  organizerTwoTestContext,
  studentTwoTestContext
} from "@/mocks/testHelpers";
import { resetMockRepositoryState } from "@/services/mock/repositories";
import { repositories } from "@/services/repositories";

afterEach(() => {
  resetMockRepositoryState();
});

describe("Phase 8 attendance simulation repository", () => {
  it("records valid present attendance without exposing the mock code", async () => {
    const result = await repositories.attendanceRecords.simulateCredentialAttendance(
      { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1002", method: "nfc", occurredAt: "2026-06-26T00:02:00.000Z" },
      facultyTestContext
    );

    expect(result.resultStatus).toBe("Present");
    expect(result.attendanceRecord?.studentId).toBe("student-6");
    expect(result.safeMessage).not.toContain("PLPASS-DEMO-1002");
  });

  it("records valid late attendance inside the attendance window", async () => {
    const result = await repositories.attendanceRecords.simulateCredentialAttendance(
      { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1004", method: "nfc", occurredAt: "2026-06-26T00:20:00.000Z" },
      facultyTestContext
    );

    expect(result.resultStatus).toBe("Late");
    expect(result.attendanceRecord?.status).toBe("late");
  });

  it("prevents duplicate attendance records", async () => {
    await repositories.attendanceRecords.simulateCredentialAttendance(
      { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1002", method: "nfc", occurredAt: "2026-06-26T00:02:00.000Z" },
      facultyTestContext
    );
    const duplicate = await repositories.attendanceRecords.simulateCredentialAttendance(
      { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1002", method: "nfc", occurredAt: "2026-06-26T00:03:00.000Z" },
      facultyTestContext
    );
    const records = await repositories.attendanceRecords.listAttendanceRecords({ pageIndex: 0, pageSize: 100 }, facultyTestContext);

    expect(duplicate.resultStatus).toBe("Already Recorded");
    expect(records.items.filter((record) => record.sessionId === "session-2" && record.studentId === "student-6")).toHaveLength(1);
  });

  it("handles invalid, blocked, not enrolled, no active, and outside-window results", async () => {
    await expect(
      repositories.attendanceRecords.simulateCredentialAttendance(
        { sessionId: "session-2", credentialCode: "PLPASS-DEMO-INVALID", method: "nfc", occurredAt: "2026-06-26T00:02:00.000Z" },
        facultyTestContext
      )
    ).resolves.toMatchObject({ resultStatus: "Invalid Sticker" });
    await expect(
      repositories.attendanceRecords.simulateCredentialAttendance(
        { sessionId: "session-2", credentialCode: "PLPASS-DEMO-BLOCKED", method: "nfc", occurredAt: "2026-06-26T00:02:00.000Z" },
        facultyTestContext
      )
    ).resolves.toMatchObject({ resultStatus: "Blocked Sticker" });
    await expect(
      repositories.attendanceRecords.simulateCredentialAttendance(
        { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1001", method: "nfc", occurredAt: "2026-06-26T00:02:00.000Z" },
        facultyTestContext
      )
    ).resolves.toMatchObject({ resultStatus: "Student Not Enrolled" });
    await expect(
      repositories.attendanceRecords.simulateCredentialAttendance(
        { sessionId: "session-1", credentialCode: "PLPASS-DEMO-1001", method: "nfc", occurredAt: "2026-06-24T00:02:00.000Z" },
        facultyTestContext
      )
    ).resolves.toMatchObject({ resultStatus: "No Active Session" });
    await expect(
      repositories.attendanceRecords.simulateCredentialAttendance(
        { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1004", method: "nfc", occurredAt: "2026-06-26T01:31:00.000Z" },
        facultyTestContext
      )
    ).resolves.toMatchObject({ resultStatus: "Outside Attendance Window" });
  });

  it("routes QR fallback through the same validation service", async () => {
    const result = await repositories.attendanceRecords.simulateCredentialAttendance(
      { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1002", method: "qr", occurredAt: "2026-06-26T00:02:00.000Z" },
      facultyTestContext
    );

    expect(result.resultStatus).toBe("Present");
    expect(result.verificationMethod).toBe("qr");
  });

  it("validates manual override input and prevents manual duplicates", async () => {
    await expect(
      repositories.attendanceRecords.simulateManualAttendance(
        { sessionId: "session-2", studentId: "student-6", reason: "", remarks: "", occurredAt: "2026-06-26T00:02:00.000Z" },
        facultyTestContext
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const created = await repositories.attendanceRecords.simulateManualAttendance(
      {
        sessionId: "session-2",
        studentId: "student-6",
        reason: "NFC reader issue",
        remarks: "Approved fallback at the classroom desk.",
        occurredAt: "2026-06-26T00:02:00.000Z"
      },
      facultyTestContext
    );
    const duplicate = await repositories.attendanceRecords.simulateManualAttendance(
      {
        sessionId: "session-2",
        studentId: "student-6",
        reason: "NFC reader issue",
        remarks: "Second manual attempt should not create another record.",
        occurredAt: "2026-06-26T00:03:00.000Z"
      },
      facultyTestContext
    );

    expect(created.verificationMethod).toBe("manual");
    expect(duplicate.resultStatus).toBe("Already Recorded");
  });

  it("generates absences when ending a session and refreshes scoped student history", async () => {
    await repositories.attendanceRecords.simulateCredentialAttendance(
      { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1002", method: "nfc", occurredAt: "2026-06-26T00:02:00.000Z" },
      facultyTestContext
    );
    await repositories.attendanceSessions.endAttendanceSession({ sessionId: "session-2", reason: "Class ended early" }, facultyTestContext);

    const facultyRecords = await repositories.attendanceRecords.listAttendanceRecords({ pageIndex: 0, pageSize: 100 }, facultyTestContext);
    const studentRecords = await repositories.attendanceRecords.listAttendanceRecords({ pageIndex: 0, pageSize: 100 }, studentTwoTestContext);

    expect(facultyRecords.items.some((record) => record.sessionId === "session-2" && record.status === "absent")).toBe(true);
    expect(studentRecords.items.every((record) => record.studentId === "student-2")).toBe(true);
  });

  it("enforces Faculty and Organizer active session ownership", async () => {
    await expect(
      repositories.attendanceRecords.simulateCredentialAttendance(
        { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1002", method: "nfc", occurredAt: "2026-06-26T00:02:00.000Z" },
        facultyTwoTestContext
      )
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });

    const eventSession = await repositories.attendanceSessions.createEventSession(
      { eventId: "event-1", venue: "Main Hall", date: "2026-06-27", startTime: "01:00", expectedEndTime: "04:00", attendanceMode: "face-to-face" },
      organizerTestContext
    );
    await expect(
      repositories.attendanceRecords.simulateCredentialAttendance(
        { sessionId: eventSession.id, credentialCode: "PLPASS-DEMO-1001", method: "nfc", occurredAt: "2026-06-27T01:02:00.000Z" },
        organizerTwoTestContext
      )
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("creates safe audit entries without raw mock credential codes", async () => {
    await repositories.attendanceRecords.simulateCredentialAttendance(
      { sessionId: "session-2", credentialCode: "PLPASS-DEMO-1002", method: "nfc", occurredAt: "2026-06-26T00:02:00.000Z" },
      facultyTestContext
    );
    const audits = await repositories.auditLogs.listAuditLogs({ pageIndex: 0, pageSize: 20 }, adminTestContext);
    const serialized = JSON.stringify(audits.items);

    expect(serialized).toContain("nfc_attendance.recorded");
    expect(serialized).not.toContain("PLPASS-DEMO-1002");
  });
});
