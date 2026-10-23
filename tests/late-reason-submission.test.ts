import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  resolve(process.cwd(), "src/features/student/pages/StudentEventDetailsPage.tsx"),
  "utf8"
);
const queries = readFileSync(
  resolve(process.cwd(), "src/hooks/useRepositoryQueries.ts"),
  "utf8"
);
const duplicateOtherMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261023182232_reject_duplicate_other_late_reason.sql"),
  "utf8"
);

describe("late-reason submission safeguards", () => {
  it("does not offer an expired late-reason task and preserves the server decision", () => {
    expect(page).toContain("const lateReasonDeadlinePassed = Boolean(feedbackTask && !feedbackTaskIsActionable);");
    expect(page).toContain("const lateReasonRequired = workflow.requiresLateReason && !lateReasonDeadlinePassed;");
    expect(page).toContain("toast.error(getErrorMessage(error))");
  });

  it("times out a stalled late-reason request", () => {
    expect(queries).toContain("Submitting the late reason took too long. Check the connection and try again.");
  });

  it("keeps the late-reason modal open while submission is pending", () => {
    expect(page).toContain("if (!submitLateReasonMutation.isPending) setLateReasonModalOpen(false);");
    expect(page).toContain("disabled={isSubmitting}");
  });

  it("rejects an Other reason that repeats an active preset, in the UI and database", () => {
    expect(page).toContain('const normalizedCustomReason = customLateReason.trim().replace(/\\s+/g, " ").toLocaleLowerCase();');
    expect(page).toContain('toast.error(`Select "${matchingPresetReason.label}" instead of Other.`);');
    expect(duplicateOtherMigration).toContain("v_normalized_custom_reason := lower(regexp_replace(v_custom_reason, '\\s+', ' ', 'g'));");
    expect(duplicateOtherMigration).toContain("option_row.code <> 'other'");
    expect(duplicateOtherMigration).toContain("Select the matching late reason instead of Other.");
    expect(duplicateOtherMigration).toContain("attendance_late_reason_option_translations");
  });
});
