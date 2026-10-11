import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261011110000_repair_feedback_task_notification_trigger.sql",
  "utf8"
);

describe("feedback-task notification trigger repair", () => {
  it("uses one task reference and cannot roll back session completion for notification delivery", () => {
    expect(migration).toContain("'unread', '/student/feedback', new.id,");
    expect(migration).toContain("exception when others then");
    expect(migration).toContain("Feedback task notification skipped");
    expect(migration).not.toContain("'event_feedback_task', new.id,");
  });
});
