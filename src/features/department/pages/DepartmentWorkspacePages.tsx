import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Building2, CheckCircle2, RefreshCw, RotateCcw, Save, Wrench } from "lucide-react";
import { AuthenticationMethodsPage } from "@/features/organizer/pages/AuthenticationMethodsPage";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAttendanceRecords, useDepartmentBranding, useEvents, useStudents } from "@/hooks/useRepositoryQueries";
import { repositories } from "@/services/repositories";
import type { FailedNotificationJob, SystemHealthSnapshot } from "@/services/contracts";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils/date";

function useDepartmentContext() {
  const { session } = useDevelopmentSession();
  return session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined;
}

export function DepartmentBrandingPage() {
  const { session } = useDevelopmentSession();
  const context = useDepartmentContext();
  const branding = useDepartmentBranding(session?.departmentId, context);
  const [displayName, setDisplayName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");

  useEffect(() => {
    if (!branding.data) return;
    setDisplayName(branding.data.displayName ?? "");
    setPrimaryColor(branding.data.primaryColor ?? "");
    setSecondaryColor(branding.data.secondaryColor ?? "");
    setLogo(null);
    setRemoveLogo(false);
  }, [branding.data]);

  useEffect(() => {
    if (!logo) {
      setLogoPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(logo);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const saved = branding.data;
  const hasChanges = Boolean(saved && (
    displayName !== (saved.displayName ?? "") ||
    primaryColor !== (saved.primaryColor ?? "") ||
    secondaryColor !== (saved.secondaryColor ?? "") ||
    Boolean(logo) || removeLogo
  ));
  const selectedLogoUrl = logoPreviewUrl || (!removeLogo ? saved?.logoUrl : undefined);
  const logoInitials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "D";

  function resetChanges() {
    setDisplayName(saved?.displayName ?? "");
    setPrimaryColor(saved?.primaryColor ?? "");
    setSecondaryColor(saved?.secondaryColor ?? "");
    setLogo(null);
    setRemoveLogo(false);
    setLogoError("");
  }

  if (branding.isLoading) return <LoadingState label="Loading department branding…" />;
  if (branding.isError || !saved) return <ErrorState title="Department settings could not be loaded" message="Brand settings are unavailable right now. No settings were changed." />;

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3"><Building2 className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="text-lg font-semibold">Department branding</h2><p className="mt-1 text-sm text-muted-foreground">These values apply to department-scoped presentation and reports. Official department name and code are unchanged.</p></div></div>
      <form className="mt-5 grid gap-5" onSubmit={(event) => { event.preventDefault(); if (!logoError && session?.departmentId) void branding.updateMutation.mutateAsync({ displayName, primaryColor, secondaryColor, logo, removeLogo }); }}>
        <label className="text-sm font-medium">Display name<input required maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Used as the department’s presentation name; it does not change the official catalog name.</span></label>
        <div className="grid gap-4 sm:grid-cols-2">{[{ label: "Primary color", value: primaryColor, fallback: "#3f7a44", set: setPrimaryColor }, { label: "Secondary color", value: secondaryColor, fallback: "#e8f1e6", set: setSecondaryColor }].map((color) => <label key={color.label} className="text-sm font-medium">{color.label}<div className="mt-1 flex h-11 items-center gap-2 rounded-xl border border-border bg-background p-1.5"><input aria-label={`${color.label} picker`} type="color" value={color.value || color.fallback} onChange={(event) => color.set(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0" /><input aria-label={`${color.label} hex value`} value={color.value || color.fallback} onChange={(event) => color.set(event.target.value)} pattern="^#[0-9A-Fa-f]{6}$" title="Enter a six-digit hex color, such as #3f7a44" className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 font-mono text-sm" /></div></label>)}</div>
        <label className="text-sm font-medium">Department logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)) { setLogoError("Choose a JPG, PNG, or WebP image up to 2 MB."); setLogo(null); event.target.value = ""; return; } setLogoError(""); setLogo(file); setRemoveLogo(false); }} className="mt-1 block w-full rounded-xl border border-border bg-background p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5" /><span className="mt-1 block text-xs font-normal text-muted-foreground">JPG, PNG, or WebP · maximum 2 MB</span></label>
        {logoError ? <p role="alert" className="-mt-3 text-sm text-destructive">{logoError}</p> : null}
        {saved.logoPath ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"><div className="flex items-center gap-3">{selectedLogoUrl ? <img src={selectedLogoUrl} alt="Department logo preview" className="h-12 w-12 rounded-lg border object-contain" /> : <div className="grid h-12 w-12 place-items-center rounded-lg bg-muted text-sm font-semibold">{logoInitials}</div>}<div><p className="text-sm font-medium">{logo ? "New logo selected" : removeLogo ? "Logo will be removed" : "Current department logo"}</p><p className="text-xs text-muted-foreground">{logo ? logo.name : "Visible in department-scoped presentation"}</p></div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removeLogo} disabled={Boolean(logo)} onChange={(event) => setRemoveLogo(event.target.checked)} />Remove logo</label></div> : logo ? <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><img src={logoPreviewUrl} alt="New department logo preview" className="h-12 w-12 rounded-lg border object-contain" /><span className="text-sm">Preview: {logo.name}</span><button type="button" className="ml-auto text-sm text-muted-foreground underline" onClick={() => setLogo(null)}>Remove selection</button></div> : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4"><Button type="submit" disabled={branding.updateMutation.isPending || !session?.departmentId || !hasChanges || Boolean(logoError)}><Save className="mr-2 h-4 w-4" />{branding.updateMutation.isPending ? "Saving…" : "Save branding"}</Button><Button type="button" variant="outline" onClick={resetChanges} disabled={!hasChanges || branding.updateMutation.isPending}>Discard changes</Button><span className="text-xs text-muted-foreground">{hasChanges ? "Unsaved changes" : saved.updatedAt ? `Last saved ${formatDateTime(saved.updatedAt)}` : "No unsaved changes"}</span></div>
      </form>
    </section>
    <aside className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm" aria-label="Live department branding preview"><div className="border-b border-border p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live preview</p><h2 className="mt-1 text-lg font-semibold">Department presentation</h2><p className="mt-1 text-sm text-muted-foreground">Preview updates as you edit; save to apply it.</p></div><div className="p-5" style={{ backgroundColor: secondaryColor || "#e8f1e6" }}><div className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/80 p-4"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-black/10 bg-white">{selectedLogoUrl ? <img src={selectedLogoUrl} alt="" className="h-full w-full object-contain" /> : <span className="text-sm font-bold" style={{ color: primaryColor || "#3f7a44" }}>{logoInitials}</span>}</div><div className="min-w-0"><p className="truncate font-semibold" style={{ color: primaryColor || "#3f7a44" }}>{displayName || "Department name"}</p><p className="text-xs text-muted-foreground">Department workspace</p></div></div><div className="mt-3 h-2 rounded-full" style={{ backgroundColor: primaryColor || "#3f7a44" }} /><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg border border-black/10 bg-white/80 p-3"><span className="block h-2 w-12 rounded" style={{ backgroundColor: primaryColor || "#3f7a44" }} /><span className="mt-2 block h-2 w-16 rounded bg-black/10" /></div><div className="rounded-lg border border-black/10 bg-white/80 p-3"><span className="block h-2 w-12 rounded" style={{ backgroundColor: primaryColor || "#3f7a44" }} /><span className="mt-2 block h-2 w-16 rounded bg-black/10" /></div></div></div></section>
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-semibold">What these settings affect</h2><p className="mt-2 text-sm text-muted-foreground">Only the department’s display branding is changed. Official department records, user access, event rules, authentication policy, and university-wide settings are not modified here.</p></section>
    </aside>
  </div>;
}

export function DepartmentAuthenticationMethodsPage() {
  return <AuthenticationMethodsPage />;
}

export function DepartmentSystemHealthPage() {
  const { session } = useDevelopmentSession();
  const context = useDepartmentContext();
  const events = useEvents({ pageIndex: 0, pageSize: 25, sortBy: "starts_at", sortDirection: "desc" }, context);
  const attendance = useAttendanceRecords({ pageIndex: 0, pageSize: 100, sortBy: "recorded_at", sortDirection: "desc" }, context);
  const students = useStudents({ pageIndex: 0, pageSize: 1 }, context);
  const [snapshot, setSnapshot] = useState<SystemHealthSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState("");
  const [reason, setReason] = useState("");
  const [pendingAction, setPendingAction] = useState<{ id: string; title: string; description: string; run: (reason: string) => Promise<unknown> } | null>(null);
  const [working, setWorking] = useState(false);
  const loading = events.isLoading || attendance.isLoading || students.isLoading;
  const checks = [
    { label: "Department data", healthy: !events.isError && !students.isError, detail: events.isError || students.isError ? "Department records could not be loaded." : "Department-scoped records are responding." },
    { label: "Event visibility", healthy: !events.isError, detail: events.isError ? "Events are temporarily unavailable." : `${events.data?.total ?? 0} department event(s) are visible.` },
    { label: "Attendance visibility", healthy: !attendance.isError, detail: attendance.isError ? "Attendance records are temporarily unavailable." : `${attendance.data?.total ?? 0} recent attendance record(s) are visible.` }
  ];
  const loadHealth = useCallback(async (silent = false) => {
    if (!session) return;
    if (!silent) setHealthLoading(true);
    setHealthError("");
    try {
      setSnapshot(await repositories.systemHealth.getHealthSnapshot({ actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId }));
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : "Department health data could not be loaded.");
      if (silent) toast.warning("The action completed, but System Health could not refresh.");
    } finally {
      if (!silent) setHealthLoading(false);
    }
  }, [session]);
  useEffect(() => { void loadHealth(); }, [loadHealth]);

  async function refresh() {
    await Promise.all([events.refetch(), attendance.refetch(), students.refetch(), loadHealth()]);
  }

  async function confirmAction() {
    if (!pendingAction || reason.trim().length < 5 || !session) return;
    setWorking(true);
    try {
      await pendingAction.run(reason.trim());
      toast.success(pendingAction.title === "Retry failed email" ? "Email job queued for retry." : "Stuck session recovered; attendance records were preserved.");
      setPendingAction(null);
      setReason("");
      await loadHealth(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The department health action could not be completed.");
    } finally {
      setWorking(false);
    }
  }
  function canRetryJob(job: FailedNotificationJob) {
    const createdAt = new Date(job.updatedAt).getTime();
    const lastAttemptAt = job.lastAttemptAt ? new Date(job.lastAttemptAt).getTime() : 0;
    const now = Date.now();
    return job.source === "event_email" && job.status === "failed" && job.notificationType === "participant_added"
      && Number.isFinite(createdAt) && createdAt >= now - 24 * 60 * 60_000
      && (!lastAttemptAt || lastAttemptAt <= now - 15 * 60_000);
  }
  return <div className="space-y-6"><PageHeader title="System Health" description="Check department data, failed event emails, and stale attendance sessions." actions={<button type="button" onClick={() => void refresh()} disabled={healthLoading || events.isFetching || attendance.isFetching || students.isFetching} className="inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`mr-2 h-4 w-4 ${healthLoading || events.isFetching || attendance.isFetching || students.isFetching ? "animate-spin" : ""}`} />Refresh checks</button>} />
    {healthError ? <ErrorState title="Department health could not be loaded" message={healthError} /> : null}
    {loading || healthLoading ? <LoadingState label="Loading department health…" /> : <>
      <section className="grid gap-4 md:grid-cols-3">{checks.map((check) => <div key={check.label} className={`rounded-2xl border p-5 ${check.healthy ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{check.label}</h2>{check.healthy ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 text-amber-700" />}</div><p className="mt-3 text-sm text-muted-foreground">{check.detail}</p></div>)}</section>
      <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /><h2 className="font-semibold">Department scope</h2></div><p className="mt-2 text-sm text-muted-foreground">Email jobs and stuck sessions shown here belong to events assigned to your department. Retry is limited to recent failed participant-invitation emails. Session recovery is allowed only 30 minutes after scheduled end and does not add or alter attendance records.</p></section>
      <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold">Failed event email jobs</h2><p className="mt-1 text-sm text-muted-foreground">Request emails and other departments’ jobs are not visible here.</p><div className="mt-4 space-y-3">{snapshot?.failedNotifications.length ? snapshot.failedNotifications.map((job: FailedNotificationJob) => <div key={job.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-background p-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{job.subject}</p><p className="mt-1 text-xs text-muted-foreground">{job.recipient} · {formatDateTime(job.updatedAt)}</p><p className="mt-2 break-words text-sm text-red-700">{job.lastError}</p><p className="mt-1 text-xs text-muted-foreground">Only failed participant invitations from the last 24 hours and outside the 15-minute cooldown are retryable.</p></div>{canRetryJob(job) ? <button type="button" className="inline-flex items-center rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => { setReason(""); setPendingAction({ id: job.id, title: "Retry failed email", description: `Queue a retry for “${job.subject}”? The database will recheck department scope, job type, age, failure status, and retry cooldown.`, run: (actionReason) => repositories.systemHealth.retryFailedNotification({ jobId: job.id, source: job.source, reason: actionReason }, context) }); }} disabled={working}><RotateCcw className="mr-2 h-4 w-4" />Retry email</button> : <span className="text-xs text-muted-foreground">Not eligible for retry</span>}</div>) : <p className="text-sm text-muted-foreground">No failed event email jobs for this department.</p>}</div></section>
      <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /><h2 className="font-semibold">Stuck attendance sessions</h2></div><p className="mt-1 text-sm text-muted-foreground">Only ongoing department sessions more than 30 minutes past scheduled end are listed. Recovery closes the session; existing attendance history is preserved.</p><div className="mt-4 space-y-3">{snapshot?.stuckSessions.length ? snapshot.stuckSessions.map((sessionItem) => <div key={sessionItem.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4"><div><p className="text-sm font-medium">{sessionItem.title}</p><p className="mt-1 text-xs text-muted-foreground">Scheduled end {formatDateTime(sessionItem.endsAt ?? sessionItem.startsAt)}</p></div><button type="button" className="inline-flex items-center rounded-xl border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 disabled:opacity-50" onClick={() => { setReason(""); setPendingAction({ id: sessionItem.id, title: "Recover stuck session", description: `Close “${sessionItem.title}”? This is restricted to your department and only succeeds if the session is still ongoing and at least 30 minutes past its scheduled end. No attendance records will be created or removed.`, run: (actionReason) => repositories.systemHealth.recoverAttendanceSession({ sessionId: sessionItem.id, reason: actionReason }, context) }); }} disabled={working}>Recover session</button></div>) : <p className="text-sm text-muted-foreground">No stuck attendance sessions for this department.</p>}</div></section>
      <section className="rounded-2xl border border-border bg-surface p-5"><p className="text-sm text-muted-foreground">Last successful department event email: {snapshot?.lastSuccessfulEmailAt ? formatDateTime(snapshot.lastSuccessfulEmailAt) : "No successful department event email recorded."}</p></section>
    </>}
    {pendingAction ? <div role="dialog" aria-modal="true" aria-labelledby="department-health-action-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><section className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-xl"><h2 id="department-health-action-title" className="text-lg font-semibold">{pendingAction.title}</h2><p className="mt-2 text-sm text-muted-foreground">{pendingAction.description}</p><label htmlFor="department-health-reason" className="mt-4 block text-sm font-medium">Reason (at least 5 characters)<textarea id="department-health-reason" autoFocus value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={working}>Cancel</Button><Button type="button" onClick={() => void confirmAction()} disabled={working || reason.trim().length < 5}>{working ? "Working…" : "Confirm"}</Button></div></section></div> : null}
  </div>;
}

export function DepartmentSettingsPage() {
  return <div className="space-y-6"><PageHeader title="Settings" description="Manage presentation settings for your assigned department." /><DepartmentBrandingPage /></div>;
}
