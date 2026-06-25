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
    <article className="rounded-lg border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{result.studentName}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">{result.nfcValue}</p>
        </div>
        <StatusBadge label={result.status} tone={result.status === "present" ? "success" : "warning"} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{result.timestamp}</p>
    </article>
  );
}
