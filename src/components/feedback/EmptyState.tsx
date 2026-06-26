import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
};

export function EmptyState({ title, description, icon: Icon }: EmptyStateProps) {
  return (
    <div className="plpass-empty-state rounded-lg border p-8 text-center">
      {Icon ? <Icon className="mx-auto mb-3 h-8 w-8 text-brand-green-primary" aria-hidden="true" /> : null}
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm leading-6">{description}</p> : null}
    </div>
  );
}
