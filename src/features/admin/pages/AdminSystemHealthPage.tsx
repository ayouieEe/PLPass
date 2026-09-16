import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { repositories } from "@/services/repositories";
import type { FailedNotificationJob, SystemHealthIssue, SystemHealthSnapshot } from "@/services/contracts";
import { hasCapability } from "@/lib/auth/permissions";

const statusStyles = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-800",
  degraded: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-red-200 bg-red-50 text-red-800",
  not_configured: "border-slate-200 bg-slate-50 text-slate-700"
} as const;

function IssueList({ issues, emptyLabel }: { issues: SystemHealthIssue[]; emptyLabel: string }) {
  if (!issues.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return <div className="space-y-2">{issues.map((issue) => <div key={issue.id} className="rounded-xl border border-border bg-background p-3"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" /><div><p className="text-sm font-medium">{issue.message}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(issue.createdAt).toLocaleString()}</p></div></div></div>)}</div>;
}

function formatNotificationError(rawError: string) {
  const sendGridMatch = rawError.match(/SendGrid API error (\d+):\s*(\{[\s\S]*\})$/i);
  if (!sendGridMatch) return { summary: rawError, guidance: null };

  try {
    const payload = JSON.parse(sendGridMatch[2]) as { errors?: Array<{ message?: string }> };
    const providerMessage = payload.errors?.[0]?.message?.trim();
    if (providerMessage) {
      const guidance = /verified Sender Identity/i.test(providerMessage)
        ? "Verify the configured sender address or domain in SendGrid, then retry the job."
        : "Review the provider configuration before retrying the job.";
      return { summary: `SendGrid rejected the email (HTTP ${sendGridMatch[1]}). ${providerMessage}`, guidance };
    }
  } catch {
    // Keep the original error visible when a provider response is not valid JSON.
  }

  return { summary: `SendGrid rejected the email (HTTP ${sendGridMatch[1]}).`, guidance: "Review the SendGrid configuration before retrying the job." };
}

export function AdminSystemHealthPage() {
  const { session } = useDevelopmentSession();
  const [snapshot, setSnapshot] = useState<SystemHealthSnapshot | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const actorUserId = session?.userId;
  const actorRole = session?.role;
  const canRunConsistencyCheck = actorRole ? hasCapability(actorRole, "system.data_check.run") : false;
  const canRetryJobs = actorRole ? hasCapability(actorRole, "system.jobs.retry") : false;
  const canRecoverSessions = actorRole ? hasCapability(actorRole, "attendance.session.recover") : false;

  const loadSnapshot = useCallback(async () => {
    if (!actorUserId || !actorRole) return;
    setLoading(true);
    setMessage(null);
    try {
      setSnapshot(await repositories.systemHealth.getHealthSnapshot({ actorUserId, actorRole }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "System health could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [actorRole, actorUserId]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  async function runAction(action: string, operation: () => Promise<unknown>, successMessage: string, reloadSnapshot = true) {
    if (!reason.trim()) {
      setMessage("Enter a reason before running a system recovery action.");
      return;
    }
    setWorking(action);
    setMessage(null);
    try {
      await operation();
      setReason("");
      setMessage(successMessage);
      if (reloadSnapshot) await loadSnapshot();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The system action could not be completed.");
    } finally {
      setWorking(null);
    }
  }

  if (!session) return null;
  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow="Administration" title="System Health" description="Inspect service availability and recover supported operational failures safely." actions={<button type="button" onClick={() => void loadSnapshot()} className="inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"><RefreshCw className="mr-2 h-4 w-4" />Refresh checks</button>} />
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><label htmlFor="health-action-reason" className="block text-sm font-semibold">Reason for recovery actions<input id="health-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this operational action is needed" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><p className="mt-2 text-xs text-muted-foreground">Retries and session recovery are validated, state-aware, and recorded in the audit log.</p></section>
    {message ? <div role="alert" className="rounded-xl border border-border bg-surface p-3 text-sm">{message}</div> : null}
    {loading ? <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">Loading system health…</div> : snapshot ? <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{snapshot.checks.map((check) => <div key={check.key} className={`rounded-2xl border p-4 ${statusStyles[check.status]}`}><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{check.label}</p>{check.status === "healthy" ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <Activity className="h-5 w-5" aria-hidden="true" />}</div><p className="mt-2 text-xs">{check.message}</p></div>)}</section>
      <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold">Email processing</h2><p className="mt-2 text-sm text-muted-foreground">Last successful email delivery: {snapshot.lastSuccessfulEmailAt ? new Date(snapshot.lastSuccessfulEmailAt).toLocaleString() : "No successful delivery recorded."}</p></section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h2 className="font-semibold">Recent application errors</h2></div><div className="mt-4"><IssueList issues={snapshot.recentErrors} emptyLabel="No recent application errors." /></div></section>
        <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /><h2 className="font-semibold">Data consistency</h2></div><div className="mt-4"><IssueList issues={snapshot.consistencyIssues} emptyLabel="No consistency issues detected yet." /></div>{canRunConsistencyCheck ? <button type="button" className="mt-4 inline-flex items-center rounded-xl border border-border px-3 py-2 text-sm font-semibold" onClick={() => void runAction("consistency", async () => { const issues = await repositories.systemHealth.runDataConsistencyCheck({ actorUserId: session.userId, actorRole: session.role }); setSnapshot((current) => current ? { ...current, consistencyIssues: issues } : current); }, "Data consistency check completed.", false)} disabled={working !== null}><Wrench className="mr-2 h-4 w-4" />Run consistency check</button> : null}</section>
      </div>
      <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold">Failed notification or email jobs</h2><div className="mt-4 space-y-3">{snapshot.failedNotifications.length ? snapshot.failedNotifications.map((job: FailedNotificationJob) => { const error = formatNotificationError(job.lastError); return <div key={`${job.source}-${job.id}`} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-background p-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{job.subject}</p><p className="mt-1 text-xs text-muted-foreground">{job.channel} · {job.recipient}</p><p className="mt-2 text-sm text-red-700">{error.summary}</p>{error.guidance ? <p className="mt-1 text-xs text-muted-foreground">Next step: {error.guidance}</p> : null}</div>{canRetryJobs ? <button type="button" className="inline-flex items-center rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => void runAction(job.id, () => repositories.systemHealth.retryFailedNotification({ jobId: job.id, source: job.source, reason }, { actorUserId: session.userId, actorRole: session.role }), "Notification retry completed.")} disabled={working !== null}><RotateCcw className="mr-2 h-4 w-4" />{working === job.id ? "Retrying…" : "Retry"}</button> : null}</div>; }) : <p className="text-sm text-muted-foreground">No failed notification or email jobs.</p>}</div></section>
      <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold">Stuck attendance sessions</h2><div className="mt-4 space-y-3">{snapshot.stuckSessions.length ? snapshot.stuckSessions.map((sessionItem) => <div key={sessionItem.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4"><div><p className="text-sm font-medium">{sessionItem.title}</p><p className="mt-1 text-xs text-muted-foreground">Active since {new Date(sessionItem.startsAt).toLocaleString()}</p></div>{canRecoverSessions ? <button type="button" className="inline-flex items-center rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => void runAction(sessionItem.id, () => repositories.systemHealth.recoverAttendanceSession({ sessionId: sessionItem.id, reason }, { actorUserId: session.userId, actorRole: session.role }), "Attendance session recovered.")} disabled={working !== null}><Wrench className="mr-2 h-4 w-4" />{working === sessionItem.id ? "Recovering…" : "Recover session"}</button> : null}</div>) : <p className="text-sm text-muted-foreground">No stuck attendance sessions.</p>}</div></section>
    </> : null}
  </div>;
}
