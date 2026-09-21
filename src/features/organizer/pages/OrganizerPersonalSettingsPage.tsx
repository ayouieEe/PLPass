import { AlertCircle, Bell, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PreferenceToggle } from "@/components/shared/PreferenceToggle";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useNotificationPreferences } from "@/hooks/useRepositoryQueries";
import { useTheme } from "@/hooks/useTheme";

export function OrganizerPersonalSettingsPage() {
  const { session } = useDevelopmentSession();
  const { theme, setTheme } = useTheme();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const preferences = useNotificationPreferences(context);
  if (!session) return null;

  const preferenceOptions = [
    ["eventUpdates", "Owned event updates", "Approval, reschedule, cancellation, and participant changes."],
    ["attendanceExceptions", "Attendance exceptions", "Session failures and attendance issues requiring attention."],
    ["reports", "Report updates", "Report completion and failure notices."],
    ["reminders", "Workflow reminders", "No-start and other event workflow reminders."]
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader eyebrow="Account" title="Settings" description="Manage your personal workspace and optional updates." />
      <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-muted/30 px-5 py-5 sm:px-7"><div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><Bell className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">Notification preferences</h2><p className="mt-1 text-sm text-muted-foreground">Choose which optional updates deserve your attention. Critical and required alerts always stay on.</p></div></div></div>
        <div className="px-5 py-6 sm:px-7">{preferences.isLoading ? <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground"><span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading your preferences…</div> : preferences.isError ? <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Preferences could not be loaded</p><p className="mt-1">Refresh the page or try again shortly.</p><button type="button" className="mt-3 font-semibold underline" onClick={() => void preferences.refetch()}>Try again</button></div></div> : preferences.data ? <div className="space-y-3">{preferenceOptions.map(([key, label, description]) => <div key={key} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background p-4 transition hover:border-primary/40"><span><span className="block font-medium">{label}</span><span className="mt-1 block max-w-xl text-xs leading-5 text-muted-foreground">{description}</span></span><PreferenceToggle label={`Enable ${label}`} checked={preferences.data[key]} disabled={preferences.updateMutation.isPending} onChange={(checked) => preferences.updateMutation.mutate({ [key]: checked })} /></div>)}</div> : null}</div>
      </section>
      <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><Sun className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">Appearance</h2><p className="mt-1 text-sm text-muted-foreground">Choose the theme that feels most comfortable for your workspace.</p></div></div>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" aria-pressed={theme === "light"} className={`inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${theme === "light" ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border hover:border-primary"}`} onClick={() => setTheme("light")}><Sun className="mr-2 h-4 w-4" />Light</button><button type="button" aria-pressed={theme === "dark"} className={`inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${theme === "dark" ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border hover:border-primary"}`} onClick={() => setTheme("dark")}><Moon className="mr-2 h-4 w-4" />Dark</button></div>
      </section>
    </div>
  );
}
