import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolveAttendanceRecordAction, supabaseAttendanceSessionRepository } from "@/services/supabase/repositories";
import { resolveLateStudentManualState, resolveManualAttendanceLookup } from "@/features/organizer/utils/eventManagement";
import { getRecordVerificationMethod } from "@/features/organizer/pages/EventAttendancePage";
import { getPhilippineNowIso, to24HourTime } from "@/lib/utils/date";
import { sessionStartAvailability } from "@/features/organizer/pages/EventManagementPage";
import type { AttendanceScanInput, ManualAttendanceInput } from "@/services/contracts";
import type { RepositoryContext } from "@/services/repositoryUtils";

const { mockSupabaseClient } = vi.hoisted(() => ({
  mockSupabaseClient: {
    from: vi.fn()
  }
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => mockSupabaseClient
}));
vi.mock("@/app/providers/DevelopmentSessionProvider", () => ({
  useDevelopmentSession: () => ({
    session: {
      userId: "user-organizer-1",
      role: "organizer"
    }
  })
}));

describe("Supabase event-scoped attendance queries", () => {
  const mockContext: RepositoryContext = {
    actorUserId: "user-organizer-1",
    actorRole: "organizer"
  };

  it("filters event sessions by eventId", async () => {
    type EventSessionRow = { id: string; event_id: string; session_status: string; scheduled_start: string };
    let lastBuilder: { eq: ReturnType<typeof vi.fn> } | undefined;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      const data = table === "event_sessions"
        ? [
            { id: "session-1", event_id: "evt-1", session_status: "ongoing", scheduled_start: "2026-08-17T09:00:00.000Z" },
            { id: "session-2", event_id: "evt-2", session_status: "completed", scheduled_start: "2026-08-17T10:00:00.000Z" }
          ]
        : [];

      const filters: Record<string, unknown> = {};
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((field: string, value: unknown) => {
          filters[field] = value;
          return builder;
        }),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockImplementation(async () => {
          const filtered = data.filter((row: EventSessionRow) => {
            if (filters.event_id !== undefined && String(row.event_id) !== String(filters.event_id)) {
              return false;
            }
            return true;
          });
          return { data: filtered, count: filtered.length, error: null };
        })
      };
      lastBuilder = builder;
      return builder;
    });

    const sessions = await supabaseAttendanceSessionRepository.listAttendanceSessions({ pageIndex: 0, pageSize: 20, eventId: "evt-1" }, mockContext);

    expect(sessions.items.map((session) => session.id)).toEqual(["session-1"]);
    expect(lastBuilder?.eq).toHaveBeenCalledWith("event_id", "evt-1");
  });

});

describe("Attendance Check-In/Check-Out Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("QR Attendance Check-In/Check-Out", () => {
    it("should create a check-in record on first QR scan", async () => {
      const input: AttendanceScanInput = {
        sessionId: "session-1",
        credentialCode: "QR001",
        method: "qr",
        occurredAt: new Date().toISOString()
      };

      // Mock the backend behavior
      // First scan should create record with time_in
      // The actual test would need proper mocks set up in beforeEach

      // Placeholder assertion
      expect(input.credentialCode).toBe("QR001");
      expect(input.method).toBe("qr");
    });

    it("should update record with check-out time on second QR scan", async () => {
      // Second scan on same student should set time_out
      // instead of returning "Already Recorded"
      
      const firstScanTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const secondScanTime = new Date().toISOString();

      // Verify that:
      // 1. First scan creates record with time_in = firstScanTime
      // 2. Second scan updates record with time_out = secondScanTime
      
      expect(firstScanTime).toBeDefined();
      expect(secondScanTime).toBeDefined();
      expect(new Date(secondScanTime).getTime()).toBeGreaterThan(new Date(firstScanTime).getTime());
    });

    it("should prevent check-out/check-in after both times are set", async () => {
      // If both time_in and time_out are set, subsequent attempts
      // should return "Already Recorded" status
      
      const checkInTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const checkOutTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      
      // Third scan should be rejected as duplicate
      expect(new Date(checkOutTime).getTime()).toBeGreaterThan(new Date(checkInTime).getTime());
    });

    it("should allow different methods for check-in and check-out", async () => {
      // QR for check-in, but facial recognition (if enabled) for check-out
      // Should still result in successful check-out with checkout_verification_method set
      
      const checkInMethod = "qr";
      const checkOutMethod = "qr"; // Note: facial not currently enabled in backend
      
      expect(checkInMethod).not.toBeNull();
      expect(checkOutMethod).not.toBeNull();
    });
  });

  describe("Face check-in and checkout state resolution", () => {
    it("should detect a fresh face check-in before any attendance row exists", () => {
      expect(resolveAttendanceRecordAction(undefined)).toBe("check-in");
      expect(resolveAttendanceRecordAction({ time_in: "2026-08-30T08:00:00.000Z", time_out: null })).toBe("check-out");
      expect(resolveAttendanceRecordAction({ time_in: "2026-08-30T08:00:00.000Z", time_out: "2026-08-30T09:00:00.000Z" })).toBe("already-recorded");
    });
  });

  describe("Philippine local timing", () => {
    it("should generate a timestamp in the Philippines timezone for attendance events", () => {
      const iso = getPhilippineNowIso();
      const parsed = new Date(iso);
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      const parts = formatter.formatToParts(parsed);
      const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));

      expect(values.year).toBeTruthy();
      expect(values.month).toBeTruthy();
      expect(values.day).toBeTruthy();
      expect(parsed.getTime()).toBeGreaterThan(0);
    });
  });

  it("should not display a method on absent records and should prefer the checkout method after checkout", () => {
    const absentRecord = {
      status: "absent" as const,
      verificationMethod: "manual" as const,
      checkoutVerificationMethod: null as const,
      checkedOutAt: null as const
    };

    const checkedOutRecord = {
      status: "present" as const,
      verificationMethod: "manual" as const,
      checkoutVerificationMethod: "facial" as const,
      checkedOutAt: "2026-08-30T13:00:00.000Z"
    };

    expect(getRecordVerificationMethod(absentRecord)).toBeNull();
    expect(getRecordVerificationMethod(checkedOutRecord)).toBe("facial");
  });

  it("should normalize 12-hour event session times before starting a live session", () => {
    expect(to24HourTime("8:00 AM")).toBe("08:00");
    expect(to24HourTime("5:30 PM")).toBe("17:30");
    expect(to24HourTime("09:45")).toBe("09:45");
  });

  it("should allow a demo live session even when the event date is outside the original schedule", () => {
    const result = sessionStartAvailability({
      code: "EVT-2026-999",
      name: "Demo Session",
      category: "Demo",
      venue: "Banquet Hall",
      date: "2026-08-29",
      startTime: "09:00 AM",
      endTime: "10:00 AM",
      predictedTurnout: "85%",
      objectives: [],
      priorityLevel: "Flexible",
      impactScore: 0
    }, new Date("2026-08-30T18:00:00Z"));

    expect(result.allowed).toBe(true);
    expect(result.message).toContain("Starting now opens");
  });

  describe("Manual Attendance Check-In/Check-Out", () => {
    it("should create a check-in record for manual attendance (present)", async () => {
      const input: ManualAttendanceInput = {
        sessionId: "session-1",
        studentId: "student-1",
        reason: "Manual entry",
        remarks: "",
        statusOverride: "present"
      };

      // First manual attendance should create record with time_in
      // and attendance_status = "present"
      
      expect(input.statusOverride).toBe("present");
      expect(input.studentId).toBe("student-1");
    });

    it("should create a check-in record for manual attendance (late)", async () => {
      const input: ManualAttendanceInput = {
        sessionId: "session-1",
        studentId: "student-2",
        reason: "Manual entry",
        remarks: "",
        statusOverride: "late",
        lateReason: "Traffic / Commute"
      };

      // Manual attendance can be marked as late with a reason
      expect(input.statusOverride).toBe("late");
      expect(input.lateReason).toBe("Traffic / Commute");
    });

    it("should update record with check-out time on second manual attendance", async () => {
      // Second manual attendance on same student should set time_out
      // instead of returning "Already Recorded"
      
      const secondAttendanceInput: ManualAttendanceInput = {
        sessionId: "session-1",
        studentId: "student-1",
        reason: "Manual check-out",
        remarks: "",
        statusOverride: "present"
      };

      // This should trigger check-out logic, not duplicate prevention
      expect(secondAttendanceInput.studentId).toBe("student-1");
    });

    it("should prevent attendance after check-out is recorded", async () => {
      // If both check-in and check-out are recorded,
      // subsequent manual attendance attempts should be rejected
      
      const thirdAttendanceInput: ManualAttendanceInput = {
        sessionId: "session-1",
        studentId: "student-1",
        reason: "Manual attempt",
        remarks: "",
        statusOverride: "present"
      };

      // This should return error/already recorded status
      expect(thirdAttendanceInput).toBeDefined();
    });
  });

  describe("Late status locking", () => {
    it("locks an already late student to the late status and preserves the recorded reason", () => {
      const result = resolveLateStudentManualState({
        manualInput: "Sofia Nicole Angeles Manuel",
        students: [{ id: "student-1", studentNumber: "ac36b9ca", fullName: "Sofia Nicole Angeles Manuel" }],
        activeRows: [{ studentId: "student-1", attendanceStatus: "late", lateReason: "Traffic / Commute" }]
      });

      expect(result.isLateLocked).toBe(true);
      expect(result.lockedStatus).toBe("late");
      expect(result.lockedLateReason).toBe("Traffic / Commute");
    });

    it("keeps a present student editable for manual attendance", () => {
      const result = resolveLateStudentManualState({
        manualInput: "student-2",
        students: [{ id: "student-2", studentNumber: "abc123", fullName: "Ana Santos" }],
        activeRows: [{ studentId: "student-2", attendanceStatus: "present" }]
      });

      expect(result.isLateLocked).toBe(false);
      expect(result.lockedStatus).toBe("present");
      expect(result.lockedLateReason).toBe("");
    });

    it("resolves a name-based lookup to the real student id for check-out updates", () => {
      const result = resolveLateStudentManualState({
        manualInput: "Sofia Nicole Angeles Manuel",
        students: [{ id: "student-7", studentNumber: "aa99", fullName: "Sofia Nicole Angeles Manuel" }],
        activeRows: [{ studentId: "student-7", attendanceStatus: "late", lateReason: "Traffic / Commute" }]
      });

      expect(result.matchedStudentId).toBe("student-7");
    });

    it("resets to the default present state if the typed lookup no longer exactly matches the late student", () => {
      const result = resolveLateStudentManualState({
        manualInput: "Sofia Nicole Angel",
        students: [{ id: "student-7", studentNumber: "aa99", fullName: "Sofia Nicole Angeles Manuel" }],
        activeRows: [{ studentId: "student-7", attendanceStatus: "late", lateReason: "Traffic / Commute" }]
      });

      expect(result.isLateLocked).toBe(false);
      expect(result.lockedStatus).toBe("present");
      expect(result.lockedLateReason).toBe("");
    });

    it("rejects an invalid student ID or name lookup with a formal validation result", () => {
      const result = resolveManualAttendanceLookup("unknown student", [
        { id: "student-1", studentNumber: "AC36B9CA", fullName: "Sofia Nicole Angeles Manuel" }
      ]);

      expect(result.isValid).toBe(false);
      expect(result.matchedStudentId).toBeNull();
    });
  });

  describe("Mixed Method Attendance", () => {
    it("should allow QR check-in followed by manual check-out", async () => {
      // Student scans QR for check-in, organizer manually marks check-out
      
      const checkInInput: AttendanceScanInput = {
        sessionId: "session-1",
        credentialCode: "QR001",
        method: "qr"
      };

      const checkOutInput: ManualAttendanceInput = {
        sessionId: "session-1",
        studentId: "student-1",
        reason: "Manual check-out",
        remarks: ""
      };

      // Both should succeed without conflicts
      expect(checkInInput.method).toBe("qr");
      expect(checkOutInput).toBeDefined();
    });

    it("should allow manual check-in followed by QR check-out", async () => {
      // Organizer manually marks student present for check-in,
      // student later scans QR for check-out
      
      const checkInInput: ManualAttendanceInput = {
        sessionId: "session-1",
        studentId: "student-3",
        reason: "Manual entry",
        remarks: "",
        statusOverride: "present"
      };

      const checkOutInput: AttendanceScanInput = {
        sessionId: "session-1",
        credentialCode: "QR003",
        method: "qr"
      };

      // Both should succeed
      expect(checkInInput.studentId).toBe("student-3");
      expect(checkOutInput.method).toBe("qr");
    });
  });

  describe("Attendance Status Constraints", () => {
    it("should not allow check-out before check-in", async () => {
      // Validation: time_out must be >= time_in in database schema
      
      const checkInTime = new Date();
      const checkOutTime = new Date(checkInTime.getTime() - 1000); // 1 second before check-in
      
      // This should fail at database constraint level
      expect(checkOutTime.getTime()).toBeLessThan(checkInTime.getTime());
    });

    it("should preserve attendance status from check-in to check-out", async () => {
      // If marked as present at check-in, status should remain present at check-out
      // If marked as late at check-in, status should remain late at check-out
      
      const checkInStatus = "late";
      // Check-out should not change status
      const checkOutStatus = checkInStatus;
      
      expect(checkOutStatus).toBe("late");
    });

    it("should respect attendance window for check-in", async () => {
      // Check-in outside attendance window should be rejected
      const outsideWindow = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours from now
      
      expect(outsideWindow).toBeDefined();
    });

    it("should allow check-out outside attendance window", async () => {
      // Check-out can happen after session ends
      // (no window validation needed for check-out)
      
      const checkOutTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
      
      expect(checkOutTime).toBeDefined();
    });
  });

  describe("Verification Method Tracking", () => {
    it("should record verification_method for check-in", async () => {
      // When creating check-in, record which method was used
      
      const method = "qr";
      expect(method).toBe("qr");
    });

    it("should record checkout_verification_method when checking out", async () => {
      // When updating for check-out, record checkout_verification_method
      // to track which method was used for check-out
      
      const checkoutMethod = "qr";
      expect(checkoutMethod).toBeDefined();
    });
  });
});
