import type { Event } from "@/types/domain";

export type PredictionOverviewRow = {
  label: string;
  title: string;
  predictedAttend: number;
  predictedMiss: number;
};

/**
 * Forecasts are optional source data. A missing forecast must stay missing;
 * treating null as zero falsely presents an unavailable prediction as 100%
 * predicted non-attendance.
 */
export function buildPredictionOverview(events: Pick<Event, "code" | "title" | "predictedTurnout">[]): PredictionOverviewRow[] {
  return events.flatMap((event) => {
    if (event.predictedTurnout == null) return [];
    return [{
      label: event.code.replace("EVT-2026-", "EVT-"),
      title: event.title,
      predictedAttend: event.predictedTurnout,
      predictedMiss: 100 - event.predictedTurnout
    }];
  });
}
