import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260925120000_tighten_admin_organizer_notifications.sql", "utf8");
const notificationsPage = readFileSync("src/pages/NotificationsPage.tsx", "utf8");
const settingsPage = readFileSync("src/features/organizer/pages/OrganizerSettingsPage.tsx", "utf8");

describe("tightened admin and organizer notification delivery", () => {
  it("enforces role audiences and department scope in the trusted database helper", () => {
    expect(migration).toContain("p_notification_code = 'event.started'");
    expect(migration).toContain("p_notification_code = 'correction.review_requested'");
    expect(migration).toContain("p_notification_code = 'event.lifecycle.unstarted'");
    expect(migration).toContain("p.role = 'admin'");
    expect(migration).toContain("p.role = 'department_admin' and p.department_id = v_event.department_id");
    expect(migration).toContain("v_event_department_id is distinct from v_department_id");
    expect(migration).toContain("student\n-- cancellation notices");
    expect(migration).not.toContain("drop trigger if exists notify_event_workflow_after_update");
    expect(migration).toContain("avoid reading OLD during INSERT triggers");
    expect(migration).toContain("create trigger notify_admin_event_started_after_update");
  });

  it("keeps informational notifications free of generic action buttons", () => {
    expect(notificationsPage).not.toContain('return [{ label: "Open action"');
    expect(notificationsPage).toContain('notification.code === "account.status_changed"');
    expect(notificationsPage).toContain('notification.code === "event.lifecycle.unstarted"');
  });

  it("removes the obsolete event approval setting from active settings UI", () => {
    expect(settingsPage).not.toContain("Require event approval");
    expect(settingsPage).not.toContain("eventApprovalRequired");
  });
});
