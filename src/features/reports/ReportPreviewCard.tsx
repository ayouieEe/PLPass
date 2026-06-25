import { FileText } from "lucide-react";
import type { ReportPreviewMetric } from "@/features/reports/types";

type ReportPreviewCardProps = {
  title: string;
  description: string;
  metrics: ReportPreviewMetric[];
};

export function ReportPreviewCard({ title, description, metrics }: ReportPreviewCardProps) {
  return (
    <article className="rounded-lg border bg-surface p-4">
      <div className="flex items-start gap-3">
        <FileText className="mt-1 h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-md bg-highlight p-3 text-highlight-foreground">
            <dt className="text-xs font-medium">{metric.label}</dt>
            <dd className="mt-1 text-lg font-semibold">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
