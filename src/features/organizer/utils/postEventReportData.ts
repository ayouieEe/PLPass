export type SentimentCounts = {
  positive: number;
  neutral: number;
  negative: number;
};

type ActionableRecommendationInput = {
  attendanceRate?: number | null;
  objective?: { label: string; averageRating: number };
  negativeFeedback?: { count: number; total: number };
  lateArrival?: { reason: string; count: number; total: number };
};

export function lateArrivalCategory(reason: string | null | undefined) {
  const normalized = reason?.toLowerCase() ?? "";
  if (normalized.includes("traffic") || normalized.includes("commute")) return "Traffic / Commute";
  if (normalized.includes("class") || normalized.includes("academic")) return "Class / Academic Conflict";
  if (normalized.includes("personal") || normalized.includes("health")) return "Personal / Health";
  if (normalized.includes("weather") || normalized.includes("force")) return "Weather / Force Majeure";
  return "Other";
}

/** Returns the most direct action supported by the recorded result. */
export function actionableRecommendation(input: ActionableRecommendationInput): string | undefined {
  if (input.objective && input.objective.averageRating < 7) {
    return `Explain "${input.objective.label}" more clearly and show one practice example. Rating: ${input.objective.averageRating.toFixed(1)} out of 9.`;
  }
  if (input.attendanceRate != null && input.attendanceRate < 70) {
    return `Send invitations earlier and confirm attendance before the next event. Recorded attendance: ${Math.round(input.attendanceRate)}%.`;
  }
  if (input.lateArrival && input.lateArrival.total > 0 && input.lateArrival.count / input.lateArrival.total >= 0.25) {
    return `Send an earlier arrival reminder. "${input.lateArrival.reason}" was selected for ${input.lateArrival.count} of ${input.lateArrival.total} late check-ins.`;
  }
  if (input.negativeFeedback && input.negativeFeedback.total > 0 && input.negativeFeedback.count / input.negativeFeedback.total >= 0.2) {
    const share = Math.round((input.negativeFeedback.count / input.negativeFeedback.total) * 100);
    return `Review the anonymous comments before the next event. ${share}% of labelled feedback was negative.`;
  }
  return undefined;
}

export function emptyReportRows(message: string) {
  return [{ Status: message }];
}

export function sentimentReportRows(counts: SentimentCounts) {
  const labelledFeedback = counts.positive + counts.neutral + counts.negative;
  if (labelledFeedback === 0) return emptyReportRows("No labelled feedback received.");

  return (["positive", "neutral", "negative"] as const).map((label) => ({
    "Feedback label": label[0].toUpperCase() + label.slice(1),
    Responses: counts[label],
    Share: `${Math.round((counts[label] / labelledFeedback) * 100)}%`,
    "Labelled feedback": labelledFeedback
  }));
}

export function lateArrivalReportRows(rows: Array<{ reason: string; count: number }>) {
  const totalLate = rows.reduce((total, row) => total + row.count, 0);
  if (totalLate === 0) return emptyReportRows("No late arrivals recorded.");

  return rows.map((row) => ({
    "Late-arrival reason": row.reason,
    "Late arrivals": row.count,
    "Share of late arrivals": `${Math.round((row.count / totalLate) * 100)}%`
  }));
}

export function objectiveResultReportRows(rows: Array<{ eventCode?: string; objective: string; averageRating: number | null; responseCount: number }>) {
  const ratedObjectives = rows.filter((row) => row.averageRating != null && row.responseCount > 0);
  if (ratedObjectives.length === 0) return emptyReportRows("No objective ratings received.");

  return ratedObjectives.map((row) => ({
    ...(row.eventCode ? { "Event Code": row.eventCode } : {}),
    Objective: row.objective,
    "Average rating (out of 9)": row.averageRating?.toFixed(1) ?? "",
    Responses: row.responseCount
  }));
}
