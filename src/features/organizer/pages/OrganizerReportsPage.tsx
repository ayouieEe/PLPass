import { useMemo } from "react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useReports } from "@/hooks/useRepositoryQueries";

export function OrganizerReportsPage() {
  const { session } = useDevelopmentSession();
  const context = useMemo(() => session ? { actorUserId: session.userId, actorRole: session.role } : undefined, [session]);
  const reports = useReports({ pageSize: 50 }, context);
  return <div className="space-y-5"><PageHeader title="Reports" description="Review reports generated for your events." />{reports.data?.items.length ? <section className="space-y-2 rounded-lg border bg-surface p-5">{reports.data.items.map((report) => <article key={report.id} className="rounded-md border bg-background px-4 py-3"><p className="font-medium">{report.title}</p><p className="text-sm text-muted-foreground">{report.scope} · {report.status}</p></article>)}</section> : <EmptyState title="No reports found" description="Reports for your events will appear here when available." />}</div>;
}
