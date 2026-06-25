import type { ReactNode } from "react";

type StateMessageProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function StateMessage({ title, description, action }: StateMessageProps) {
  return (
    <section className="rounded-lg border bg-surface p-6 text-foreground shadow-sm">
      <div className="max-w-2xl space-y-3">
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        {description ? <p className="text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {action ? <div>{action}</div> : null}
      </div>
    </section>
  );
}
