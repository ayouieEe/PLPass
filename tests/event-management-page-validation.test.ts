import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  hasValidEventSchedule,
  shouldDisplayInEventTab,
  type EventRecord
} from "@/features/organizer/utils/eventManagement";
import { dateKey, manilaDateTimeToIso } from "@/lib/utils/date";

const eventManagementPage = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");
const eventDetailsPage = readFileSync("src/features/organizer/pages/EventDetailsPage.tsx", "utf8");
const appRouter = readFileSync("src/app/router/AppRouter.tsx", "utf8");
const activeSessionOverlay = readFileSync("src/features/attendance/ActiveSessionOverlay.tsx", "utf8");
const routes = readFileSync("src/lib/constants/routes.ts", "utf8");
const attendanceStartMigration = readFileSync(
  "supabase/migrations/20260909113720_allow_owned_events_to_start_attendance_without_approval.sql",
  "utf8"
);
const qrScannerPanel = readFileSync("src/features/attendance/QRFallbackPanel.tsx", "utf8");
const repositories = readFileSync("src/services/supabase/repositories.ts", "utf8");
const simulatedRepositories = readFileSync("src/test-support/repositories.ts", "utf8");

describe("event page validation helpers", () => {
  it("keeps the hardware scanner active and resolves current student-number QR values", () => {
    expect(qrScannerPanel).toContain("window.addEventListener(\"keydown\", handleScannerKeyDown, true)");
    expect(qrScannerPanel).not.toContain('name: /enable/i');
    expect(repositories).toContain("normalizeStudentIdentityValue(input.credentialCode)");
    expect(repositories).toContain("studentIdentityMatchesPayload(input.credentialCode");
    expect(repositories).toContain('.from("event_participants")');
    expect(eventManagementPage).toContain('.from("event_participants")');
    expect(eventManagementPage).toContain("studentIdentityMatchesPayload(scanCode");
    expect(simulatedRepositories).toContain("studentIdentityMatchesPayload(input.credentialCode");
  });
  it("calculates live attendance rate against all event participants", () => {
    expect(eventManagementPage).toContain("function countRows(rows: AttendanceRow[], participantCount: number)");
    expect(eventManagementPage).toContain("((present + late) / participantCount) * 100");
    expect(eventManagementPage).toContain("const activeParticipantCount = activeParticipantIdentities?.length ?? 0");
    expect(eventManagementPage).toContain("totalParticipants: participantCount");
  });
  it("retains live attendance scans across reloads until the session is ended", () => {
    expect(eventManagementPage).toContain('const liveAttendanceDraftStoragePrefix = "plpass:live-attendance-draft:"');
    expect(eventManagementPage).toContain("readLiveAttendanceDraft(activeScannerSessionId, activeEvent.id)");
    expect(eventManagementPage).toContain("window.sessionStorage.setItem(liveAttendanceDraftStorageKey(activeScannerSessionId)");
    expect(eventManagementPage).toContain("window.sessionStorage.removeItem(liveAttendanceDraftStorageKey(sessionId))");
  });
  it("rejects incomplete event schedules", () => {
    expect(hasValidEventSchedule({ date: "2026-09-14", startTime: "", endTime: "04:00" })).toBe(false);
    expect(hasValidEventSchedule({ date: "2026-09-14", startTime: "02:00", endTime: "04:00" })).toBe(true);
  });

  it("converts Manila wall time independently of the computer timezone", () => {
    expect(manilaDateTimeToIso("2026-09-20", "09:30")).toBe("2026-09-20T01:30:00.000Z");
    expect(() => manilaDateTimeToIso("2026-02-30", "09:30")).toThrow(/invalid/i);
    expect(() => manilaDateTimeToIso("2026-09-20", "24:00")).toThrow(/invalid/i);
  });

  it("requires a same-day schedule before any online attendance session can start", () => {
    expect(repositories).toContain("input.date !== dateKey(new Date())");
    expect(repositories).toContain("manilaDateTimeToIso(input.date, input.startTime)");
    expect(eventManagementPage).toContain("Reschedule to today");
    expect(eventManagementPage).toContain("startEvent.date !== dateKey(new Date())");
    expect(eventDetailsPage).toContain("dateKey(event.startsAt) !== dateKey(new Date())");
    expect(eventDetailsPage).toContain("Reschedule event to today to start attendance.");
    expect(attendanceStartMigration).not.toContain("scheduled Manila date");
    const sameDayMigration = readFileSync(
      "supabase/migrations/20260919173952_enforce_event_start_on_scheduled_manila_day.sql",
      "utf8"
    );
    expect(sameDayMigration).toContain("Events can only be started on their scheduled Manila date");
    expect(sameDayMigration).toContain("v_event.starts_at at time zone 'Asia/Manila'");
  });

  it("keeps past events out of incoming when they have no attendance session", () => {
    const event = {
      id: "evt-1",
      code: "EVT-1",
      name: "Past Event",
      category: "General",
      venue: "AVR 1",
      date: "2026-08-10",
      startTime: "02:00",
      endTime: "04:00",
      status: "incoming",
      priorityLevel: "Flexible",
      impactScore: null,
      predictedTurnout: "0%",
      objectives: []
    } satisfies EventRecord;

    expect(shouldDisplayInEventTab(event, "incoming", {
      activeEventCode: undefined,
      cancelledCodes: [],
      completedCodes: new Set(),
      sessionsList: []
    })).toBe(false);
  });

  it("hides events with a persisted active session regardless of session date fields", () => {
    const event = {
      id: "evt-live",
      code: "EVT-LIVE",
      name: "Live Event",
      category: "General",
      venue: "AVR 1",
      date: "2026-09-17",
      startTime: "02:00",
      endTime: "04:00",
      status: "incoming",
      priorityLevel: "Flexible",
      impactScore: null,
      predictedTurnout: "0%",
      objectives: []
    } satisfies EventRecord;

    expect(shouldDisplayInEventTab(event, "incoming", {
      cancelledCodes: [],
      completedCodes: new Set(),
      sessionsList: [{ eventId: "evt-live", status: "active", startsAt: "2026-09-16T18:00:00.000Z" }]
    })).toBe(false);
  });

  it("keeps the Philippine calendar date when ISO timestamps are stored in UTC", () => {
    expect(dateKey("2026-08-30T16:00:00.000Z")).toBe("2026-08-31");
    expect(dateKey("2026-08-31T00:00:00.000Z")).toBe("2026-08-31");
  });

  it("runs facial verification in the active event workspace", () => {
    expect(eventManagementPage).toContain("extractMirroredFaceDescriptor(video)");
    expect(eventManagementPage).toContain('client.rpc("record_live_facial_attendance"');
    expect(eventManagementPage).not.toContain("identifyLiveFace(");
    expect(eventManagementPage).toContain("Live facial verification camera preview");
    expect(eventManagementPage).not.toContain("navigate(APP_ROUTES.organizerSession(resolvedLiveSessionId))");
    expect(eventManagementPage).toContain("No active attendance session is available for facial verification.");
  });

  it("keeps schedule navigation out of a live event workspace and clears stale sessions", () => {
    expect(eventManagementPage).toContain("{!activeEvent ? <section");
    expect(eventManagementPage).toContain("This attendance session is no longer active. Returned to Events.");
    expect(eventManagementPage).toContain("navigate(workspaceRoute(APP_ROUTES.organizerLiveSession(liveSessionId)");
  });

  it("rehydrates an active event from persisted attendance-session state", () => {
    expect(eventManagementPage).toContain("const persistedActiveSession = useMemo");
    expect(eventManagementPage).toContain('attendanceSession.status === "active"');
    expect(eventManagementPage).toContain("event.id === attendanceSession.eventId");
    expect(eventManagementPage).toContain("Rehydrate a live event from persisted session data after a reload");
    expect(eventManagementPage).toContain("setLiveSessionId(persistedActiveSession.id)");
  });

  it("uses one live-session workspace and hides the floating entry point there", () => {
    expect(appRouter).not.toContain("EventAttendancePage");
    expect(appRouter).not.toContain("/organizer/sessions/:sessionId");
    expect(appRouter).toContain("/organizer/live-attendance/:sessionId");
    expect(routes).toContain("organizerLiveSession");
    expect(activeSessionOverlay).toContain('const eventsRoute = isAdminRoute ? APP_ROUTES.adminEvents : APP_ROUTES.organizerEvents');
    expect(activeSessionOverlay).toContain("location.pathname === eventsRoute && Boolean(currentSessionId)");
    expect(activeSessionOverlay).toContain("currentEventId === activeSession.eventId");
    expect(activeSessionOverlay).toContain("isLiveAttendanceWorkspace");
    expect(eventManagementPage).toContain("window.addEventListener(\"keydown\", handleScannerKeyDown, true)");
    expect(eventManagementPage).toContain("window.addEventListener(\"paste\", handleScannerPaste, true)");
    expect(eventManagementPage).toContain("window.setTimeout(submitBufferedScan, scannerIdleSubmissionDelayMs)");
    expect(eventManagementPage).toContain("studentIdentityMatchesPayload(scanCode");
    expect(eventManagementPage).not.toContain("Focus scanner input");
    expect(activeSessionOverlay).toContain('event.status === "cancelled" || event.status === "completed"');
    expect(activeSessionOverlay).toContain("Session status is the organizer's source of truth");
    expect(activeSessionOverlay).toContain("left.createdAt ?? left.attendanceWindowStartAt ?? left.startsAt");
    expect(activeSessionOverlay).toContain("right.createdAt ?? right.attendanceWindowStartAt ?? right.startsAt");
    expect(activeSessionOverlay).toContain("APP_ROUTES.adminLiveSession(activeSession.id)");
    expect(activeSessionOverlay).toContain("APP_ROUTES.organizerLiveSession(activeSession.id)");
    expect(activeSessionOverlay).toContain("plpass:leave-create-event-confirm");
  });

  it("allows an organizer to start an owned active event without approval", () => {
    expect(eventManagementPage).not.toContain("awaiting approval and cannot start attendance");
    expect(attendanceStartMigration).not.toContain("approval_status = 'approved'");
    expect(attendanceStartMigration).not.toContain("approval_status <> 'approved'");
    expect(attendanceStartMigration).toContain("v_event.organizer_id <> private.current_organizer_id()");
    expect(attendanceStartMigration).toContain("v_event.event_status in ('completed', 'cancelled')");
  });
});
