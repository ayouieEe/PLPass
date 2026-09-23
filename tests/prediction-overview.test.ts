import { describe, expect, it } from "vitest";
import { buildPredictionOverview } from "@/features/organizer/utils/predictionOverview";

describe("prediction overview", () => {
  it("does not convert missing forecasts into zero attendance", () => {
    expect(buildPredictionOverview([
      { code: "EVT-2026-001", title: "No forecast", predictedTurnout: null }
    ])).toEqual([]);
  });

  it("keeps an actual zero-percent forecast distinct from a missing forecast", () => {
    expect(buildPredictionOverview([
      { code: "EVT-2026-002", title: "Forecast", predictedTurnout: 0 }
    ])).toEqual([{
      label: "EVT-002",
      title: "Forecast",
      predictedAttend: 0,
      predictedMiss: 100
    }]);
  });

  it("keeps saved forecasts and their complementary non-attendance values", () => {
    expect(buildPredictionOverview([
      { code: "EVT-2026-003", title: "Forecast", predictedTurnout: 72 }
    ])).toMatchObject([{ predictedAttend: 72, predictedMiss: 28 }]);
  });
});
