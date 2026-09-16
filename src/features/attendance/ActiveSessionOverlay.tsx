import { useMemo, useRef, useState, type PointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { ConfirmModal } from "@/components/modals/ConfirmModal";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAttendanceSessions, useEvents } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";
import { hasAnyCapability } from "@/lib/auth/permissions";

export function ActiveSessionOverlay() {
  const { session } = useDevelopmentSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const dragStartRef = useRef<{ pointerId: number; clientX: number; clientY: number; left: number; top: number } | null>(null);
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

  if (location.pathname === APP_ROUTES.organizerEvents && currentSessionId === activeSession.id) {
    return null;
  }

  const event = eventsQuery.data?.items.find((e) => e.id === activeSession.eventId);
  const title = event?.title || activeSession.title;
  const isCreateEventRoute = location.pathname === APP_ROUTES.organizerCreateEvent || location.pathname === APP_ROUTES.adminCreateEvent;

  function openLiveSession() {
    setIsConfirmOpen(false);
    const nextPath = location.pathname.startsWith("/admin")
      ? APP_ROUTES.adminLiveSession(activeSession.id)
      : APP_ROUTES.organizerLiveSession(activeSession.id);

    if (isCreateEventRoute) {
      window.dispatchEvent(new CustomEvent("plpass:leave-create-event-confirm", { detail: { nextPath } }));
      return;
    }

    navigate(nextPath);
  }

  function handlePointerDown(pointerEvent: PointerEvent<HTMLDivElement>) {
    if (pointerEvent.button !== 0) return;
    const bounds = pointerEvent.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      pointerId: pointerEvent.pointerId,
      clientX: pointerEvent.clientX,
      clientY: pointerEvent.clientY,
      left: bounds.left,
      top: bounds.top
    };
    didDragRef.current = false;
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
  }

  function handlePointerMove(pointerEvent: PointerEvent<HTMLDivElement>) {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== pointerEvent.pointerId) return;

    const horizontalDelta = pointerEvent.clientX - dragStart.clientX;
    const verticalDelta = pointerEvent.clientY - dragStart.clientY;
    if (Math.abs(horizontalDelta) > 3 || Math.abs(verticalDelta) > 3) didDragRef.current = true;

    const width = pointerEvent.currentTarget.offsetWidth;
    const height = pointerEvent.currentTarget.offsetHeight;
    setPosition({
      left: Math.min(Math.max(8, dragStart.left + horizontalDelta), window.innerWidth - width - 8),
      top: Math.min(Math.max(8, dragStart.top + verticalDelta), window.innerHeight - height - 8)
    });
  }

  function handlePointerUp(pointerEvent: PointerEvent<HTMLDivElement>) {
    if (dragStartRef.current?.pointerId !== pointerEvent.pointerId) return;
    dragStartRef.current = null;
    pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId);
    // A drag should not consume the next genuine click if the browser does not
    // emit a click event after pointer release.
    if (didDragRef.current) window.setTimeout(() => { didDragRef.current = false; }, 0);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          if (isCreateEventRoute) {
            const nextPath = location.pathname.startsWith("/admin")
              ? APP_ROUTES.adminLiveSession(activeSession.id)
              : APP_ROUTES.organizerLiveSession(activeSession.id);
            window.dispatchEvent(new CustomEvent("plpass:leave-create-event-confirm", { detail: { nextPath } }));
            return;
          }
          navigate(APP_ROUTES.organizerLiveSession(activeSession.id));
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (isCreateEventRoute) {
              const nextPath = location.pathname.startsWith("/admin")
                ? APP_ROUTES.adminLiveSession(activeSession.id)
                : APP_ROUTES.organizerLiveSession(activeSession.id);
              window.dispatchEvent(new CustomEvent("plpass:leave-create-event-confirm", { detail: { nextPath } }));
              return;
            }
            navigate(APP_ROUTES.organizerLiveSession(activeSession.id));
          }
        }}
        className={`fixed z-50 flex touch-none cursor-grab items-center gap-3 overflow-hidden rounded-full bg-primary py-3 pl-4 pr-5 text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing animate-in slide-in-from-bottom-5 fade-in duration-300 ${position ? "" : "bottom-6 right-6"}`}
        style={position ?? undefined}
        aria-label="Return to active live session"
        title="Drag to reposition. Click to return to the live session."
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

    </>
  );
}
