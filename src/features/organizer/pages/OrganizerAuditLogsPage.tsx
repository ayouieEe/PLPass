import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Filter, Search, Eye, Calendar, User as UserIcon, ShieldAlert, Tag, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ModalShell } from "@/components/modals/ModalShell";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAuditLogs,
  useEvents,
  useStudents,
  useAttendanceSessions
} from "@/hooks/useRepositoryQueries";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import type { AuditLog } from "@/types/domain";
import { exportTabularReport } from "@/features/organizer/utils/exportUtils";
import {
  formatAuditAction,
  formatTargetType,
  getAuditTargetInfo,
  filterAuditLogs,
  type AuditLogFilters
} from "../utils/auditLogUtils";

const ACTOR_NAME_MAP: Record<string, { name: string; role: string }> = {
  "user-admin-1": { name: "Admin One", role: "Admin" },
  "user-faculty-1": { name: "Faculty One", role: "Faculty" },
  "user-faculty-2": { name: "Faculty Two", role: "Faculty" },
  "user-organizer-1": { name: "Organizer One", role: "Organizer" },
  "user-organizer-2": { name: "Organizer Two", role: "Organizer" }
};

export function OrganizerAuditLogsPage() {
  const { session } = useDevelopmentSession();

  // Filters state
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<AuditLogFilters["datePreset"]>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [actorUserId, setActorUserId] = useState("all");
  const [actionCategory, setActionCategory] = useState<AuditLogFilters["actionCategory"]>("all");

  // Selected Log for Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role } : undefined),
    [session]
  );

  // Queries
  const queryParams = useMemo(
    () => ({ pageSize: 200, sortBy: "created_at", sortDirection: "desc" as const }),
    []
  );
  const auditLogsQuery = useAuditLogs(queryParams, context);
  const rawLogs = auditLogsQuery.data?.items ?? [];

  // Entity queries for target resolution
  const studentsQuery = useStudents({ pageSize: 200 }, context);
  const eventsQuery = useEvents({ pageSize: 200 }, context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 200 }, context);

  const lookups = useMemo(
    () => ({
      students: studentsQuery.data?.items ?? [],
      events: eventsQuery.data?.items ?? [],
      sessions: sessionsQuery.data?.items ?? []
    }),
    [studentsQuery.data, eventsQuery.data, sessionsQuery.data]
  );

  // Filtered Logs
  const activeFilters: AuditLogFilters = useMemo(
    () => ({
      search,
      datePreset,
      customStartDate,
      customEndDate,
      actorUserId,
      actionCategory
    }),
    [search, datePreset, customStartDate, customEndDate, actorUserId, actionCategory]
  );

  const filteredLogs = useMemo(
    () => filterAuditLogs(rawLogs, activeFilters, lookups),
    [rawLogs, activeFilters, lookups]
  );

  const isFiltered =
    Boolean(search) ||
    datePreset !== "all" ||
    actorUserId !== "all" ||
    actionCategory !== "all";

  function handleClearFilters() {
    setSearch("");
    setDatePreset("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setActorUserId("all");
    setActionCategory("all");
  }

  function getActorInfo(userId: string) {
    if (ACTOR_NAME_MAP[userId]) {
      return ACTOR_NAME_MAP[userId];
    }
    if (session?.userId === userId) {
      return { name: session.displayName || "Organizer", role: session.role };
    }
    return { name: `User ${userId.slice(0, 8)}`, role: "User" };
  }

  function exportAuditLogs() {
    exportTabularReport(
      "Audit Logs",
      filteredLogs.map((log) => {
        const actor = getActorInfo(log.actorUserId);
        const target = getAuditTargetInfo(log, lookups);
        return {
          "Date & Time": `${formatDisplayDate(log.timestamp)} ${formatDisplayTime(log.timestamp)}`,
          "Action": formatAuditAction(log.action),
          "Action Code": log.action,
          "User": actor.name,
          "User Role": actor.role,
          "Target Name": target.name,
          "Target Category": target.badge,
          "Target ID": log.targetId ?? "—"
        };
      })
    );
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
          <div className="flex flex-col justify-center h-full gap-0.5">
            <h1 className="sr-only">Audit Logs</h1>
            <span className="font-semibold text-xs text-foreground whitespace-nowrap leading-tight">{date}</span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap leading-tight">{time}</span>
          </div>
        );
      }
    },
    {
      id: "user",
      header: "User",
      cell: ({ row }) => {
        const actor = getActorInfo(row.original.actorUserId);
        const initials = actor.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
        return (
          <div className="flex items-center gap-2.5 h-full">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0 border border-primary/20 shadow-xs">
              {initials}
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="font-semibold text-xs text-foreground whitespace-nowrap truncate">{actor.name}</span>
              <span className="text-[11px] text-muted-foreground capitalize leading-tight">{actor.role}</span>
            </div>
          </div>
        );
      }
    },
    {
      id: "action",
      header: "Action",
      cell: ({ row }) => {
        const formattedAction = formatAuditAction(row.original.action);
        return (
          <div className="flex items-center h-full">
            <span className="font-bold text-xs text-foreground leading-tight">{formattedAction}</span>
          </div>
        );
      }
    },
    {
      id: "target",
      header: "Affected Entity",
      cell: ({ row }) => {
        const target = getAuditTargetInfo(row.original, lookups);
        return (
          <div className="flex flex-col justify-center gap-1 h-full min-w-0">
            <span className="font-semibold text-xs text-foreground truncate max-w-[240px] leading-tight">{target.name}</span>
            <span className="inline-flex items-center w-fit rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary leading-none">
              {target.badge}
            </span>
          </div>
        );
      }
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        return (
          <div className="flex items-center h-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3 text-xs font-semibold text-foreground hover:border-primary hover:text-primary transition"
              onClick={() => setSelectedLog(row.original)}
            >
              <Eye className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              View details
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Review system activity, credential issuance, and administrative actions.</p>
      </div>

      <section className="space-y-4">
        {/* Search and Filters Bar */}
        <div className="rounded-xl border bg-surface p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" aria-hidden="true" />
                {filteredLogs.length} results
              </span>
              {isFiltered ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear filters
                </Button>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={exportAuditLogs}
              disabled={!filteredLogs.length}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Export
            </Button>
          </div>

          {/* Search Input */}
          <div>
            <label className="relative block w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="audit-log-search"
                className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground"
                placeholder="Search by action, student or event name, user..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          {/* Multi-Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-border/50">
            {/* Date Range Filter */}
            <div className="flex flex-col gap-1">
              <label htmlFor="audit-filter-date" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Date Range
              </label>
              <select
                id="audit-filter-date"
                className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as AuditLogFilters["datePreset"])}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="past_7_days">Past 7 Days</option>
                <option value="past_30_days">Past 30 Days</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            {/* Performer User Filter */}
            <div className="flex flex-col gap-1">
              <label htmlFor="audit-filter-user" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                User / Performer
              </label>
              <select
                id="audit-filter-user"
                className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={actorUserId}
                onChange={(e) => setActorUserId(e.target.value)}
              >
                <option value="all">All Users</option>
                <option value="user-organizer-1">Organizer One</option>
                <option value="user-organizer-2">Organizer Two</option>
                <option value="user-faculty-1">Faculty One</option>
                <option value="user-admin-1">Admin One</option>
              </select>
            </div>

            {/* Action Type Filter */}
            <div className="flex flex-col gap-1">
              <label htmlFor="audit-filter-action" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Action Type
              </label>
              <select
                id="audit-filter-action"
                className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={actionCategory}
                onChange={(e) => setActionCategory(e.target.value as AuditLogFilters["actionCategory"])}
              >
                <option value="all">All Action Types</option>
                <option value="credentials">Credentials (QR / Facial)</option>
                <option value="events">Events</option>
                <option value="attendance">Attendance & Sessions</option>
                <option value="correction">Correction Requests</option>
                <option value="user">User Management</option>
              </select>
            </div>
          </div>

          {/* Custom Date Range Inputs */}
          {datePreset === "custom" ? (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">From:</span>
                <input
                  type="date"
                  className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-primary"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">To:</span>
                <input
                  type="date"
                  className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-primary"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Audit Log Data Table */}
        {auditLogsQuery.isPending ? (
          <LoadingState />
        ) : auditLogsQuery.isError ? (
          <ErrorState
            title="Failed to load audit logs"
            message={auditLogsQuery.error?.message ?? "An error occurred while loading logs. Please try again."}
          />
        ) : (
          <PLPassDataGrid
            label="Audit logs"
            data={filteredLogs}
            columns={columns}
            emptyTitle="No audit logs found"
            emptyDescription="Audit records matching your criteria will appear here."
            enableColumnVisibility
            hideHeader
            rowHeight={64}
          />
        )}
      </section>

      {/* View Details Modal */}
      {selectedLog ? (
        <ModalShell
          open={Boolean(selectedLog)}
          title="Audit Log Details"
          description="Detailed technical information and metadata recorded for this action."
          size="lg"
          onClose={() => setSelectedLog(null)}
          footer={
            <Button type="button" variant="secondary" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          }
        >
          {(() => {
            const actor = getActorInfo(selectedLog.actorUserId);
            const target = getAuditTargetInfo(selectedLog, lookups);
            const formattedAction = formatAuditAction(selectedLog.action);
            const dateStr = formatDisplayDate(selectedLog.timestamp);
            const timeStr = formatDisplayTime(selectedLog.timestamp);

            return (
              <div className="space-y-5 text-sm">
                {/* Header Summary Box */}
                <div className="rounded-xl border bg-surface-muted/30 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-lg text-foreground">{formattedAction}</span>
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {target.badge}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <strong>Logged on:</strong> {dateStr} at {timeStr}
                  </div>
                </div>

                {/* Grid Info Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Actor Details */}
                  <div className="rounded-lg border p-3.5 space-y-2 bg-surface">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <UserIcon className="h-3.5 w-3.5 text-primary" />
                      Performer
                    </h3>
                    <div className="space-y-1 text-xs">
                      <div><strong className="text-muted-foreground">User:</strong> <span className="font-medium text-foreground">{actor.name}</span></div>
                      <div><strong className="text-muted-foreground">Role:</strong> <span className="font-medium text-foreground capitalize">{actor.role}</span></div>
                    </div>
                  </div>

                  {/* Target Entity Details */}
                  <div className="rounded-lg border p-3.5 space-y-2 bg-surface">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-primary" />
                      Affected Target
                    </h3>
                    <div className="space-y-1 text-xs">
                      <div><strong className="text-muted-foreground">Name / Title:</strong> <span className="font-medium text-foreground">{target.name}</span></div>
                      <div><strong className="text-muted-foreground">Category:</strong> <span className="font-medium text-foreground">{target.badge}</span></div>
                    </div>
                  </div>
                </div>

                {/* Metadata Breakdown */}
                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Log Details & Metadata
                    </h3>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-surface-muted/60 border-b">
                          <tr>
                            <th className="p-2.5 font-semibold text-muted-foreground">Detail</th>
                            <th className="p-2.5 font-semibold text-muted-foreground">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {Object.entries(selectedLog.metadata).map(([key, val]) => {
                            // Format camelCase key to Human Title Case
                            const formattedKey = key
                              .replace(/([A-Z])/g, " $1")
                              .replace(/_/g, " ")
                              .replace(/^\w/, (c) => c.toUpperCase());
                            return (
                              <tr key={key} className="hover:bg-surface-muted/20">
                                <td className="p-2.5 text-muted-foreground font-medium">{formattedKey}</td>
                                <td className="p-2.5 font-medium text-foreground">
                                  {typeof val === "object" ? JSON.stringify(val) : String(val)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </ModalShell>
      ) : null}
    </div>
  );
}
