import { describe, expect, it } from "vitest";
import { actionableRecommendation, attendanceTrendSummary, feedbackLabelSummary, lateArrivalCategory, lateArrivalReportRows, lateArrivalSummary, objectiveResultReportRows, sentimentReportRows } from "@/features/organizer/utils/postEventReportData";

describe("post-event report data", () => {
  it("keeps feedback counts separate from percentages", () => {
    expect(sentimentReportRows({ positive: 62, neutral: 9, negative: 7 })).toEqual([
      { "Feedback label": "Positive", Responses: 62, Share: "79%", "Labelled feedback": 78 },
      { "Feedback label": "Neutral", Responses: 9, Share: "12%", "Labelled feedback": 78 },
      { "Feedback label": "Negative", Responses: 7, Share: "9%", "Labelled feedback": 78 }
    ]);
  });

  it("uses plain-language empty states instead of invented findings", () => {
    expect(lateArrivalReportRows([{ reason: "Traffic / Commute", count: 0 }])).toEqual([{ Status: "No late arrivals recorded." }]);
    expect(objectiveResultReportRows([])).toEqual([{ Status: "No objective ratings received." }]);
    expect(sentimentReportRows({ positive: 0, neutral: 0, negative: 0 })).toEqual([{ Status: "No labelled feedback received." }]);
  });

  it("reports late-arrival shares and objective response counts", () => {
    expect(lateArrivalReportRows([{ reason: "Traffic / Commute", count: 3 }, { reason: "Other", count: 1 }])).toEqual([
      { "Late-arrival reason": "Traffic / Commute", "Late arrivals": 3, "Share of late arrivals": "75%" },
      { "Late-arrival reason": "Other", "Late arrivals": 1, "Share of late arrivals": "25%" }
    ]);
    expect(objectiveResultReportRows([{ eventCode: "EVT-1", objective: "Apply the session topic", averageRating: 8.25, responseCount: 4 }])).toEqual([
      { "Event Code": "EVT-1", Objective: "Apply the session topic", "Average rating (out of 9)": "8.3", Responses: 4 }
    ]);
  });

  it("returns one direct action from the strongest recorded result", () => {
    expect(actionableRecommendation({
      attendanceRate: 64,
      objective: { label: "Apply the session topic", averageRating: 6.2, responseCount: 4 },
      negativeFeedback: { count: 3, total: 10 },
      lateArrival: { reason: "Traffic / Commute", count: 8, total: 10 }
    })).toBe('Improve the aspect measured by "Apply the session topic" before the next event. Its average rating is 6.2 out of 9 from 4 responses, indicating a mixed result. Use the available feedback to identify the specific weakness and make one targeted improvement.');
    expect(actionableRecommendation({ objective: { label: "Attend similar events", averageRating: 2, responseCount: 1 } }))
      .toBe("Investigate why interest in attending a similar event was low. The rating was 2.0 out of 9 from 1 response, suggesting the respondent was unlikely to return. Review the event's content, timing, venue, and overall experience before planning the next event. Treat this as an early signal because the response count is small.");
    expect(actionableRecommendation({ objective: { label: "How likely are you to attend similar events in the future?", averageRating: 2, responseCount: 1 } }))
      .toContain("suggesting the respondent was unlikely to return");
    expect(actionableRecommendation({ objective: { label: "How would you rate the taste and quality of the food?", averageRating: 6.1, responseCount: 8, relatedComments: ["The food was cold and serving time was too long."] } }))
      .toContain("food or serving quality");
    expect(actionableRecommendation({ objective: { label: "Overall event experience", averageRating: 7, responseCount: 32 } })).toBeUndefined();
    expect(actionableRecommendation({ objective: { label: "How would you rate the taste and quality of the food?", averageRating: 6.96, responseCount: 32 } })).toBeUndefined();
    expect(actionableRecommendation({ lateArrival: { reason: "Traffic / Commute", count: 3, total: 4 } }))
      .toBe('Plan around the most common late-arrival pattern: "Traffic / Commute" accounts for 3 of 4 late check-ins (75%). Send an earlier arrival reminder and allow extra travel time.');
    expect(actionableRecommendation({ attendanceRate: 92 })).toBeUndefined();
  });

  it("interprets chart values instead of only listing raw data", () => {
    expect(attendanceTrendSummary([64, 72, 80])).toBe("Recorded attendance averaged 72% across 3 completed events, ranged from 64% to 80%, and increased by 16 percentage points from the first to the latest event.");
    expect(feedbackLabelSummary({ positive: 0, neutral: 1, negative: 0 })).toContain("Of 1 labelled feedback response, 0 (0%) were positive, 1 (100%) neutral, and 0 (0%) negative.");
    expect(lateArrivalSummary([{ reason: "Traffic / Commute", count: 3 }, { reason: "Other", count: 1 }])).toBe("There were 4 late check-ins. The most common recorded reason was \"Traffic / Commute\" (3 of 4, 75%).");
  });

  it("uses the same late-arrival categories for report data and recommendations", () => {
    expect(lateArrivalCategory("Heavy traffic")).toBe("Traffic / Commute");
    expect(lateArrivalCategory("Academic schedule conflict")).toBe("Class / Academic Conflict");
    expect(lateArrivalCategory(undefined)).toBe("Other");
  });
});
