import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type AuthLayoutProps = {
  title: string;
  description?: string;
  headerAction?: ReactNode;
  wide?: boolean;
  children: ReactNode;
};

export function AuthLayout({ title, description, headerAction, wide = false, children }: AuthLayoutProps) {
  return (
    <main className="plpass-auth-scene relative grid min-h-[100dvh] content-start overflow-x-clip overflow-y-visible bg-background px-4 py-6 sm:place-items-center sm:py-8">
      <div className="plpass-auth-grid" aria-hidden="true" />
      <div className="plpass-auth-ribbons" aria-hidden="true" />
      <div className="plpass-auth-ambient" aria-hidden="true" />
      <section className={`relative z-10 w-full ${wide ? "max-w-3xl" : "max-w-[440px]"} py-2 sm:py-0`}>
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg shadow-primary/20 ring-1 ring-primary/20">
            <img src="/plp-logo.png" alt="PLPass logo" className="h-full w-full object-cover" />
          </div>
          <p className="mt-4 text-2xl font-semibold text-foreground">PLPass</p>
          <p className="mt-1 text-sm text-muted-foreground">Event attendance workspace</p>
        </div>
        <div className="plpass-auth-card rounded-2xl border border-border/80 bg-surface/95 p-5 backdrop-blur sm:p-6 md:p-7">
          {headerAction ? <div className="mb-2">{headerAction}</div> : null}
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
            {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          {children}
        </div>
        <footer className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground hover:underline">Terms of Use</Link>
          <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
        </footer>
      </section>
    </main>
  );
}
