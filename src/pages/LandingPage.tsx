import { ArrowRight, Download, MonitorCog, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { AuthLayout } from "@/app/layouts/AuthLayout";
import { Button } from "@/components/ui/button";
import { APP_ROUTES } from "@/lib/constants/routes";

function getDesktopDownloadUrl() {
  const value = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL?.trim();
  const configuredValue = value || (import.meta.env.MODE === "student"
    ? "https://github.com/ayouieEe/PLPass/releases/latest/download/PLPass-Setup.exe"
    : undefined);
  if (!configuredValue) return undefined;
  try {
    const url = new URL(configuredValue);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function LandingPage() {
  const desktopDownloadUrl = getDesktopDownloadUrl();

  return (
    <AuthLayout
      wide
      landing
      title="PLPass for university events"
      description="Choose the workspace that matches your role."
    >
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Choose your workspace</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="order-first rounded-2xl border border-primary/25 bg-primary/10 p-5 shadow-sm shadow-primary/5">
          <div className="flex items-center gap-3 text-primary">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            <h3 className="font-semibold text-foreground">Student web portal</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Sign in to view events, attendance, and requests from your browser.</p>
          <Button asChild className="mt-5 w-full rounded-lg"><Link to={APP_ROUTES.login}>Continue to student sign in <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button>
        </section>

        <section className="rounded-2xl border border-border bg-background/75 p-5">
          <div className="flex items-center gap-3 text-primary">
            <MonitorCog className="h-6 w-6" aria-hidden="true" />
            <h3 className="font-semibold text-foreground">Organizer and administrator desktop</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Manage events, capture attendance, run reports, and administer the system.</p>
          {desktopDownloadUrl ? (
            <>
              <Button asChild variant="outline" className="mt-5 w-full rounded-lg"><a href={desktopDownloadUrl} download><Download className="mr-2 h-4 w-4" aria-hidden="true" />Download desktop app</a></Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">Windows installer · latest stable release</p>
            </>
          ) : (
            <p className="mt-5 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">The desktop installer will appear here once a release is published.</p>
          )}
        </section>
      </div>
      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">Students use the browser portal. Organizers and administrators use the Windows desktop workspace.</p>
    </AuthLayout>
  );
}
