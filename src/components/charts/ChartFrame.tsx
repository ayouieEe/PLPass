import type { ReactNode } from "react";

type ChartFrameProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function ChartFrame({ title, description, children }: ChartFrameProps) {
  return (
    <section className="rounded-lg border bg-surface p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="h-72">{children}</div>
    </section>
  );
}
