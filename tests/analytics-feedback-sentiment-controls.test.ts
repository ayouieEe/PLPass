import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/organizer/pages/OrganizerAnalyticsPage.tsx", "utf8");

describe("Feedback and Sentiment analytics controls", () => {
  it("supports event search, a clear selection, event-scoped objective ratings, and remarks", () => {
    expect(source).toContain('placeholder="Search feedback events"');
    expect(source).toContain('aria-label="Clear selected feedback event"');
    expect(source).toContain('const dateRangeApplies = activeTab !== "sentiment" || eventFilter === "all"');
    expect(source).toContain('const responseCount = obj.ratingCount && obj.ratingCount > 0 ? obj.ratingCount : 1;');
    expect(source).toContain('ChartPanel title="Student Remarks"');
    expect(source).toContain('data={remarkSentimentData}');
  });

  it("keeps event and date controls grouped, with one reset action", () => {
    expect(source).toContain('Date range</span>');
    expect(source).toContain('Limit results to a recent period or a custom date range.');
    expect(source).toContain('Reset filters');
    expect(source).toContain('setFeedbackEventSearch("");');
  });
});
