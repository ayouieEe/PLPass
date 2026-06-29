export type ReportHistoryRecord = {
  id: string;
  name: string;
  scope: string;
  generatedAt: string;
  status: "queued" | "ready" | "processing" | "failed";
};

export type ReportPreviewMetric = {
  label: string;
  value: string;
};
