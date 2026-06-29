import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { formatDateTime } from "@/lib/utils/date";

type StatusTone = "success" | "warning" | "danger" | "info" | "muted";

export function renderEmptyValue(value: unknown, fallback = "N/A") {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">{fallback}</span>;
  }
  return String(value);
}

export function renderStatusBadge(label: string | undefined, tone: StatusTone = "muted") {
  return <StatusBadge label={label ?? "unknown"} tone={tone} />;
}

export function renderDateValue(value: string | undefined) {
  return value ? formatDateTime(value) : renderEmptyValue(value);
}

export function renderRoleLabel(value: string | undefined) {
  return <span className="capitalize">{renderEmptyValue(value)}</span>;
}

export function renderActionButton(label: string, onClick: () => void, content?: ReactNode) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      {content ?? label}
    </Button>
  );
}
