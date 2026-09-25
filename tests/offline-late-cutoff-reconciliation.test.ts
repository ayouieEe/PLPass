import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260925070452_rebase_offline_late_cutoff_to_actual_start.sql"),
  "utf8"
);

describe("offline actual-start late cutoff reconciliation", () => {
  it("preserves the prepared late-duration but anchors it to the actual start", () => {
    expect(migration).toContain("v_session.late_cutoff_at - v_prepared_start");
    expect(migration).toContain("late_cutoff_at = p_actual_start + make_interval(mins => v_late_cutoff_minutes)");
  });

  it("keeps lifecycle reconciliation owner-scoped and explicitly executable only by signed-in users", () => {
    expect(migration).toContain("e.organizer_id = private.current_organizer_id()");
    expect(migration).toContain("revoke all on function public.reconcile_offline_event_session_start(uuid, timestamptz) from public, anon");
    expect(migration).toContain("grant execute on function public.reconcile_offline_event_session_start(uuid, timestamptz) to authenticated");
  });
});
