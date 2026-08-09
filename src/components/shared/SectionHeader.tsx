import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type SectionHeaderProps = {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  iconVariant?: "primary" | "muted" | "accent" | "brand";
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bordered?: boolean;
};

export function SectionHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  iconVariant = "primary",
  badge,
  actions,
  className,
  bordered = false
}: SectionHeaderProps) {
  const iconVariantStyles = {
    primary: "bg-primary/10 text-primary border-primary/20",
    muted: "bg-muted text-muted-foreground border-border",
    accent: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    brand: "bg-brand-green-primary/10 text-brand-green-primary border-brand-green-primary/20"
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        bordered && "border-b border-border pb-3 mb-4",
        className
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border shadow-xs transition-colors",
              iconVariantStyles[iconVariant]
            )}
          >
            <Icon className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
        )}
        <div className="space-y-0.5 min-w-0">
          {eyebrow && (
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </span>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            {badge}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
