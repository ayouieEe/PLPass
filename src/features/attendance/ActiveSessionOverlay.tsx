import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Radio } from "lucide-react";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAttendanceSessions, useEvents } from "@/hooks/useRepositoryQueries";
import { APP_ROUTES } from "@/lib/constants/routes";

export function ActiveSessionOverlay() {
  const { session } = useDevelopmentSession();
  const location = useLocation();
  const navigate = useNavigate();

  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );

  const sessionsQuery = useAttendanceSessions({ pageSize: 200 }, context);
  const eventsQuery = useEvents({ pageSize: 200 }, context);

  // Only show for organizers and admins
  if (!session || (session.role !== "organizer" && session.role !== "admin")) {
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(APP_ROUTES.organizerLiveSession(activeSession.id))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(APP_ROUTES.organizerLiveSession(activeSession.id));
        }
      }}
      className="fixed bottom-6 right-6 z-50 flex cursor-pointer items-center gap-3 overflow-hidden rounded-full bg-primary py-3 pl-4 pr-5 text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-in slide-in-from-bottom-5 fade-in duration-300"
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
