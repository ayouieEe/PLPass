import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  hasValidEventSchedule,
  shouldDisplayInEventTab,
  type EventRecord
} from "@/features/organizer/utils/eventManagement";
import { dateKey } from "@/lib/utils/date";

const eventManagementPage = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");
const eventDetailsPage = readFileSync("src/features/organizer/pages/EventDetailsPage.tsx", "utf8");
const appRouter = readFileSync("src/app/router/AppRouter.tsx", "utf8");
const createEventPage = readFileSync("src/features/organizer/pages/CreateEventPage.tsx", "utf8");
const activeSessionOverlay = readFileSync("src/features/attendance/ActiveSessionOverlay.tsx", "utf8");
const routes = readFileSync("src/lib/constants/routes.ts", "utf8");
const attendanceStartMigration = readFileSync(
  "supabase/migrations/20260909113720_allow_owned_events_to_start_attendance_without_approval.sql",
  "utf8"
);
const cancelledEventRescheduleMigration = readFileSync(
  "supabase/migrations/20260916190652_allow_cancelled_events_to_be_rescheduled.sql",
  "utf8"
);

describe("event page validation helpers", () => {
  it("rejects incomplete event schedules", () => {
    expect(hasValidEventSchedule({ date: "2026-09-14", startTime: "", endTime: "04:00" })).toBe(false);
    expect(hasValidEventSchedule({ date: "2026-09-14", startTime: "02:00", endTime: "04:00" })).toBe(true);
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

  it("hides an event from the startable list when an ongoing session is already attached to it", () => {
    const event = {
      id: "evt-1",
      code: "EVT-1",
      name: "Active Event",
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
      sessionsList: [{ eventId: "evt-1", status: "active" }]
    })).toBe(false);
    expect(shouldDisplayInEventTab(event, "today", {
      activeEventCode: undefined,
      cancelledCodes: [],
      completedCodes: new Set(),
      sessionsList: [{ eventId: "evt-1", status: "active" }]
    })).toBe(false);
  });

  it("uses the active session label when an event already has an ongoing session", () => {
    expect(eventDetailsPage).toContain("Open active session");
  });

  it("applies the priority dropdown filter to the currently selected event tab", () => {
    expect(eventManagementPage).toContain(".filter((event) => matchesEventFilters(event, eventFilters))");
    expect(eventManagementPage).toContain("[activeTab, cancelledEvents, eventFilters, incomingEvents, todayEvents]");
  });

  it("requires an incoming event to be rescheduled to today before attendance can start", () => {
    expect(eventManagementPage).toContain("function isScheduledForToday");
    expect(eventManagementPage).toContain("Reschedule it to today before starting attendance.");
    expect(eventManagementPage).toContain('activeTab === "incoming" ? incomingColumnsWithActions');
    expect(eventDetailsPage).toContain("const canStartSession = Boolean(activeSession) || isScheduledToday;");
    expect(eventDetailsPage).toContain("Reschedule this event to today first.");
    expect(eventDetailsPage).toContain("Attendance is unavailable until the event day");
  });

  it("restores a cancelled event to the scheduled lifecycle when it is rescheduled", () => {
    expect(cancelledEventRescheduleMigration).toContain("if v_event.event_status = 'completed' then");
    expect(cancelledEventRescheduleMigration).toContain("event_status = case when v_was_cancelled then 'scheduled'");
    expect(cancelledEventRescheduleMigration).toContain("cancellation_reason = case when v_was_cancelled then null");
    expect(cancelledEventRescheduleMigration).toContain("event.reinstated_and_rescheduled");
    expect(cancelledEventRescheduleMigration).toContain("grant execute on function public.reschedule_organizer_event");
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
    expect(eventManagementPage).toContain("{!isLiveWorkspace ? <section");
    expect(eventManagementPage).toContain('eyebrow={isLiveWorkspace && activeEvent ? (');
    expect(eventManagementPage).toContain("Back to events");
    expect(eventManagementPage).toContain("function returnToEvents()");
    expect(eventManagementPage).toContain("onClick={returnToEvents}");
    expect(eventManagementPage).toContain("const isLiveWorkspace = Boolean(activeEvent && sessionIdFromQuery);");
    expect(eventManagementPage).toContain("location.pathname !== eventsRoute");
    expect(eventManagementPage).toContain("returningToEventsRef.current = true;");
    expect(eventManagementPage).toContain("if (returningToEventsRef.current) return;");
    expect(eventManagementPage).toContain("This attendance session is no longer active. Returned to Events.");
    expect(eventManagementPage).toContain("navigate(workspaceRoute(APP_ROUTES.organizerLiveSession(liveSessionId)");
  });

  it("uses one live-session workspace and hides the floating entry point there", () => {
    expect(appRouter).not.toContain("EventAttendancePage");
    expect(appRouter).not.toContain("/organizer/sessions/:sessionId");
    expect(appRouter).toContain("/organizer/live-attendance/:sessionId");
    expect(routes).toContain("organizerLiveSession");
    expect(activeSessionOverlay).toContain('location.pathname === APP_ROUTES.organizerEvents && currentSessionId');
    expect(activeSessionOverlay).toContain('event.status === "cancelled" || event.status === "completed"');
    expect(activeSessionOverlay).toContain("Session status is the organizer's source of truth");
    expect(activeSessionOverlay).toContain("left.createdAt ?? left.attendanceWindowStartAt ?? left.startsAt");
    expect(activeSessionOverlay).toContain("right.createdAt ?? right.attendanceWindowStartAt ?? right.startsAt");
    expect(activeSessionOverlay).toContain("APP_ROUTES.organizerLiveSession(activeSession.id)");
    expect(activeSessionOverlay).toContain("APP_ROUTES.organizerLiveSession(activeSession.id)");
    expect(activeSessionOverlay).not.toContain("setIsConfirmOpen(true)");
    expect(activeSessionOverlay).not.toContain("Open live session?");
    expect(activeSessionOverlay).toContain("plpass:leave-create-event-confirm");
    expect(createEventPage).toContain("plpass:leave-create-event-confirm");
    expect(createEventPage).toContain("setPendingExitTo(nextPath)");
    expect(activeSessionOverlay).toContain("onPointerDown={handlePointerDown}");
    expect(activeSessionOverlay).toContain("Drag to reposition. Click to return to the live session.");
  });

  it("allows an organizer to start an owned active event without approval", () => {
    expect(eventManagementPage).not.toContain("awaiting approval and cannot start attendance");
    expect(attendanceStartMigration).not.toContain("approval_status = 'approved'");
    expect(attendanceStartMigration).not.toContain("approval_status <> 'approved'");
    expect(attendanceStartMigration).toContain("v_event.organizer_id <> private.current_organizer_id()");
    expect(attendanceStartMigration).toContain("v_event.event_status in ('completed', 'cancelled')");
  });
});
