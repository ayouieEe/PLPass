import type { ReactNode } from "react";
import { Activity } from "lucide-react";

type AuthLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <main className="plpass-auth-scene relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-8">
      <div className="plpass-auth-grid" aria-hidden="true" />
      <div className="plpass-auth-ribbons" aria-hidden="true" />
      <div className="plpass-auth-ambient" aria-hidden="true" />
      <section className="relative z-10 w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-primary/20">
            <Activity className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="mt-4 text-2xl font-semibold text-foreground">PLPass</p>
          <p className="mt-1 text-sm text-muted-foreground">Event attendance workspace</p>
        </div>
        <div className="plpass-auth-card rounded-2xl border border-border/80 bg-surface/95 p-6 backdrop-blur md:p-7">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
            {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
