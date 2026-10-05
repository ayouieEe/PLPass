import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const studentEventDetails = readFileSync(
  resolve(process.cwd(), "src/features/student/pages/StudentEventDetailsPage.tsx"),
  "utf8"
);
const analyzeFeedback = readFileSync(
  resolve(process.cwd(), "supabase/functions/analyze-feedback/index.ts"),
  "utf8"
);

describe("feedback submission safeguards", () => {
  it("shows a pending state and locks feedback controls while submitting", () => {
    expect(studentEventDetails).toContain("isSubmitting ? \"Submitting…\" : \"Submit Feedback\"");
    expect(studentEventDetails).toContain("aria-busy={isSubmitting}");
    expect(studentEventDetails).toContain("disabled={isSubmitting}");
    expect(studentEventDetails).toContain("if (!feedbackQuery.submitMutation.isPending) setFeedbackModalOpen(false)");
  });

  it("times out external sentiment analysis without blocking feedback persistence", () => {
    expect(analyzeFeedback).toContain("setTimeout(() => controller.abort(), 8_000)");
    expect(analyzeFeedback).toContain("submitting feedback with neutral sentiment");
    expect(analyzeFeedback).toContain("clearTimeout(timeoutId)");
  });
});
