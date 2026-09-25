import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { repositories } from "@/services/repositories";
import type { FailedNotificationJob, SystemHealthIssue, SystemHealthSnapshot } from "@/services/contracts";
import { hasCapability } from "@/lib/auth/permissions";
import { useAdminWorkspaceRefresh } from "@/hooks/useAdminWorkspaceRefresh";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils/date";

const statusStyles = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-800",
  degraded: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-red-200 bg-red-50 text-red-800",
  not_configured: "border-slate-200 bg-slate-50 text-slate-700"
} as const;

const ITEMS_PER_PAGE = 3;

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
}

function PaginationControls({ page, totalItems, onPageChange }: { page: number; totalItems: number; onPageChange: (page: number) => void }) {
  const pageCount = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (pageCount <= 1) return null;

  return <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3"><p className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</p><div className="flex gap-2"><button type="button" className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={() => onPageChange(page - 1)} disabled={page === 0}><ChevronLeft className="mr-1 h-3.5 w-3.5" />Previous</button><button type="button" className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount - 1}>Next<ChevronRight className="ml-1 h-3.5 w-3.5" /></button></div></div>;
}

function IssueList({ issues, emptyLabel, onReview }: { issues: SystemHealthIssue[]; emptyLabel: string; onReview?: (issue: SystemHealthIssue) => void }) {
  if (!issues.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return <div className="space-y-2">{issues.map((issue) => <div key={issue.id} className="rounded-xl border border-border bg-background p-3"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" /><div><p className="text-sm font-medium">{issue.message}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(issue.createdAt)}</p></div></div>{onReview ? <button type="button" className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold" onClick={() => onReview(issue)}>Mark as reviewed</button> : null}</div></div>)}</div>;
}

function formatNotificationError(rawError: string) {
  const providerMatch = rawError.match(/(?:Brevo|SendGrid) API error (\d+):\s*(\{[\s\S]*\})$/i);
  if (!providerMatch) return { summary: rawError, guidance: null };

  try {
    const payload = JSON.parse(providerMatch[2]) as { errors?: Array<{ message?: string }> };
    const providerMessage = payload.errors?.[0]?.message?.trim();
    if (providerMessage) {
      const guidance = /verified Sender Identity/i.test(providerMessage)
        ? "Verify the configured sender address or domain, then retry the job."
        : "Review the provider configuration before retrying the job.";
      return { summary: `The email provider rejected the message (HTTP ${providerMatch[1]}). ${providerMessage}`, guidance };
    }
  } catch {
    // Keep the original error visible when a provider response is not valid JSON.
  }

  return { summary: `The email provider rejected the message (HTTP ${providerMatch[1]}).`, guidance: "Review the email-provider configuration before retrying the job." };
}

export function AdminSystemHealthPage() {
  const { session } = useDevelopmentSession();
  const [snapshot, setSnapshot] = useState<SystemHealthSnapshot | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<{ action: string; title: string; description: string; operation: (reason: string) => Promise<unknown>; successMessage: string } | null>(null);
  const [notificationPage, setNotificationPage] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);
  const [reviewedIssueIds, setReviewedIssueIds] = useState<string[]>([]);
  const actorUserId = session?.userId;
  const actorRole = session?.role;
  const canRunConsistencyCheck = actorRole ? hasCapability(actorRole, "system.data_check.run") : false;
  const canRetryJobs = actorRole ? hasCapability(actorRole, "system.jobs.retry") : false;
  const canReadErrors = actorRole ? hasCapability(actorRole, "system.errors.read") : false;
  const canRefreshWorkspace = actorRole ? hasCapability(actorRole, "system.cache.refresh") : false;
  const workspaceRefresh = useAdminWorkspaceRefresh();

  const loadSnapshot = useCallback(async ({ silent = false }: { silent?: boolean } = {}): Promise<boolean> => {
    if (!actorUserId || !actorRole) return false;
    if (!silent) setLoading(true);
    if (!silent) setMessage(null);
    try {
      setSnapshot(await repositories.systemHealth.getHealthSnapshot({ actorUserId, actorRole }));
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "System health could not be loaded.");
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [actorRole, actorUserId]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  useEffect(() => {
    if (!actorUserId || !actorRole) return;
    let cancelled = false;
    void repositories.auditLogs.listAuditLogs({ pageIndex: 0, pageSize: 200, search: "system.consistency_issue_reviewed" }, { actorUserId, actorRole })
      .then((result) => {
        if (!cancelled) {
          setReviewedIssueIds(result.items
            .map((entry) => typeof entry.metadata.issueId === "string" ? entry.metadata.issueId : entry.targetId)
            .filter((issueId): issueId is string => Boolean(issueId)));
        }
      })
      .catch(() => {
        // Reviewing remains available even if historical audit entries cannot be loaded.
      });
    return () => { cancelled = true; };
  }, [actorRole, actorUserId]);

  useEffect(() => { setNotificationPage(0); setSessionPage(0); }, [snapshot?.failedNotifications.length, snapshot?.stuckSessions.length]);

  async function runAction(
    action: string,
    operation: (reason: string) => Promise<unknown>,
    successMessage: string,
    options: { requiresReason?: boolean; reloadSnapshot?: boolean } = {}
  ) {
    const { requiresReason = true, reloadSnapshot = true } = options;
    if (requiresReason && !reason.trim()) {
      setMessage("Enter a reason before running a system recovery action.");
      toast.error("A reason is required before this action can run.");
      return;
    }
    setWorking(action);
    setMessage(null);
    try {
      await operation(reason.trim());
      setReason("");
      setPendingRecovery(null);
      setMessage(successMessage);
      toast.success(successMessage);
      if (reloadSnapshot && !(await loadSnapshot({ silent: true }))) {
        toast.warning("The action completed, but the latest System Health status could not be refreshed.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "The system action could not be completed.";
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setWorking(null);
    }
  }

  if (!session) return null;
  async function refreshChecks() {
    if (await loadSnapshot()) toast.success("System Health checks refreshed.");
    else toast.error("System Health checks could not be refreshed.");
  }
  async function refreshWorkspace() {
    try {
      await workspaceRefresh.refresh();
      toast.success("Administrator workspace data refreshed.");
    } catch {
      toast.error("Administrator workspace data could not be refreshed.");
    }
  }

  async function markIssueReviewed(issue: SystemHealthIssue) {
    try {
      await repositories.auditLogs.logClientAction({
        action: "system.consistency_issue_reviewed",
        targetType: "consistency_issue",
        targetId: isUuid(issue.referenceId) ? issue.referenceId : undefined,
        metadata: { issueId: issue.id, issueMessage: issue.message, severity: issue.severity, referenceId: issue.referenceId ?? "" }
      }, { actorUserId: session?.userId ?? "", actorRole: session?.role ?? "admin" });
      setReviewedIssueIds((current) => current.includes(issue.id) ? current : [...current, issue.id]);
      setSnapshot((current) => current ? { ...current, consistencyIssues: current.consistencyIssues.filter((entry) => entry.id !== issue.id) } : current);
      toast.success("Consistency issue marked as reviewed and recorded in Audit Logs.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The consistency issue could not be marked as reviewed.");
    }
  }
  const visibleNotifications = snapshot?.failedNotifications.slice(notificationPage * ITEMS_PER_PAGE, (notificationPage + 1) * ITEMS_PER_PAGE) ?? [];
  const visibleSessions = snapshot?.stuckSessions.slice(sessionPage * ITEMS_PER_PAGE, (sessionPage + 1) * ITEMS_PER_PAGE) ?? [];
  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow="Administration" title="System Health" description="Inspect service availability and recover supported operational failures safely." actions={<div className="flex flex-wrap gap-2"><button type="button" onClick={() => void refreshChecks()} className="inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold"><RefreshCw className="mr-2 h-4 w-4" />Refresh checks</button>{canRefreshWorkspace ? <button type="button" onClick={() => void refreshWorkspace()} disabled={workspaceRefresh.isRefreshing} className="inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`mr-2 h-4 w-4 ${workspaceRefresh.isRefreshing ? "animate-spin" : ""}`} />{workspaceRefresh.isRefreshing ? "Refreshing…" : "Refresh workspace data"}</button> : null}</div>} />
    {message ? <div role="alert" className="rounded-xl border border-border bg-surface p-3 text-sm">{message}</div> : null}
    {loading ? <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted-foreground">Loading system health…</div> : snapshot ? <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{snapshot.checks.map((check) => <div key={check.key} className={`rounded-2xl border p-4 ${statusStyles[check.status]}`}><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{check.label}</p>{check.status === "healthy" ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> : <Activity className="h-5 w-5" aria-hidden="true" />}</div><p className="mt-2 text-xs">{check.message}</p></div>)}</section>
      <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold">Email processing</h2><p className="mt-2 text-sm text-muted-foreground">Last successful email delivery: {snapshot.lastSuccessfulEmailAt ? formatDateTime(snapshot.lastSuccessfulEmailAt) : "No successful delivery recorded."}</p></section>
      <div className="grid gap-6 lg:grid-cols-2">
        {canReadErrors ? <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h2 className="font-semibold">Recent application errors</h2></div><div className="mt-4"><IssueList issues={snapshot.recentErrors} emptyLabel="No recent application errors." /></div></section> : null}
        <section className="rounded-2xl border border-border bg-surface p-5"><div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /><h2 className="font-semibold">Data consistency</h2></div><p className="mt-2 text-sm text-muted-foreground">Run a read-only check for duplicate or mismatched records. Mark reviewed items to clear them from this list; the review remains in Audit Logs.</p><div className="mt-4"><IssueList issues={snapshot.consistencyIssues.filter((issue) => !reviewedIssueIds.includes(issue.id))} emptyLabel="No consistency issues detected yet." onReview={(issue) => void markIssueReviewed(issue)} /></div>{canRunConsistencyCheck ? <button type="button" className="mt-4 inline-flex items-center rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void runAction("consistency", async () => { const issues = await repositories.systemHealth.runDataConsistencyCheck({ actorUserId: session.userId, actorRole: session.role }); setSnapshot((current) => current ? { ...current, consistencyIssues: issues.filter((issue) => !reviewedIssueIds.includes(issue.id)) } : current); }, "Data consistency check completed.", { requiresReason: false, reloadSnapshot: false })} disabled={working !== null}><Wrench className="mr-2 h-4 w-4" />{working === "consistency" ? "Checking…" : "Run consistency check"}</button> : null}</section>
      </div>
      <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold">Failed notification or email jobs</h2><div className="mt-4 space-y-3">{snapshot.failedNotifications.length ? visibleNotifications.map((job: FailedNotificationJob) => { const error = formatNotificationError(job.lastError); const canRetryJob = canRetryJobs && job.source === "event_email"; return <div key={`${job.source}-${job.id}`} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-background p-4"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{job.subject}</p><p className="mt-1 text-xs text-muted-foreground">{job.channel} · {job.recipient}</p><p className="mt-2 text-sm text-red-700">{error.summary}</p>{error.guidance ? <p className="mt-1 text-xs text-muted-foreground">Next step: {error.guidance}</p> : null}{job.source === "request_email" ? <p className="mt-1 text-xs text-muted-foreground">Request-update email rows are retained for review and cannot be retried from this screen.</p> : null}</div>{canRetryJob ? <button type="button" className="inline-flex items-center rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => { setReason(""); setPendingRecovery({ action: job.id, title: "Retry notification", description: `Retry delivery for ${job.subject}?`, operation: (actionReason) => repositories.systemHealth.retryFailedNotification({ jobId: job.id, source: job.source, reason: actionReason }, { actorUserId: session.userId, actorRole: session.role }), successMessage: "Notification retry completed." }); }} disabled={working !== null}><RotateCcw className="mr-2 h-4" />{working === job.id ? "Retrying…" : "Retry"}</button> : null}</div>; }) : <p className="text-sm text-muted-foreground">No failed notification or email jobs.</p>}</div><PaginationControls page={notificationPage} totalItems={snapshot.failedNotifications.length} onPageChange={setNotificationPage} /></section>
      <section className="rounded-2xl border border-border bg-surface p-5"><h2 className="font-semibold">Stuck attendance sessions</h2><p className="mt-2 text-sm text-muted-foreground">Monitor sessions that may need organizer attention. Administrators can review operational status but cannot recover or finish organizer events.</p><div className="mt-4 space-y-3">{snapshot.stuckSessions.length ? visibleSessions.map((sessionItem) => <div key={sessionItem.id} className="rounded-xl border border-border bg-background p-4"><p className="text-sm font-medium">{sessionItem.title}</p><p className="mt-1 text-xs text-muted-foreground">Active since {formatDateTime(sessionItem.startsAt)}</p></div>) : <p className="text-sm text-muted-foreground">No stuck attendance sessions.</p>}</div><PaginationControls page={sessionPage} totalItems={snapshot.stuckSessions.length} onPageChange={setSessionPage} /></section>
    </> : null}
    {pendingRecovery ? <div role="dialog" aria-modal="true" aria-labelledby="recovery-dialog-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"><h2 id="recovery-dialog-title" className="text-lg font-semibold">{pendingRecovery.title}</h2><p className="mt-2 text-sm text-muted-foreground">{pendingRecovery.description}</p><label htmlFor="recovery-action-reason" className="mt-4 block text-sm font-semibold">Why are you doing this?<input autoFocus id="recovery-action-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Enter a short reason" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>{message ? <p className="mt-2 text-sm text-red-700">{message}</p> : null}<div className="mt-5 flex justify-end gap-2"><button type="button" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold" onClick={() => { setPendingRecovery(null); setReason(""); setMessage(null); }}>Cancel</button><button type="button" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" onClick={() => void runAction(pendingRecovery.action, pendingRecovery.operation, pendingRecovery.successMessage)} disabled={working !== null}>Confirm {pendingRecovery.title.toLowerCase()}</button></div></div></div> : null}
  </div>;
}
