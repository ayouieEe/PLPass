import { describe, expect, it } from "vitest";
import { actionableRecommendation, lateArrivalCategory, lateArrivalReportRows, objectiveResultReportRows, sentimentReportRows } from "@/features/organizer/utils/postEventReportData";

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
      objective: { label: "Apply the session topic", averageRating: 6.2 },
      negativeFeedback: { count: 3, total: 10 },
      lateArrival: { reason: "Traffic / Commute", count: 8, total: 10 }
    })).toBe('Explain "Apply the session topic" more clearly and show one practice example. Rating: 6.2 out of 9.');
    expect(actionableRecommendation({ lateArrival: { reason: "Traffic / Commute", count: 3, total: 4 } }))
      .toBe('Send an earlier arrival reminder. "Traffic / Commute" was selected for 3 of 4 late check-ins.');
    expect(actionableRecommendation({ attendanceRate: 92 })).toBeUndefined();
  });

  it("uses the same late-arrival categories for report data and recommendations", () => {
    expect(lateArrivalCategory("Heavy traffic")).toBe("Traffic / Commute");
    expect(lateArrivalCategory("Academic schedule conflict")).toBe("Class / Academic Conflict");
    expect(lateArrivalCategory(undefined)).toBe("Other");
  });
});
