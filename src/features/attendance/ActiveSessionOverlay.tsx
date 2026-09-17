import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAttendanceSessions, useEvents } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { hasAnyCapability } from "@/lib/auth/permissions";

export function ActiveSessionOverlay() {
  const { session } = useDevelopmentSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    left: number;
    top: number;
  } | null>(null);
  const didDragRef = useRef(false);

  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );

  const sessionsQuery = useAttendanceSessions({ pageSize: 200 }, context);
  const eventsQuery = useEvents({ pageSize: 200 }, context);

  // Only show for organizers and admins
  if (!session || !hasAnyCapability(session.role, ["events.manage.owned", "attendance.manage.owned"])) {
    return null;
  }

  // The current live attendance workspace is represented by the session query
  // on the Events route.
  const currentSessionId = new URLSearchParams(location.search).get("session");

  if (sessionsQuery.isLoading || !sessionsQuery.data || eventsQuery.isLoading || !eventsQuery.data) {
    return null;
  }

  // Session status is the organizer's source of truth. A session remains
  // resumable until End Session is completed, even if its scheduled clock
  // window has passed or it already contains attendance records.
  const liveSessions = sessionsQuery.data.items
    .filter((candidate) => candidate.status === "active")
    .filter((candidate) => {
      const event = eventsQuery.data.items.find((item) => item.id === candidate.eventId);
      if (!event || event.status === "cancelled" || event.status === "completed") return false;
      return true;
    });
  const activeSession = [...liveSessions].sort((left, right) => {
    const leftCreated = new Date(left.createdAt ?? left.attendanceWindowStartAt ?? left.startsAt).getTime();
    const rightCreated = new Date(right.createdAt ?? right.attendanceWindowStartAt ?? right.startsAt).getTime();
    return rightCreated - leftCreated;
  })[0];

  if (!activeSession) {
    return null;
  }

  const isAdminRoute = location.pathname.startsWith(`${APP_ROUTES.admin}/`);
  const eventsRoute = isAdminRoute ? APP_ROUTES.adminEvents : APP_ROUTES.organizerEvents;
  const eventDetailPrefix = `${eventsRoute}/`;
  const currentEventId = location.pathname.startsWith(eventDetailPrefix)
    ? decodeURIComponent(location.pathname.slice(eventDetailPrefix.length).split("/")[0])
    : undefined;
  const isLiveAttendanceWorkspace = location.pathname.startsWith(`${APP_ROUTES.organizerLiveAttendance}/`)
    || location.pathname.startsWith(`${APP_ROUTES.admin}/live-attendance/`);

  if (
    (location.pathname === eventsRoute && Boolean(currentSessionId)) ||
    isLiveAttendanceWorkspace ||
    currentEventId === activeSession.eventId
  ) {
    return null;
  }

  const event = eventsQuery.data?.items.find((e) => e.id === activeSession.eventId);
  const title = event?.title || activeSession.title;
  const liveSessionPath = isAdminRoute
    ? APP_ROUTES.adminLiveSession(activeSession.id)
    : APP_ROUTES.organizerLiveSession(activeSession.id);

  function openLiveSession() {
    if (location.pathname === APP_ROUTES.organizerCreateEvent) {
      window.dispatchEvent(new CustomEvent("plpass:leave-create-event-confirm", {
        detail: { nextPath: liveSessionPath }
      }));
      return;
    }
    navigate(liveSessionPath);
  }

  function handlePointerDown(pointerEvent: React.PointerEvent<HTMLDivElement>) {
    if (pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0) return;
    const rect = pointerEvent.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: pointerEvent.pointerId,
      clientX: pointerEvent.clientX,
      clientY: pointerEvent.clientY,
      left: rect.left,
      top: rect.top
    };
    didDragRef.current = false;
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handlePointerMove(pointerEvent: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerEvent.pointerId) return;
    const deltaX = pointerEvent.clientX - drag.clientX;
    const deltaY = pointerEvent.clientY - drag.clientY;
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) didDragRef.current = true;
    const width = pointerEvent.currentTarget.offsetWidth;
    const height = pointerEvent.currentTarget.offsetHeight;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    setPosition({
      left: Math.min(Math.max(8, drag.left + deltaX), maxLeft),
      top: Math.min(Math.max(8, drag.top + deltaY), maxTop)
    });
  }

  function handlePointerUp(pointerEvent: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== pointerEvent.pointerId) return;
    if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) {
      pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    }
    dragRef.current = null;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        openLiveSession();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openLiveSession();
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={position ? { left: position.left, top: position.top } : undefined}
      className={`${position ? "fixed" : "fixed bottom-6 right-6"} z-50 flex touch-none cursor-grab items-center gap-3 overflow-hidden rounded-full bg-primary py-3 pl-4 pr-5 text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-in slide-in-from-bottom-5 fade-in duration-300`}
      aria-label="Return to active live session"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
        <Radio className="h-4 w-4 animate-pulse" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-medium uppercase tracking-wider text-primary-foreground/80">
          Live Session Ongoing
        </span>
        <span className="max-w-[200px] truncate text-sm font-semibold">
          {title}
        </span>
      </div>
    </div>
  );
}
