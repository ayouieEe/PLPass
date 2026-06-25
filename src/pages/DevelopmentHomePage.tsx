import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Database, ShieldCheck, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { APP_ROUTES } from "@/lib/constants/routes";
import { formatDateTime } from "@/lib/utils/date";

const foundationItems = [
  "React + Vite + TypeScript",
  "Tailwind CSS + shadcn/ui conventions",
  "React Router route placeholders",
  "TanStack Query provider",
  "Development session provider"
];

export function DevelopmentHomePage() {
  const { session } = useDevelopmentSession();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-primary">Frontend foundation</p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-normal">PLPass is ready for Phase 0 development.</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            This page confirms the frontend shell is running with providers, routing, theme handling, and placeholder access
            control. Supabase and attendance workflows remain untouched until their planned phases.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to={APP_ROUTES.dashboard}>Open placeholder dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={APP_ROUTES.admin}>Check role route</Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {foundationItems.map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-lg border bg-surface p-4">
              <BadgeCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="text-sm font-medium">{item}</span>
            </div>
          ))}
        </div>
      </section>
      <aside className="rounded-lg border bg-surface p-5">
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Development Session</h2>
            <p className="text-sm text-muted-foreground">Temporary provider for Phase 0 route scaffolding.</p>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{session.displayName}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize">{session.role}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="font-medium">{formatDateTime(new Date())}</dd>
            </div>
          </dl>
          <div className="grid gap-3">
            <StatusLine icon={<Wifi className="h-4 w-4" aria-hidden="true" />} label="NFC" value="Planned primary MVP method" />
            <StatusLine icon={<Database className="h-4 w-4" aria-hidden="true" />} label="Supabase" value="Deferred until Phase 9" />
            <StatusLine icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} label="Auth" value="Placeholder only" />
          </div>
        </div>
      </aside>
    </div>
  );
}

type StatusLineProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function StatusLine({ icon, label, value }: StatusLineProps) {
  return (
    <div className="rounded-md bg-highlight p-3 text-highlight-foreground">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-highlight-foreground/75">{value}</p>
    </div>
  );
}
