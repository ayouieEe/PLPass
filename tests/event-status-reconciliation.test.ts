import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260917170000_reconcile_ongoing_event_status.sql"),
  "utf8"
);

describe("ongoing event status reconciliation", () => {
  it("promotes only events backed by active ongoing sessions", () => {
    expect(migration).toContain("set event_status = 'ongoing'");
    expect(migration).toContain("session.session_status = 'ongoing'");
    expect(migration).toContain("coalesce(session.session_archive_status, 'active') = 'active'");
    expect(migration).toContain("event.event_status not in ('completed', 'cancelled')");
  });

  it("does not infer statuses for events without an ongoing session", () => {
    expect(migration).not.toMatch(/set event_status\s*=\s*'approved'/i);
    expect(migration).not.toMatch(/set event_status\s*=\s*'scheduled'/i);
  });
});
