import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import { useAuditLogs } from "@/hooks/useRepositoryQueries";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import type { AuditLog } from "@/types/domain";

export function OrganizerAuditLogsPage() {
  const [search, setSearch] = useState("");
  const { session } = useDevelopmentSession();
  
  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );

  const queryParams = useMemo(() => ({ pageSize: 100, search, sortBy: "created_at", sortDirection: "desc" as const }), [search]);
  const auditLogsQuery = useAuditLogs(queryParams, context);

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
      <PageHeader 
        title="Audit Logs" 
        description="Review all actions performed within the organizer workspace."
      />

      <section className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch">
          <section className="rounded-lg border bg-surface p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Search logs</h2>
                <p className="mt-1 text-sm text-muted-foreground">Filter by action, target type, or target ID.</p>
              </div>
              <div className="flex w-full max-w-md items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  id="audit-log-search"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Search audit logs..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-lg border bg-surface p-4 shadow-sm">
          {auditLogsQuery.isPending ? (
            <LoadingState />
          ) : auditLogsQuery.isError ? (
            <ErrorState title="Failed to load audit logs" message={auditLogsQuery.error?.message ?? "An error occurred while loading logs. Please try again."} />
          ) : (
            <PLPassDataGrid
              label="Audit logs"
              data={auditLogsQuery.data.items}
              columns={columns}
              emptyTitle="No audit logs found"
              emptyDescription="Audit records matching your criteria will appear here."
            />
          )}
        </section>
      </section>
    </div>
  );
}
