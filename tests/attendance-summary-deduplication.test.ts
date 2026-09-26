import { describe, expect, it } from "vitest";
import { mergeOrganizerAttendanceRows, summarizeFinalizedAttendance, summarizeUniqueAttendance } from "@/features/organizer/utils/attendanceSummary";

describe("organizer attendance summary identity counting", () => {
  it("prefers the verified attendance row when the same durable scan exists in both sources", () => {
    const rows = mergeOrganizerAttendanceRows([
      { id: "walkin-row", studentId: "walkin:row", localScanUuid: "scan-1", studentName: "Unverified walk-in · 23-00999", eventCode: "EVT", attendanceMethod: "Manual", checkInTime: "12:00 AM", attendanceStatus: "present", verificationLabel: "Unverified walk-in" },
      { id: "attendance-row", studentId: "student-9", localScanUuid: "scan-1", studentName: "Verified Student", eventCode: "EVT", attendanceMethod: "QR Code", checkInTime: "12:00 AM", attendanceStatus: "late", verificationLabel: "Verified" }
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "attendance-row", verificationLabel: "Verified" });
  });

  it("deduplicates repeated scans and includes a distinct walk-in without exceeding 100%", () => {
    const result = summarizeUniqueAttendance([
      { identity: "student-1", attendanceStatus: "present" },
      { identity: "student-1", attendanceStatus: "present" },
      { identity: "student-2", attendanceStatus: "late" },
      { identity: "walkin-scan-1", attendanceStatus: "present" }
    ], 2);

    expect(result).toMatchObject({ present: 2, late: 1, absent: 0, population: 3, attendanceRate: 100 });
  });

  it("does not discard an explicit absent outcome", () => {
    const result = summarizeUniqueAttendance([
      { identity: "student-1", attendanceStatus: "present" },
      { identity: "student-2", attendanceStatus: "absent" },
      { identity: "walkin-scan-1", attendanceStatus: "late" }
    ], 2);

    expect(result).toMatchObject({ present: 1, late: 1, absent: 1, population: 3, attendanceRate: 66.7 });
  });

  it("infers missing registered participants as absent only when requested", () => {
    const active = summarizeUniqueAttendance([{ identity: "student-1", attendanceStatus: "present" }], 2);
    const completed = summarizeUniqueAttendance([{ identity: "student-1", attendanceStatus: "present" }], 2, true);

    expect(active).toMatchObject({ present: 1, late: 0, absent: 0, population: 2 });
    expect(completed).toMatchObject({ present: 1, late: 0, absent: 1, population: 2, attendanceRate: 50 });
  });

  it("counts an unverified walk-in in addition to absent registered participants", () => {
    const summary = summarizeFinalizedAttendance([
      { identity: "walkin:scan-1", attendanceStatus: "present", isUnverifiedWalkIn: true }
    ], 3);

    expect(summary).toMatchObject({ present: 1, late: 0, absent: 3, population: 4, attendanceRate: 25 });
  });
});
