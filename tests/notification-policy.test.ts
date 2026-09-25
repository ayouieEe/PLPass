import { describe, expect, it } from "vitest";
import {
  categoriesForRole,
  isNotificationVisibleForRole,
  notificationCategory
} from "@/lib/notifications/policy";
import type { Notification } from "@/types/domain";

const notification = (overrides: Partial<Notification>): Notification => ({
  id: "notification-test",
  userId: "user-test",
  type: "system",
  title: "Test notification",
  body: "Test body",
  status: "unread",
  createdAt: "2026-09-14T00:00:00.000Z",
  ...overrides
});

describe("role notification policy", () => {
  it("exposes only the relevant category groups per role", () => {
    expect(categoriesForRole("student")).toEqual(["attendance", "events", "requests", "credentials", "security"]);
    expect(categoriesForRole("organizer")).toEqual(["events", "requests", "security"]);
    expect(categoriesForRole("admin")).toEqual(["security", "system", "events"]);
    expect(categoriesForRole("department_admin")).toEqual(["security", "system", "events"]);
  });

  it("classifies explicit notification codes before legacy types", () => {
    expect(notificationCategory(notification({ type: "system", code: "event.invited" }))).toBe("events");
    expect(notificationCategory(notification({ type: "system", code: "security.account_suspended" }))).toBe("security");
    expect(notificationCategory(notification({ type: "report", code: "report.failed" }))).toBe("reports");
  });

  it("does not expose organizer reports or student credentials to admins", () => {
    expect(isNotificationVisibleForRole(notification({ type: "report", code: "report.failed" }), "admin")).toBe(false);
    expect(isNotificationVisibleForRole(notification({ type: "system", code: "credential.request_rejected" }), "admin")).toBe(false);
    expect(isNotificationVisibleForRole(notification({ type: "system", code: "event.started" }), "admin")).toBe(true);
    expect(isNotificationVisibleForRole(notification({ type: "system", code: "attendance.finalized" }), "department_admin")).toBe(false);
    expect(isNotificationVisibleForRole(notification({ type: "system", code: "event.rescheduled" }), "organizer")).toBe(false);
    expect(isNotificationVisibleForRole(notification({ type: "correction", code: "correction.review_requested" }), "organizer")).toBe(true);
    expect(isNotificationVisibleForRole(notification({ type: "system", code: "account.status_changed" }), "organizer")).toBe(true);
    expect(isNotificationVisibleForRole(notification({ type: "system", code: "system.exception.email_delivery_failed" }), "admin")).toBe(true);
  });
});
