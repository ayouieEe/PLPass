import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex min-h-16 flex-col justify-center gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-green-primary">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 md:pb-0.5">{actions}</div> : null}
    </header>
  );
}

