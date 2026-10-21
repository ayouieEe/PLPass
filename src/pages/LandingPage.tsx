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
      title="PLPass for university events"
      description="Attendance tools for students on the web, with organizer and administrator workspaces on desktop."
      headerAction={<Button asChild variant="outline" className="rounded-lg"><Link to={APP_ROUTES.login}>Sign in <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-3 text-primary">
            <MonitorCog className="h-6 w-6" aria-hidden="true" />
            <h3 className="font-semibold text-foreground">Organizer and admin desktop</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Use the desktop app for event management, attendance capture, reports, and administration.</p>
          {desktopDownloadUrl ? (
            <Button asChild className="mt-5 w-full rounded-lg"><a href={desktopDownloadUrl} download><Download className="mr-2 h-4 w-4" aria-hidden="true" />Download desktop app</a></Button>
          ) : (
            <p className="mt-5 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">The desktop installer will appear here once a release is published.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-background p-5">
          <div className="flex items-center gap-3 text-primary">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            <h3 className="font-semibold text-foreground">Already have an account?</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Sign in with your assigned PLPass account. Your role determines which workspace opens.</p>
          <Button asChild variant="outline" className="mt-5 w-full rounded-lg"><Link to={APP_ROUTES.login}>Continue to sign in <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button>
        </section>
      </div>
      <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">Students should use the student web portal. Organizer and administrator accounts use the desktop workspace.</p>
    </AuthLayout>
  );
}
