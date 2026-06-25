export type ReportHistoryRecord = {
  id: string;
  name: string;
  scope: string;
  generatedAt: string;
  status: "ready" | "processing" | "failed";
};

export type ReportPreviewMetric = {
  label: string;
  value: string;
};
