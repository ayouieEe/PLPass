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
    expect(eventManagementPage).toContain('const activeRegisteredParticipantCount = activeParticipantIdentities?.filter((participant) => participant.participantStatus !== "walk_in").length ?? 0');
    expect(eventManagementPage).toContain("registeredParticipants: registeredCount");
  });
  it("retains live attendance scans across reloads until the session is ended", () => {
    expect(eventManagementPage).toContain('const liveAttendanceDraftStoragePrefix = "plpass:live-attendance-draft:"');
    expect(eventManagementPage).toContain("readLiveAttendanceDraft(activeScannerSessionId, activeEvent.id)");
    expect(eventManagementPage).toContain("window.sessionStorage.setItem(liveAttendanceDraftStorageKey(activeScannerSessionId)");
    expect(eventManagementPage).toContain("window.sessionStorage.removeItem(liveAttendanceDraftStorageKey(sessionId))");
  });
  it("uses the central phase after reconnect while preserving local Time Out evidence", () => {
    expect(eventManagementPage).toContain("if (isOfflineMode) {");
    expect(eventManagementPage).toContain("phase = await getServerAttendanceCapturePhase(activeScannerSessionId)");
    expect(eventManagementPage).toContain("activeRows.some((record) => Boolean(record.checkOutAt))");
  });

  it("makes hybrid session ending local-first when the browser already knows it is offline", () => {
    expect(eventDetailsPage).toContain("await api.confirmOnlineStartedSession(");
    expect(eventDetailsPage).toContain("created.attendanceWindowStartAt ?? created.startsAt");
    expect(eventManagementPage).toContain("const mustEndLocally = isOfflineMode || !navigator.onLine;");
    expect(eventManagementPage).toContain("if (mustEndLocally) {");
    expect(eventManagementPage).toContain("await endSessionSilentlyMutation.mutateAsync");
    expect(eventManagementPage).toContain("Session ended on this device. Attendance is saved locally and will sync after reconnecting.");
  });

  it("returns a locally ended session to Events instead of the unavailable-live-route error", () => {
    expect(eventManagementPage).toContain("const hasLocallyEndedSession = Boolean(");
    expect(eventManagementPage).toContain("!hasLocallyEndedSession");
    expect(eventManagementPage).toContain('search: ""');
    expect(eventManagementPage).toContain("Closing a local-end summary invalidates the live-session URL itself.");
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

  it("keeps stale prepared packages out of the offline event picker while retaining them for review", () => {
    expect(eventManagementPage).toContain("const preparedTodayEventIds = new Set(");
    expect(eventManagementPage).toContain("getManilaCalendarDate(new Date(summary.preparedAt)) === today");
    expect(eventManagementPage).toContain("preparedTodayEventIds.has(pkg.event.id)");
    expect(eventManagementPage).toContain("setOfflineSyncPresentations(presentations.filter");
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
    expect(eventManagementPage).toContain("const sessionSummary = finalizedSummary ?? summarizeFinalizedSession(activeRows, activeRegisteredParticipantCount, activeWalkInCount);");
  });

  it("uses the streamlined Event Summary layout after a live event ends", () => {
    expect(eventManagementPage).toContain(">Event Summary</h2>");
    expect(eventManagementPage).toContain('sm:col-span-2"><SummaryTile label="Attendance Rate"');
    expect(eventManagementPage).toContain('label="Total Participants"');
    expect(eventManagementPage).toContain('sessionSummary.walkIns > 0 ? <SummaryTile label="Walk-ins"');
    expect(eventManagementPage).not.toContain("Most Common Late Arrival Reason");
    expect(eventManagementPage).not.toContain("mostCommonLateReason");
  });

  it("starts and ends prepared attendance locally while offline", () => {
    expect(eventManagementPage).toContain("if (isOfflineMode)");
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
    expect(eventManagementPage).toContain('|| reconciliationState === "syncing"');
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
    expect(eventManagementPage).toContain("const preparedPackageAlreadyStarted = Boolean(");
    expect(eventManagementPage).toContain("const routeStartFallbackMatchesRoute = Boolean(");
    expect(eventManagementPage).toContain("!preparedPackageAlreadyStarted && localStartFallbackMatchesRoute");
    expect(eventManagementPage).toContain("setLocalStartPackage(endedPackage);");
    expect(eventManagementPage).toContain("setActiveEvent(null);");
    expect(eventManagementPage).toContain("Event records will be available after this offline session synchronizes.");
  });

  it("does not redirect a locally started live route while its reconnect is reconciling", () => {
    expect(eventManagementPage).toContain('|| reconciliationState === "syncing"');
    expect(eventManagementPage).toContain("server query can legitimately still report the event as scheduled here");
  });

  it("retains an already-open live route during a partial reconnect snapshot", () => {
    expect(eventManagementPage).toContain("isExistingLiveRouteAwaitingServerSnapshot");
    expect(eventManagementPage).toContain("const routedAttendanceSessionQuery = useAttendanceSession(");
    expect(eventManagementPage).toContain("routedAttendanceSessionQuery.data");
    expect(eventManagementPage).toContain("routedAttendanceSessionQuery.isFetching");
    expect(eventManagementPage).toContain("!serverReportsTerminalSession");
    expect(eventManagementPage).toContain("activeEvent?.id === serverRequestedSession.eventId ? activeEvent");
  });

  it("never treats a missing cached session-list row as proof that a live route ended", () => {
    expect(eventManagementPage).toContain("Only the exact-session query");
    expect(eventManagementPage).toContain("if (serverReportsTerminalSession && !attendanceSessionsQuery.isFetching && !eventsQuery.isFetching)");
  });

  it("keeps provisional offline Walk-ins visibly unverified until reconciliation finishes", () => {
    expect(eventManagementPage).toContain('id:`offline-walkin-${scan.localScanUuid}`');
    expect(eventManagementPage).toContain('studentName:`Walk-in · ${queued.studentNumber}`');
    expect(eventManagementPage).not.toMatch(/id:`offline-walkin-\$\{scan\.localScanUuid\}`[\s\S]{0,400}?verificationLabel:"Walk-in"/);
    expect(eventManagementPage).not.toMatch(/studentName:`Walk-in · \$\{queued\.studentNumber\}`[\s\S]{0,300}?verificationLabel:"Walk-in"/);
  });

  it("uses the real name and a badge only after an online Walk-in is confirmed", () => {
    expect(eventManagementPage).toContain('studentName: result.student?.displayName ?? knownStudent?.fullName ?? studentNumber');
    expect(eventManagementPage).toContain('studentName: walkInStudent.fullName ?? walkInNumber');
    expect(eventManagementPage).toContain('verificationLabel: "Walk-in"');
  });

  it("never redirects a live route from a stale ready-but-unstarted package", () => {
    expect(eventManagementPage).toContain("const hasLocallyReadyUnstartedSession = Boolean(");
    expect(eventManagementPage).toContain('offlineLocalSession.offlineLifecycle === "NOT_STARTED"');
    expect(eventManagementPage).not.toContain("if (hasLocallyReadyUnstartedSession) {");
    expect(eventManagementPage).toContain("Only the exact-session query");
    expect(eventManagementPage).toContain("!hasOfflineLiveWorkspace && !hasLocallyReadyUnstartedSession");
  });

  it("returns to Events when the session summary closes so an ended session cannot revive its live route", () => {
    const summaryClose = eventManagementPage.slice(
      eventManagementPage.indexOf("function closeSessionSummary()"),
      eventManagementPage.indexOf("function exportReport")
    );
    expect(summaryClose).toContain("setSummaryOpen(false);");
    expect(summaryClose).toContain('pathname: workspaceRoute(APP_ROUTES.organizerEvents, APP_ROUTES.adminEvents), search: ""');
    expect(summaryClose).toContain("{ replace: true }");
    expect(eventManagementPage).toContain("<ModalFrame onClose={closeSessionSummary} width=\"max-w-xl\">");
  });

  it("keeps saved offline-session details out of the Events page and behind an offline-only dialog", () => {
    const offlineCompletionDialog = eventManagementPage.slice(
      eventManagementPage.indexOf("{offlineCompletionOpen && isOfflineMode ? ("),
      eventManagementPage.indexOf("{completedModal ? (")
    );
    expect(eventManagementPage).toContain('isOfflineMode && activeTab === "today" && offlineSyncPresentations.length > 0');
    expect(eventManagementPage).toContain("View {offlineSyncPresentations.length} saved offline session");
    expect(offlineCompletionDialog).toContain("offlineCompletionOpen && isOfflineMode");
    expect(offlineCompletionDialog).toContain("No Event Record or retry action is available while offline.");
    expect(eventManagementPage).not.toContain("Offline session completion");
    expect(offlineCompletionDialog).not.toContain("View Event Record");
    expect(offlineCompletionDialog).not.toContain("Retry sync");
  });

  it("opens the full Event Details workspace for prepared offline packages", () => {
    expect(eventManagementPage).toContain("listOfflineEvents(session.userId)");
    expect(eventManagementPage).toContain("eventRecordFromOfflinePackage");
    expect(eventManagementPage).toContain("pkg.event.status !== \"cancelled\"");
    expect(eventManagementPage).toContain("Only a same-day scheduled package can be started.");
    expect(eventManagementPage).toContain("canManageOwnedEvents && !isOfflineMode");
    expect(eventManagementPage).toContain("if (!isOfflineMode && eventsQuery.isError && !hasOfflineLiveWorkspace)");
    expect(eventManagementPage).toContain("The Event Details workspace can render from this exact");
    expect(eventManagementPage).toContain("`${APP_ROUTES.organizerEvents}/${event.id}`");
    expect(eventManagementPage).not.toContain("Start Attendance");
    expect(eventManagementPage).not.toContain("openStartSession");
    expect(eventDetailsPage).toContain("const offlinePackage = isOfflineMode ? offline.preparedEvent : null;");
    expect(eventDetailsPage).toContain("const useRemoteData = !isOfflineMode;");
    expect(eventDetailsPage).toContain("offlineEventFromPackage");
    expect(eventDetailsPage).toContain("useOrganizerProfiles({ pageSize: 1 }, context, !isOfflineMode)");
    expect(eventDetailsPage).toContain("Never issue remote queries while offline");
    expect(eventManagementPage).not.toContain("OfflinePreparedEventsPanel");
  });

  it("uses the same scheduled-only eligibility check as the local offline-start guard", () => {
    expect(eventDetailsPage).toContain('item.status === "scheduled" && (item.offlineLifecycle ?? "NOT_STARTED") === "NOT_STARTED"');
    expect(eventDetailsPage).toContain("This event has no prepared local attendance session. Prepare it while online before starting offline.");
    expect(eventDetailsPage).toContain("The local attendance session did not enter its started state.");
  });

  it("does not wait for a remote Walk-in lookup before queuing offline manual attendance", () => {
    const localCapture = eventManagementPage.slice(
      eventManagementPage.indexOf("const recordManualLocally = async () =>"),
      eventManagementPage.indexOf("// A prepared package is used for local-authoritative/offline attendance")
    );
    expect(localCapture).toContain("SQLite queue already deduplicates");
    expect(localCapture).not.toContain("await findRemoteWalkIn(studentNumber)");
    expect(localCapture).toContain("await api.queueWalkInScan({");
  });

  it("paces every attendance capture for one second to prevent burst reconciliation", () => {
    expect(eventManagementPage).toContain("const attendanceCaptureCooldownUntilRef = useRef(0);");
    expect(eventManagementPage).toContain("attendanceCaptureCooldownUntilRef.current = now + 1_000;");
    expect(eventManagementPage).toContain("if (facialVerifying || !beginAttendanceCapture()) return;");
    expect(eventManagementPage).toContain("if (!beginAttendanceCapture()) return;");
    expect(eventManagementPage).toContain("Please wait one second before recording the next student.");
    expect(eventManagementPage).toContain('disabled={isCaptureCoolingDown}');
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

  it("uses the server capture-phase RPC when the session is online even if a downloaded package remains", () => {
    expect(eventManagementPage).toContain("if (isOfflineMode) {");
    expect(eventManagementPage).toContain("serverPhase = await advanceServerAttendanceCapturePhase(activeScannerSessionId ?? \"\");");
    expect(eventManagementPage).not.toContain("serverPhase = await advanceServerAttendanceCapturePhase(activeScannerSessionId ?? \"\");\n          if (hasLocalSession)");
  });

  it("restores the persisted server Time Out phase in browser workspaces without an Electron bridge", () => {
    expect(eventManagementPage).toContain("Browser sessions must not fall back to");
    expect(eventManagementPage).toContain("if (!api || !activeEvent?.id || !session?.userId) {");
    expect(eventManagementPage).toContain("void getServerAttendanceCapturePhase(activeScannerSessionId)");
  });

  it("rechecks the server capture phase before online manual attendance", () => {
    expect(eventManagementPage).toContain("A capture-phase switch is persisted centrally.");
    expect(eventManagementPage).toContain("effectiveAttendancePhase = await getServerAttendanceCapturePhase(sessionId);");
    expect(eventManagementPage).toContain("Could not verify whether this session is recording Time In or Time Out.");
    expect(eventManagementPage).toContain('const isCheckout = effectiveAttendancePhase === "time_out";');
  });

  it("checks out an accepted Walk-in before asking for another admission", () => {
    expect(eventManagementPage).toContain("Participant identities may still be the pre-admission snapshot after a");
    expect(eventManagementPage).toContain('if (effectiveAttendancePhase === "time_out" && existingWalkIn) {');
    expect(eventManagementPage).toContain('toast.success(`Walk-in ${existingWalkIn.studentNumber}: Time Out saved`);');
  });

  it("rechecks the server capture phase before online QR attendance", () => {
    expect(eventManagementPage).toContain("QR scans can arrive immediately after the organizer opens Time Out.");
    expect(eventManagementPage).toContain("const effectiveOnlinePhase = await getServerAttendanceCapturePhase(sessionId);");
    expect(eventManagementPage).toContain('if (effectiveOnlinePhase === "time_out") {');
    expect(eventManagementPage).toContain('toast.warning("No Walk-in Time In is recorded for this student.");');
  });

  it("retains the durable Walk-in origin when hydrating the live attendee list", () => {
    expect(eventManagementPage).toContain('verificationLabel: record.attendanceOrigin === "walk_in" ? "Walk-in" : "Verified"');
    expect(eventManagementPage).toContain('<StatusBadge label="Walk-in" tone="warning" />');
  });

  it("renders each live attendee with a surname-first name and student number", () => {
    expect(eventManagementPage).toContain("function formatAttendanceListName(fullName: string)");
    expect(eventManagementPage).toContain("function provisionalWalkInStudentNumber(studentName: string)");
    expect(eventManagementPage).toContain("const participant = activeParticipantIdentityByStudentId.get(row.original.studentId);");
    expect(eventManagementPage).toContain('className="min-w-36"');
    expect(eventManagementPage).toContain('className="flex items-center gap-1.5"');
    expect(eventManagementPage).toContain('className="leading-tight"');
    expect(eventManagementPage).toContain('className="font-medium text-foreground"');
    expect(eventManagementPage).toContain('className="mt-px font-mono text-sm text-muted-foreground"');
    expect(eventManagementPage).toContain("row.original.verificationLabel === \"Walk-in\"");
  });

  it("keeps Time In and Time Out compact so student names have room", () => {
    expect(eventManagementPage).toContain('meta: { agGrid: { flex: 2, minWidth: 300 } }');
    expect(eventManagementPage).toContain('meta: { agGrid: { width: 120, minWidth: 120, flex: 0 } }');
    expect(eventManagementPage).toContain('meta: { agGrid: { width: 136, minWidth: 136, flex: 0 } }');
    expect(eventManagementPage).toContain('meta: { agGrid: { width: 170, minWidth: 150, flex: 0 } }');
  });

  it("lists confirmed Walk-ins before invited attendees while retaining alphabetical order", () => {
    expect(eventManagementPage).toContain('const walkInOrder = Number(right.verificationLabel === "Walk-in") - Number(left.verificationLabel === "Walk-in");');
    expect(eventManagementPage).toContain('return leftName.localeCompare(rightName, undefined, { numeric: true, sensitivity: "base" });');
  });

  it("uses the live-table space for attendance details instead of a late-arrival category column", () => {
    expect(eventManagementPage).not.toContain('id: "lateReason", header: "Late Arrival Category"');
  });

  it("opens attendance readiness for the clicked grid row without bubbling into a recycled row", () => {
    expect(eventManagementPage).toContain("event.stopPropagation();");
    expect(eventManagementPage).toContain("setReadinessEvent({ ...row.original });");
  });

  it("returns QR submission to Supabase after a local start is reconciled", () => {
    expect(eventManagementPage).toContain("const { session, isOfflineMode, reconciliationState, hasOfflineWork } = useDevelopmentSession();");
    expect(eventManagementPage).toContain("reconciliationJustCompleted");
    expect(eventManagementPage).toContain("void refreshOfflineLive()");
    expect(eventManagementPage).toContain("if (desktopApi() && isLocalAuthoritativeSession)");
    expect(eventManagementPage).toContain("const result = await credentialScanMutation.mutateAsync");
    expect(eventManagementPage).toContain("isLocalAuthoritativeSession || isOfflineMode || networkFailure");
  });

  it("keeps an offline-ended event visible with a safe, read-only synchronization state", () => {
    expect(eventManagementPage).toContain("Saved offline sessions");
    expect(eventManagementPage).toContain("Saved on this device — awaiting synchronization");
    expect(eventManagementPage).toContain("Available after synchronization completes");
    expect(eventManagementPage).toContain("offlineSyncPresentations");
    expect(eventManagementPage).toContain("Waiting for connection");
    expect(eventManagementPage).toContain("Finalization confirmed");
    expect(eventManagementPage).toContain("getOfflineCompletionLifecycle");
    expect(eventManagementPage).toContain("No Event Record or retry action is available while offline.");
    expect(eventManagementPage).toContain("offlineCompletionOpen && isOfflineMode");
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
