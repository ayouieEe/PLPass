import { StatusBadge } from "@/components/feedback/StatusBadge";
import type { TapResult } from "@/features/attendance/types";

type LatestTapResultCardProps = {
  result?: TapResult;
};

export function LatestTapResultCard({ result }: LatestTapResultCardProps) {
  if (!result) {
    return (
      <article className="plpass-empty-state rounded-lg border p-4">
        <h2 className="font-semibold text-foreground">Waiting for first tap</h2>
        <p className="mt-1 text-sm">The latest NFC tap result will appear here.</p>
      </article>
    );
  }

  return (
    <article className="rounded-lg border bg-surface p-4" aria-live="polite" aria-label="Latest scan result">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Development Simulation result</p>
          <h2 className="mt-1 font-semibold">{result.studentName ?? result.resultLabel ?? "Scan result"}</h2>
          {result.studentNumber ? <p className="mt-1 text-xs text-muted-foreground">{result.studentNumber}</p> : null}
          <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
          {result.method ? <p className="mt-2 text-xs text-muted-foreground">Method: {result.method}</p> : null}
        </div>
        <StatusBadge label={result.resultLabel ?? result.status} tone={result.status === "present" ? "success" : result.status === "absent" ? "danger" : "warning"} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{result.timestamp}</p>
    </article>
  );
}
