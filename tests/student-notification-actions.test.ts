import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const notificationsPage = readFileSync("src/pages/NotificationsPage.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260925000000_fix_account_status_notification_action_state.sql", "utf8");

describe("student notification actions", () => {
  it("routes feedback and late-reason notifications to the valid attendance workflow", () => {
    expect(notificationsPage).toContain('label: "Answer feedback"');
    expect(notificationsPage).toContain('label: "Submit late reason"');
    expect(notificationsPage).toContain("APP_ROUTES.studentAttendance}?pendingTasks=1");
    expect(notificationsPage).not.toContain('to: "/student/feedback"');
  });

  it("does not render list-level open-action buttons and suppresses account-status actions", () => {
    expect(notificationsPage).toContain("function notificationHasUserAction");
    expect(notificationsPage).toContain('notification.code === "account.status_changed"');
    expect(notificationsPage).toContain("setSelectedNotification(notification)");
    expect(notificationsPage).not.toContain("{actions.map((action)");
  });

  it("normalizes account-status notifications in the database as informational", () => {
    expect(migration).toContain("new.requires_action := false");
    expect(migration).toContain("new.action_url := null");
    expect(migration).toContain("where notification_code = 'account.status_changed'");
  });
});
