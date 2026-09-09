import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Filter, Search } from "lucide-react";
import { toast } from "sonner";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAuditLogs } from "@/hooks/useRepositoryQueries";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import type { AuditLog } from "@/types/domain";
import { exportTabularReport } from "@/features/organizer/utils/exportUtils";

export function OrganizerAuditLogsPage() {
  const [search, setSearch] = useState("");
  const { session } = useDevelopmentSession();
  
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );

  const queryParams = useMemo(() => ({ pageSize: 100, search, sortBy: "created_at", sortDirection: "desc" as const }), [search]);
  const auditLogsQuery = useAuditLogs(queryParams, context);
  const auditLogs = auditLogsQuery.data?.items ?? [];

  function exportAuditLogs() {
    exportTabularReport("Audit Logs", auditLogs.map((log) => ({
      "Date & Time": log.timestamp,
      User: "Organizer 1",
      "Event Type": log.action,
      Change: log.targetType,
      "Target ID": log.targetId ?? "—"
    })));
    toast.success("Audit Logs downloaded.");
  }

  const columns: ColumnDef<AuditLog>[] = [
    {
      id: "timestamp",
      header: "Date & Time",
      accessorFn: (row) => row.timestamp,
      cell: ({ row }) => {
        const date = formatDisplayDate(row.original.timestamp);
        const time = formatDisplayTime(row.original.timestamp);
        return (
    <div className="flex items-center gap-2">
      <h1 className="sr-only">Audit Logs</h1>
            <span className="font-medium text-foreground whitespace-nowrap">{date}</span>
            <span className="text-sm text-muted-foreground whitespace-nowrap">{time}</span>
          </div>
        );
      }
    },
    {
      id: "user",
      header: "User",
      cell: () => {
        return (
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold">
              O
            </div>
            <span className="font-medium">Organizer 1</span>
          </div>
        );
      }
    },
    {
      id: "eventType",
      header: "Event Type",
      cell: ({ row }) => {
        const raw = row.original.action || "";
        const formatted = raw
          .split(/[_-\s]+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
        return <span className="font-medium">{formatted}</span>;
      }
    },
    {
      id: "change",
      header: "Change",
      cell: ({ row }) => {
        const raw = row.original.targetType || "";
        const formatted = raw
          .split(/[_-\s]+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");
        return <span>{formatted}</span>;
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Review system activity and administrative actions.</p>
      </div>

      <section className="space-y-4">
        <div className="rounded-lg border bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" aria-hidden="true" />
                {auditLogs.length} results
              </span>
              <button type="button" onClick={exportAuditLogs} disabled={!auditLogs.length} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Export
              </button>
            </div>
          </div>
          <div className="mt-4">
            <label className="relative block w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input id="audit-log-search" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground" placeholder="Search by action, target type, or target ID..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>
        </div>

        {auditLogsQuery.isPending ? (
          <LoadingState />
        ) : auditLogsQuery.isError ? (
          <ErrorState title="Failed to load audit logs" message={auditLogsQuery.error?.message ?? "An error occurred while loading logs. Please try again."} />
        ) : (
          <PLPassDataGrid
            label="Audit logs"
            data={auditLogs}
            columns={columns}
            emptyTitle="No audit logs found"
            emptyDescription="Audit records matching your criteria will appear here."
            enableColumnVisibility
            hideHeader
          />
        )}
      </section>
    </div>
  );
}
