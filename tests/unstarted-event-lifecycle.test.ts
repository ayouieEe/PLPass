import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260923170049_enforce_unstarted_event_lifecycle.sql", "utf8");
const notificationsPage = readFileSync("src/pages/NotificationsPage.tsx", "utf8");
const eventManagementPage = readFileSync("src/features/organizer/pages/EventManagementPage.tsx", "utf8");

describe("unstarted event lifecycle", () => {
  it("enforces reminder and cancellation from a private scheduled database function", () => {
    expect(migration).toContain("create or replace function private.enforce_unstarted_event_lifecycle");
    expect(migration).toContain("'event.lifecycle.unstarted'");
    expect(migration).toContain("actual_start is not null");
    expect(migration).toContain("event.auto_cancelled_unstarted");
    expect(migration).toContain("'*/5 * * * *'");
    expect(migration).toContain("revoke all on function private.enforce_unstarted_event_lifecycle");
  });

  it("exposes separate organizer reschedule and cancellation actions", () => {
    expect(notificationsPage).toContain('notification.code === "event.lifecycle.unstarted"');
    expect(notificationsPage).toContain('lifecycleAction=reschedule');
    expect(notificationsPage).toContain('lifecycleAction=cancel');
    expect(eventManagementPage).toContain('notificationCode: "event.lifecycle.unstarted"');
    expect(eventManagementPage).not.toContain("autoCancelledEventIdsRef");
  });
});
