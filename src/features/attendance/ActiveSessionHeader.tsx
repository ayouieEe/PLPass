import { Clock, Nfc } from "lucide-react";
import { StatusBadge } from "@/components/feedback/StatusBadge";

type ActiveSessionHeaderProps = {
  title: string;
  venue: string;
  startedAt: string;
  statusLabel: string;
};

export function ActiveSessionHeader({ title, venue, startedAt, statusLabel }: ActiveSessionHeaderProps) {
  return (
    <section className="rounded-lg border bg-surface p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-brand-green-primary">
            <Nfc className="h-4 w-4" aria-hidden="true" />
            Active NFC session
          </div>
          <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{venue}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {startedAt}
          </div>
          <StatusBadge label={statusLabel} tone="success" />
        </div>
      </div>
    </section>
  );
}
