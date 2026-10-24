export type SentimentCounts = {
  positive: number;
  neutral: number;
  negative: number;
};

type ActionableRecommendationInput = {
  attendanceRate?: number | null;
  objective?: { label: string; averageRating: number; responseCount?: number; relatedComments?: string[] };
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
  const displayedObjectiveRating = input.objective == null ? null : Number(input.objective.averageRating.toFixed(1));
  if (input.objective && displayedObjectiveRating != null && displayedObjectiveRating < 7) {
    const rating = input.objective.averageRating.toFixed(1);
    const responses = input.objective.responseCount == null
      ? ""
      : ` from ${input.objective.responseCount} response${input.objective.responseCount === 1 ? "" : "s"}`;
    const objectiveText = input.objective.label.toLowerCase();
    const commentThemes = feedbackThemes(input.objective.relatedComments ?? []);
    const evidence = commentThemes.length > 0
      ? ` Related comments most often mention ${commentThemes.join(", ")}.`
      : input.objective.relatedComments?.length
        ? ` Review the ${input.objective.relatedComments.length} related written comment${input.objective.relatedComments.length === 1 ? "" : "s"} for the specific cause.`
        : "";
    const confidence = input.objective.responseCount != null && input.objective.responseCount < 3
      ? " Treat this as an early signal because the response count is small."
      : "";
    const isRepeatAttendanceObjective = /\b(attend|attendance|return|future|similar event|again|recommend)\b/.test(objectiveText)
      && /\b(likely|likelihood|would|plan|recommend|future|again|return|attend)\b/.test(objectiveText);
    if (isRepeatAttendanceObjective) {
      if (input.objective.averageRating <= 3) {
        return `Investigate why interest in attending a similar event was low. The rating was ${rating} out of 9${responses}, suggesting the respondent was unlikely to return. Review the event's content, timing, venue, and overall experience before planning the next event.${evidence}${confidence}`;
      }
      return `Improve the next event's appeal and ask what would encourage participants to return. The future-attendance rating was ${rating} out of 9${responses}, indicating mixed interest in attending a similar event.${evidence}${confidence}`;
    }
    if (input.objective.averageRating <= 3) {
      return `Prioritize the aspect measured by "${input.objective.label}". Its average rating is ${rating} out of 9${responses}, which is a strong signal that the event did not meet that expectation. Review the available feedback, identify the specific barrier, and make one targeted improvement before the next event.${evidence}${confidence}`;
    }
    return `Improve the aspect measured by "${input.objective.label}" before the next event. Its average rating is ${rating} out of 9${responses}, indicating a mixed result. Use the available feedback to identify the specific weakness and make one targeted improvement.${evidence}${confidence}`;
  }
  if (input.attendanceRate != null && input.attendanceRate < 70) {
    return `Improve turnout by sending invitations earlier and confirming attendance before the next event. Recorded attendance averaged ${Math.round(input.attendanceRate)}%.`;
  }
  if (input.lateArrival && input.lateArrival.total > 0 && input.lateArrival.count / input.lateArrival.total >= 0.25) {
    const share = Math.round((input.lateArrival.count / input.lateArrival.total) * 100);
    return `Plan around the most common late-arrival pattern: "${input.lateArrival.reason}" accounts for ${input.lateArrival.count} of ${input.lateArrival.total} late check-ins (${share}%). Send an earlier arrival reminder and allow extra travel time.`;
  }
  if (input.negativeFeedback && input.negativeFeedback.total > 0 && input.negativeFeedback.count / input.negativeFeedback.total >= 0.2) {
    const share = Math.round((input.negativeFeedback.count / input.negativeFeedback.total) * 100);
    return `Review the responses labelled negative before the next event. They represent ${share}% of ${input.negativeFeedback.total} labelled feedback responses.`;
  }
  return undefined;
}

function feedbackThemes(comments: string[]) {
  const text = comments.join(" ").toLowerCase();
  const signals = [
    { terms: ["time", "schedule", "late", "duration", "wait"], label: "timing or waiting time" },
    { terms: ["venue", "room", "location", "space", "sound", "audio"], label: "venue or event setup" },
    { terms: ["food", "taste", "meal", "serving", "portion"], label: "food or serving quality" },
    { terms: ["topic", "content", "relevant", "useful", "speaker", "activity"], label: "content or relevance" },
    { terms: ["clear", "confusing", "rubric", "criteria", "instruction", "explain"], label: "clarity or evaluation criteria" },
    { terms: ["announce", "invitation", "information", "communication", "reminder"], label: "communication" }
  ];
  return signals.filter((signal) => signal.terms.some((term) => text.includes(term))).map((signal) => signal.label);
}

export function attendanceTrendSummary(rates: number[]) {
  if (rates.length === 0) return "No recorded attendance data is available.";
  const average = Math.round(rates.reduce((total, rate) => total + rate, 0) / rates.length);
  const lowest = Math.min(...rates);
  const highest = Math.max(...rates);
  if (rates.length === 1) return `Recorded attendance was ${rates[0]}% for the completed event.`;
  const change = rates[rates.length - 1] - rates[0];
  const direction = change === 0 ? "stayed the same" : change > 0 ? `increased by ${change} percentage points` : `decreased by ${Math.abs(change)} percentage points`;
  return `Recorded attendance averaged ${average}% across ${rates.length} completed events, ranged from ${lowest}% to ${highest}%, and ${direction} from the first to the latest event.`;
}

export function feedbackLabelSummary(counts: SentimentCounts) {
  const total = counts.positive + counts.neutral + counts.negative;
  if (total === 0) return "No labelled feedback is available.";
  const share = (count: number) => `${count} (${Math.round((count / total) * 100)}%)`;
  return `Of ${total} labelled feedback response${total === 1 ? "" : "s"}, ${share(counts.positive)} were positive, ${share(counts.neutral)} neutral, and ${share(counts.negative)} negative. These labels show the reported sentiment, but they do not explain the reason without reading the comments.`;
}

export function lateArrivalSummary(rows: Array<{ reason: string; count: number }>) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return "No late arrivals were recorded.";
  const top = rows.reduce((current, row) => !current || row.count > current.count ? row : current, undefined as { reason: string; count: number } | undefined);
  if (!top) return "No late arrivals were recorded.";
  return `There were ${total} late check-in${total === 1 ? "" : "s"}. The most common recorded reason was "${top.reason}" (${top.count} of ${total}, ${Math.round((top.count / total) * 100)}%).`;
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
