import type { ReactNode } from "react";
import { ChartEmptyState } from "@/components/feedback/ChartEmptyState";

type ChartFrameProps = {
  title: string;
  description?: string;
  summary?: string;
  children: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
};

export function ChartFrame({ title, description, summary, children, empty = false, emptyMessage }: ChartFrameProps) {
  return (
    <section className="rounded-lg border bg-surface p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {summary && !empty ? <p className="sr-only" data-chart-summary>{summary}</p> : null}
      <div className="h-72" aria-hidden={summary && !empty ? "true" : undefined}>{empty ? <ChartEmptyState message={emptyMessage} /> : children}</div>
    </section>
  );
}
