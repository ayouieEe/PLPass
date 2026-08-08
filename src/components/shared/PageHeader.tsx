import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 pb-2 md:flex-row md:items-center md:justify-between">
      <div>
        {eyebrow ? <div className="text-xs font-semibold uppercase tracking-wider text-brand-green-primary">{eyebrow}</div> : null}
        <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

