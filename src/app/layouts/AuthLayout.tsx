import type { ReactNode } from "react";
import { Activity } from "lucide-react";

type AuthLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <section className="w-full max-w-md rounded-lg border bg-surface p-6 shadow-sm">
        <div className="mb-6 space-y-3 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
            {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
