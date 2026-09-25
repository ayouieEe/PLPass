import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  hasValidEventSchedule,
  eventScheduleLabel,
  shouldDisplayInEventTab,
  type EventRecord
} from "@/features/organizer/utils/eventManagement";
import { dateKey, manilaDateTimeToIso } from "@/lib/utils/date";

const eventManagementPage = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");
const eventDetailsPage = readFileSync("src/features/organizer/pages/EventDetailsPage.tsx", "utf8");
const offlineEventHook = readFileSync("src/features/offline/useOfflineEvent.ts", "utf8");
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
    expect(eventManagementPage).toContain("function countRows(rows: AttendanceRow[], participantCount: number, inferMissingRegisteredAsAbsent = false)");
    expect(eventManagementPage).toContain("summarizeUniqueAttendance");
    expect(eventManagementPage).toContain("participantCount");
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

  it("shows the planned time range even when no schedule conflict exists", () => {
    expect(eventScheduleLabel({ startTime: "08:00 AM", endTime: "10:00 AM" })).toBe("08:00 AM – 10:00 AM");
    expect(eventScheduleLabel({ startTime: "", endTime: "10:00 AM" })).toBe("Schedule unavailable");
  });

  it("converts Manila wall time independently of the computer timezone", () => {
    expect(manilaDateTimeToIso("2026-09-20", "09:30")).toBe("2026-09-20T01:30:00.000Z");
    expect(manilaDateTimeToIso("2026-09-20", "02:00")).toBe("2026-09-19T18:00:00.000Z");
    expect(() => manilaDateTimeToIso("2026-02-30", "09:30")).toThrow(/invalid/i);
    expect(() => manilaDateTimeToIso("2026-09-20", "24:00")).toThrow(/invalid/i);
  });

  it("requires a same-day schedule before any online attendance session can start", () => {
    expect(repositories).toContain("input.date !== dateKey(new Date())");
    expect(repositories).toContain("manilaDateTimeToIso(input.date, input.startTime)");
    expect(eventManagementPage).toContain("Reschedule to today");
    expect(eventManagementPage).toContain("startEvent.date !== getManilaCalendarDate()");
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

  it("keeps active same-day events in admin Today and reopens their monitor", () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const event = {
      id: "evt-live-today",
      code: "EVT-LIVE-TODAY",
      name: "Live Today",
      category: "General",
      venue: "AVR 1",
      date,
      startTime: "02:00",
      endTime: "04:00",
      status: "ongoing",
      priorityLevel: "Flexible",
      impactScore: null,
      predictedTurnout: "0%",
      objectives: []
    } satisfies EventRecord;
    const activeSession = [{ eventId: event.id, status: "active" }];

    expect(shouldDisplayInEventTab(event, "today", {
      includeActiveEvents: true,
      cancelledCodes: [],
      completedCodes: new Set(),
      sessionsList: activeSession
    })).toBe(true);
    expect(shouldDisplayInEventTab(event, "today", {
      cancelledCodes: [],
      completedCodes: new Set(),
      sessionsList: activeSession
    })).toBe(false);
    expect(shouldDisplayInEventTab(event, "incoming", {
      includeActiveEvents: true,
      cancelledCodes: [],
      completedCodes: new Set(),
      sessionsList: activeSession
    })).toBe(false);
    expect(eventManagementPage).toContain("includeActiveEvents: isReadOnlyMonitor");
    expect(eventManagementPage).toContain("sessionsList.find((session) => session.eventId === event.id");
    expect(eventManagementPage).toContain("APP_ROUTES.adminLiveSession(activeSession.id)");
    expect(eventManagementPage).toContain('adminRoute.startsWith(`${APP_ROUTES.adminEvents}?`)');
    expect(eventManagementPage).toContain('return adminRoute.replace(APP_ROUTES.adminEvents, APP_ROUTES.departmentEvents)');
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
    expect(eventManagementPage).toContain("if (isReadOnlyMonitor || sessionIdFromQuery || activeEvent || liveSessionId");
    expect(eventManagementPage).toContain("Back to all events");
    expect(eventManagementPage).toContain("navigate(isDepartmentAdmin ? APP_ROUTES.departmentEvents : APP_ROUTES.adminEvents, { replace: true })");
    expect(eventManagementPage).toContain("leavingReadOnlyMonitorRef.current = true");
    expect(eventManagementPage).toContain("if (leavingReadOnlyMonitorRef.current) return");
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

  it("does not infer absent students while an attendance session is still live", () => {
    expect(eventManagementPage).toContain("const activeCounts = countRows(activeRows, activeParticipantCount, false);");
    expect(eventManagementPage).toContain("const sessionSummary = finalizedSummary ?? summarizeFinalizedSession(activeRows, activeParticipantCount);");
  });

  it("starts and ends prepared attendance locally while offline", () => {
    expect(eventManagementPage).toContain("if (isOfflineMode)");
    expect(eventManagementPage).toContain("api.getPreparedEvent(eventId, ownerId)");
    expect(eventManagementPage).toContain("startOfflineEvent(eventId, localSession.id, ownerId)");
    expect(eventManagementPage).toContain("No server session was changed.");
    expect(eventManagementPage).toContain("if (desktopApi() && !isOfflineMode)");
    expect(eventManagementPage).toContain("await endOfflineEvent(");
    expect(eventDetailsPage).toContain("startOfflineEvent(event.id, localSession.id, ownerId)");
    expect(eventDetailsPage).toContain("rememberOfflineLiveSessionHandoff(updatedPackage, ownerId, updatedSession.id)");
    expect(eventManagementPage).toContain("readOfflineLiveSessionHandoff(session.userId, sessionIdFromQuery)");
    expect(eventManagementPage).not.toContain("writeAttendancePhase(window.sessionStorage, startedSession.id");
  });

  it("keeps offline live sessions local and blocks background preparation", () => {
    expect(eventManagementPage).toContain("const offlineLive = useOfflineEvent(undefined, sessionIdFromQuery ?? undefined)");
    expect(eventManagementPage).toContain("const isLocalAuthoritativeSession = Boolean(");
    expect(eventManagementPage).toContain("hasLocallyResumableSession");
    expect(eventManagementPage).toContain("isOfflineMode || !offlineLocalSession?.offlineStartReconciledAt");
    expect(eventManagementPage).toContain("`getPreparedEventBySession` is owner-scoped and returns only READY");
    expect(eventManagementPage).toContain("if (!offlineLocalSession || !offlineLivePackage || !hasLocallyResumableSession) return undefined;");
    expect(eventManagementPage).toContain('["START_PENDING", "STARTED"].includes(offlineLocalSession.offlineLifecycle ?? "")');
    expect(eventManagementPage).toContain('createdByUserId: "offline-cache"');
    expect(eventManagementPage).toContain("?? offlineLiveSession");
    expect(eventManagementPage).toContain("?? offlineLiveEvent");
    expect(eventManagementPage).toContain("useEvents({ pageSize: 100 }, context, !isOfflineMode)");
    expect(eventManagementPage).toContain("useAttendanceSessions({ pageSize: 200 }, context, !isOfflineMode)");
    expect(eventManagementPage).toContain("if (!isOfflineMode && eventsQuery.isError && !hasOfflineLiveWorkspace)");
    expect(eventManagementPage).toContain("isOfflineMode || !navigator.onLine || !(await confirmSupabaseConnectivity())");
    expect(eventManagementPage).not.toContain("autoPreparedOfflineEventIdsRef");
    expect(eventManagementPage).toContain('if (!options.silent) toast.success(`${event.code} is ready for offline use.`);');
    expect(eventManagementPage).toContain("offlineLivePackage.participants.map");
    expect(eventManagementPage).toContain("const offlineParticipantNames = useMemo");
    expect(eventManagementPage).toContain('offlineParticipantNames.get(record.studentId) ?? student?.fullName ?? student?.studentNumber ?? "Student details unavailable"');
    expect(eventManagementPage).toContain("offlineLivePackage.attendance");
    expect(eventManagementPage).toContain("offline-walkin-");
  });

  it("waits for the requested local package before rejecting a newly started offline session", () => {
    expect(offlineEventHook).toContain("const requestKey=");
    expect(offlineEventHook).toContain("const isLoading=Boolean((eventId||sessionId)&&resolvedRequestKey!==requestKey)");
    expect(offlineEventHook).toContain("const lookupVersion=useRef(0);");
    expect(offlineEventHook).toContain("const isCurrent=()=>lookupVersion.current===version;");
    expect(offlineEventHook).toContain("const [lookupError,setLookupError]=useState<string|undefined>();");
    expect(offlineEventHook).toContain("setResolvedRequestKey(requestKey)");
    expect(eventManagementPage).toContain("if (offlineLive.isLoading) return;");
    expect(eventManagementPage).toContain("if (isOfflineMode) {");
    expect(eventManagementPage).toContain("setHandledSessionRouteId(sessionIdFromQuery);");
    expect(eventManagementPage).toContain("!offlineLive.isLoading && !hasOfflineLiveWorkspace");
  });

  it("retains a locally started session as the live-route fallback during reconnect", () => {
    expect(eventManagementPage).toContain("Keep a locally started");
    expect(eventManagementPage).toContain("`getPreparedEventBySession` is owner-scoped and returns only READY");
    expect(eventManagementPage).toContain("isLocalAuthoritativeSession");
    expect(eventManagementPage).toContain("const [localStartPackage, setLocalStartPackage] = useState<PreparedEventPackage | null>(null);");
    expect(eventManagementPage).toContain("const localStartFallbackMatchesRoute = Boolean(");
    expect(eventManagementPage).toContain("readOfflineLiveSessionHandoff(session.userId, sessionIdFromQuery)");
    expect(eventManagementPage).toContain("?? routeStartHandoff;");
    expect(eventManagementPage).toContain("if (locallyStartedPackage) setLocalStartPackage(locallyStartedPackage);");
    expect(eventManagementPage).toContain("setLocalStartPackage(endedPackage);");
  });

  it("returns a ready-but-unstarted package to the existing Events flow during a network transition", () => {
    expect(eventManagementPage).toContain("const hasLocallyReadyUnstartedSession = Boolean(");
    expect(eventManagementPage).toContain('offlineLocalSession.offlineLifecycle === "NOT_STARTED"');
    expect(eventManagementPage).toContain("if (hasLocallyReadyUnstartedSession) {");
    expect(eventManagementPage).toContain("Network changes can make the server-side session read disappear");
    expect(eventManagementPage).toContain("!hasOfflineLiveWorkspace && !hasLocallyReadyUnstartedSession");
  });

  it("reuses the existing Events grid and Start Attendance flow for prepared offline packages", () => {
    expect(eventManagementPage).toContain("listOfflineEvents(session.userId)");
    expect(eventManagementPage).toContain("eventRecordFromOfflinePackage");
    expect(eventManagementPage).toContain("if (isOfflineMode) return offlinePreparedPackages.map(eventRecordFromOfflinePackage);");
    expect(eventManagementPage).toContain("if (!isOfflineMode && eventsQuery.isError && !hasOfflineLiveWorkspace)");
    expect(eventManagementPage).toContain("openStartSession(event);");
    expect(eventManagementPage).not.toContain("OfflinePreparedEventsPanel");
  });

  it("keeps every local-authoritative attendance action on the downloaded package during reconnect", () => {
    expect(eventManagementPage).toContain("const attendanceLookupStudents = isLocalAuthoritativeSession ? localStudents");
    expect(eventManagementPage).toContain("if (isLocalAuthoritativeSession) {");
    expect(eventManagementPage).toContain("await endOfflineEvent(");
    expect(eventManagementPage).toContain("await api?.advanceAttendanceCapturePhase(activeScannerSessionId ?? \"\", session?.userId ?? \"\");");
    expect(eventManagementPage).toContain('identificationMethod: "manual"');
    expect(eventManagementPage).toContain("recordOfflineAttendance({");
    expect(eventManagementPage).toContain("remarks: manualEntryReason.trim()");
  });

  it("returns QR submission to Supabase after a local start is reconciled", () => {
    expect(eventManagementPage).toContain("const { session, isOfflineMode, reconciliationState } = useDevelopmentSession();");
    expect(eventManagementPage).toContain("reconciliationJustCompleted");
    expect(eventManagementPage).toContain("void refreshOfflineLive()");
    expect(eventManagementPage).toContain("if (desktopApi() && isLocalAuthoritativeSession)");
    expect(eventManagementPage).toContain("const result = await credentialScanMutation.mutateAsync");
    expect(eventManagementPage).toContain("isLocalAuthoritativeSession || isOfflineMode || networkFailure");
  });

  it("reconciles a stale desktop capture phase before local Time Out scans", () => {
    expect(eventManagementPage).toContain("getPreparedEventBySession(activeScannerSessionId, session.userId)");
    expect(eventManagementPage).toContain("const reconcilePhase = async () =>");
    expect(eventManagementPage).toContain('attendancePhase === "time_out" && localPhase === "time_in"');
    expect(eventManagementPage).toContain("await api.advanceAttendanceCapturePhase(sessionId, session.userId)");
    expect(eventManagementPage).toContain("capturePhase:effectivePhase");
    expect(eventManagementPage).toContain("recordOfflineAttendance({ eventId, sessionId, studentId: student.studentId");
    const legacyAttendancePage = readFileSync("src/features/organizer/pages/EventAttendancePage.tsx", "utf8");
    expect(legacyAttendancePage).toContain("async function reconcileOfflineCapturePhase");
    expect(legacyAttendancePage).toContain("const phase=await reconcileOfflineCapturePhase()");
    expect(legacyAttendancePage).toContain("capturePhase:phase");
  });
});
