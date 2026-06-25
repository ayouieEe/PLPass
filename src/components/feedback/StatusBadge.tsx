import { cn } from "@/lib/utils/cn";

type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
};

const toneClass: Record<StatusTone, string> = {
  success: "plpass-status-success",
  warning: "plpass-status-warning",
  danger: "plpass-status-danger",
  info: "plpass-status-info",
  muted: "bg-muted text-muted-foreground"
};

export function StatusBadge({ label, tone = "muted" }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", toneClass[tone])}>
      {label}
    </span>
  );
}
