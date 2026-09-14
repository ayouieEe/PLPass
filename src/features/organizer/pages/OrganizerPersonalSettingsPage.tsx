import { AlertCircle, Bell, CheckCircle2, ImagePlus, Moon, Save, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PreferenceToggle } from "@/components/shared/PreferenceToggle";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useNotificationPreferences, useOrganizerBranding, useOrganizerProfiles } from "@/hooks/useRepositoryQueries";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "sonner";

export function OrganizerPersonalSettingsPage() {
  const { session } = useDevelopmentSession();
  const { theme, setTheme } = useTheme();
  const context = session ? { actorUserId: session.userId, actorRole: session.role } : undefined;
  const preferences = useNotificationPreferences(context);
  const organizerQuery = useOrganizerProfiles({ pageIndex: 0, pageSize: 1 }, context);
  const organizer = organizerQuery.data?.items[0];
  const branding = useOrganizerBranding(organizer?.id, context);
  const [collegeName, setCollegeName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [removeLogo, setRemoveLogo] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);

  useEffect(() => {
    setCollegeName(branding.data?.collegeName ?? organizer?.organizationName ?? "");
    setLogoPreview(branding.data?.collegeLogoUrl ?? "");
  }, [branding.data?.collegeLogoUrl, branding.data?.collegeName, organizer?.organizationName]);
  if (!session) return null;

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error("College logos must be JPG, PNG, or WebP files up to 2 MB.");
      event.currentTarget.value = "";
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setRemoveLogo(false);
    setBrandingSaved(false);
  }

  async function saveBranding() {
    if (!collegeName.trim()) return toast.error("College name is required.");
    try {
      await branding.updateMutation.mutateAsync({ collegeName, logo: logoFile, removeLogo });
      setLogoFile(null);
      setRemoveLogo(false);
      setBrandingSaved(true);
      window.setTimeout(() => setBrandingSaved(false), 3000);
    } catch {
      // The mutation displays the repository error through a toast.
    }
  }

  const preferenceOptions = [
    ["eventUpdates", "Owned event updates", "Approval, reschedule, cancellation, and participant changes."],
    ["attendanceExceptions", "Attendance exceptions", "Session failures and attendance issues requiring attention."],
    ["reports", "Report updates", "Report completion and failure notices."],
    ["reminders", "Workflow reminders", "No-start and other event workflow reminders."]
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader eyebrow="Account" title="Settings" description="Manage your personal workspace, branding, and optional updates." />
      <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border bg-muted/30 px-5 py-5 sm:px-7"><div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-2 text-primary"><ImagePlus className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold">College branding</h2><p className="mt-1 text-sm text-muted-foreground">Customize the identity shown on reports for events you create.</p></div></div></div>
        <div className="space-y-6 px-5 py-6 sm:px-7">
          <label htmlFor="college-name" className="block text-sm font-semibold">College name<span className="ml-1 text-destructive">*</span><input id="college-name" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/10" value={collegeName} onChange={(event) => { setCollegeName(event.target.value); setBrandingSaved(false); }} placeholder="e.g. College of Information Technology" /></label>
          <div className="grid gap-5 rounded-2xl border border-border bg-background p-4 sm:grid-cols-[128px_1fr] sm:items-center sm:p-5">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-primary/40 bg-muted/30">{logoPreview ? <img src={logoPreview} alt="College logo preview" className="h-full w-full object-contain p-2" /> : <span className="px-3 text-center text-xs font-medium text-muted-foreground">Default PLPass logo</span>}</div>
            <div><p className="font-semibold">College logo</p><p className="mt-1 text-sm text-muted-foreground">Used beside the fixed PLP logo in your event reports.</p><div className="mt-4 flex flex-wrap items-center gap-3"><label htmlFor="college-logo" className="inline-flex cursor-pointer items-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold transition hover:border-primary hover:bg-primary/5"><ImagePlus className="mr-2 h-4 w-4" />Choose image<input id="college-logo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleLogoChange} /></label>{logoPreview ? <button type="button" className="inline-flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold text-destructive transition hover:bg-destructive/10" onClick={() => { setLogoFile(null); setLogoPreview(""); setRemoveLogo(true); setBrandingSaved(false); }}><Trash2 className="mr-2 h-4 w-4" />Use default</button> : null}</div><p className="mt-2 text-xs text-muted-foreground">PNG, JPG, or WebP · maximum 2 MB</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><div aria-live="polite" className="text-sm">{brandingSaved ? <span className="inline-flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" />Changes saved</span> : null}</div><button type="button" className="inline-flex items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void saveBranding()} disabled={branding.updateMutation.isPending || !collegeName.trim()}><Save className="mr-2 h-4 w-4" />{branding.updateMutation.isPending ? "Saving…" : "Save changes"}</button></div>
        </div>
      </section>
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
