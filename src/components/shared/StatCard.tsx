import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type StatCardTone = "default" | "success" | "warning" | "danger" | "info";

type StatCardProps = {
  title: string;
  value: string;
  description?: string;
  trend?: string;
  icon?: LucideIcon;
  tone?: StatCardTone;
};

const toneClass: Record<StatCardTone, string> = {
  default: "bg-surface",
  success: "plpass-status-success",
  warning: "plpass-status-warning",
  danger: "plpass-status-danger",
  info: "plpass-status-info"
};

export function StatCard({ title, value, description, trend, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <article className={cn("rounded-lg border p-4 shadow-sm", toneClass[tone])}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tracking-normal text-foreground">{value}</p>
        </div>
        {Icon ? <Icon className="h-5 w-5 text-primary" aria-hidden="true" /> : null}
      </div>
      {description || trend ? (
        <div className="mt-3 space-y-1 text-sm">
          {description ? <p className="text-muted-foreground">{description}</p> : null}
          {trend ? <p className="font-medium text-primary">{trend}</p> : null}
        </div>
      ) : null}
    </article>
  );
}
