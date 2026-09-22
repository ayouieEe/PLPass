import { describe, expect, it } from "vitest";
import { canAccessOfflineRoute, isOfflineOrganizerRoute } from "@/app/router/offlineRoutePolicy";
import { APP_ROUTES } from "@/lib/constants/routes";

describe("offline organizer route policy", () => {
  it("keeps event navigation available", () => {
    expect(isOfflineOrganizerRoute(APP_ROUTES.organizerEvents)).toBe(true);
    expect(isOfflineOrganizerRoute("/organizer/events/event-1")).toBe(true);
    expect(isOfflineOrganizerRoute("/organizer/live-attendance/session-1")).toBe(true);
    expect(canAccessOfflineRoute("organizer", "/organizer/live-attendance/session-1")).toBe(true);
  });

  it("blocks unrelated workspaces and non-organizers", () => {
    expect(isOfflineOrganizerRoute(APP_ROUTES.notifications)).toBe(false);
    expect(canAccessOfflineRoute("organizer", APP_ROUTES.organizerSettings)).toBe(false);
    expect(canAccessOfflineRoute("admin", APP_ROUTES.organizerEvents)).toBe(false);
  });
});
