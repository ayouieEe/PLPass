import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("feedback and attendance repair regressions", () => {
  it("derives the final sentiment percentage so the constrained total is exact", () => {
    const migration = read("supabase/migrations/20261012000100_repair_feedback_phase_and_legal_functions.sql");
    expect(migration).toContain("negative_percent = 100 - _positive_percent - _neutral_percent");
    expect(migration).toContain("sentiment_label in ('positive', 'neutral', 'negative')");
  });

  it("does not ask the organizer-only phase RPC from a read-only monitor", () => {
    const page = read("src/features/organizer/pages/EventManagementPage.tsx");
    expect(page).toContain("if (isReadOnlyMonitor) {");
    expect(page).toContain("applyPhase(\"time_in\");");
    expect(page).toContain("isReadOnlyMonitor, session?.userId");
  });

  it("qualifies legal-document columns that collide with returned field names", () => {
    const migration = read("supabase/migrations/20261012000100_repair_feedback_phase_and_legal_functions.sql");
    const conflictTargetMigration = read("supabase/migrations/20261012000101_resolve_legal_document_conflict_target.sql");
    expect(migration).toContain("existing_document.document_type = p_document_type");
    expect(migration).toContain("published_document.document_type = p_document_type");
    expect(conflictTargetMigration).toContain("#variable_conflict use_column");
  });
});
