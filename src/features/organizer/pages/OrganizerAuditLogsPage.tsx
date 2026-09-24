import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Filter, Search, Calendar, User as UserIcon, Tag, RotateCcw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { ModalShell } from "@/components/modals/ModalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import {
  useAuditLogs,
  useEvents,
  useStudents,
  useAttendanceSessions,
  useAcademicCatalog,
  useUsers,
  useOrganizerProfiles,
  useAdminProfiles
} from "@/hooks/useRepositoryQueries";
import { formatDisplayDate, formatDisplayTime } from "@/lib/utils/date";
import { hasCapability } from "@/lib/auth/permissions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuditLog } from "@/types/domain";
import { exportTabularReport } from "@/features/organizer/utils/exportUtils";
import {
  formatAuditAction,
  getAuditTargetInfo,
  getAuditLogDetailItems,
  filterAuditLogs,
  type AuditLogFilters
} from "../utils/auditLogUtils";

const AUDIT_ACTOR_ROLE_OPTIONS = ["admin", "department_admin", "organizer", "student"];
const DEPARTMENT_AUDIT_ACTOR_ROLE_OPTIONS = ["department_admin", "organizer", "student"];

export function OrganizerAuditLogsPage() {
  const { session } = useDevelopmentSession();

  // Filters state
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<AuditLogFilters["datePreset"]>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [actorRole, setActorRole] = useState("all");
  const [actionCategory, setActionCategory] = useState<AuditLogFilters["actionCategory"]>("all");

  // Selected Log for Details Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const context = useMemo(
    () => (session ? { actorUserId: session.userId, actorRole: session.role, departmentId: session.departmentId } : undefined),
    [session]
  );
  const isDepartmentAdmin = session?.role === "department_admin";
  const canExportAudit = session ? hasCapability(session.role, isDepartmentAdmin ? "audit.export.department" : "audit.export") : false;

  // Queries
  const queryParams = useMemo(
    // Keep the centralized audit viewer useful beyond the default first page.
    // AG Grid handles presentation paging after the complete server page loads.
    () => ({ pageSize: 1000, sortBy: "created_at", sortDirection: "desc" as const }),
    []
  );
  const auditLogsQuery = useAuditLogs(queryParams, context);
  const rawLogs = useMemo(
    () => auditLogsQuery.data?.items ?? [],
    [auditLogsQuery.data?.items]
  );

  // Entity queries for target resolution
  const studentsQuery = useStudents({ pageSize: 200 }, context);
  const eventsQuery = useEvents({ pageSize: 200 }, context);
  const sessionsQuery = useAttendanceSessions({ pageSize: 200 }, context);
  const usersQuery = useUsers({ pageSize: 200 }, context);
  const organizersQuery = useOrganizerProfiles({ pageSize: 200 }, context);
  const adminsQuery = useAdminProfiles({ pageSize: 200 }, context);
  const catalog = useAcademicCatalog({ pageSize: 200 }, context);
  const [actorAvatarUrls, setActorAvatarUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const usersWithAvatars = (usersQuery.data?.items ?? []).filter(
      (user): user is typeof user & { avatarUrl: string } => Boolean(user.avatarUrl)
    );
    let cancelled = false;

    if (!usersWithAvatars.length) {
      setActorAvatarUrls({});
      return;
    }

    void Promise.all(usersWithAvatars.map(async (user) => {
      const { avatarUrl } = user;
      if (!avatarUrl.startsWith("profile-avatars:")) return [user.id, avatarUrl] as const;

      const { data, error } = await getSupabaseBrowserClient()
        .storage
        .from("profile-avatars")
        .createSignedUrl(avatarUrl.slice("profile-avatars:".length), 3600);
      return error ? undefined : [user.id, data.signedUrl] as const;
    })).then((avatars) => {
      if (!cancelled) {
        setActorAvatarUrls(Object.fromEntries(avatars.filter((avatar): avatar is readonly [string, string] => Boolean(avatar))));
      }
    }).catch(() => {
      if (!cancelled) setActorAvatarUrls({});
    });

    return () => {
      cancelled = true;
    };
  }, [usersQuery.data?.items]);

  const lookups = useMemo(
    () => ({
      students: studentsQuery.data?.items ?? [],
      events: eventsQuery.data?.items ?? [],
      sessions: sessionsQuery.data?.items ?? [],
      users: usersQuery.data?.items ?? [],
      organizers: organizersQuery.data?.items ?? [],
      admins: adminsQuery.data?.items ?? [],
      departments: catalog.departments.data?.items ?? [],
      programs: catalog.programs.data?.items ?? [],
      sections: catalog.sections.data?.items ?? [],
      categories: catalog.categories.data?.items ?? []
    }),
    [studentsQuery.data?.items, eventsQuery.data?.items, sessionsQuery.data?.items, usersQuery.data?.items, organizersQuery.data?.items, adminsQuery.data?.items, catalog.departments.data?.items, catalog.programs.data?.items, catalog.sections.data?.items, catalog.categories.data?.items]
  );

  // Filtered Logs
  const activeFilters: AuditLogFilters = useMemo(
    () => ({
      search,
      datePreset,
      customStartDate,
      customEndDate,
      actorRole,
      actionCategory
    }),
    [search, datePreset, customStartDate, customEndDate, actorRole, actionCategory]
  );

  const filteredLogs = useMemo(
    () => filterAuditLogs(rawLogs, activeFilters, lookups),
    [rawLogs, activeFilters, lookups]
  );

  const isFiltered =
    Boolean(search) ||
    datePreset !== "all" ||
    Boolean(customStartDate || customEndDate) ||
    actorRole !== "all" ||
    actionCategory !== "all";

  function handleClearFilters() {
    setSearch("");
    setDatePreset("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setActorRole("all");
    setActionCategory("all");
  }

  function getActorInfo(userId: string) {
    const user = usersQuery.data?.items.find((candidate) => candidate.id === userId);
    if (user) {
      const organizer = organizersQuery.data?.items.find((candidate) => candidate.userId === userId);
      const admin = adminsQuery.data?.items.find((candidate) => candidate.userId === userId);
      const student = studentsQuery.data?.items.find((candidate) => candidate.userId === userId);
      return {
        name: user.displayName,
        role: user.role,
        identifier: organizer?.employeeNumber ?? admin?.employeeNumber ?? student?.studentNumber,
        email: user.email,
        avatarUrl: actorAvatarUrls[userId]
      };
    }
    const log = rawLogs.find((entry) => entry.actorUserId === userId && entry.actorDisplayName);
    if (log?.actorDisplayName) {
      return {
        name: log.actorDisplayName,
        role: log.actorRole || "User",
        identifier: log.actorIdentifier,
        email: log.actorEmail
      };
    }
    if (session?.userId === userId) return { name: session.displayName || "Current user", role: session.role };
    return { name: "Deleted account", role: "User", identifier: userId ? `ID ${userId.slice(0, 8)}` : undefined };
  }

  const actorRoleOptions = useMemo(
    () => {
      if (isDepartmentAdmin) return DEPARTMENT_AUDIT_ACTOR_ROLE_OPTIONS;

      const rolesInHistory = rawLogs.map((log) => {
        const currentRole = usersQuery.data?.items.find((user) => user.id === log.actorUserId)?.role;
        return (currentRole ?? log.actorRole ?? "").toLowerCase();
      }).filter(Boolean);
      return [...AUDIT_ACTOR_ROLE_OPTIONS, ...rolesInHistory.filter((role) => !AUDIT_ACTOR_ROLE_OPTIONS.includes(role))];
    },
    [isDepartmentAdmin, rawLogs, usersQuery.data?.items]
  );

  useEffect(() => {
    if (isDepartmentAdmin && !DEPARTMENT_AUDIT_ACTOR_ROLE_OPTIONS.includes(actorRole) && actorRole !== "all") {
      setActorRole("all");
    }
  }, [actorRole, isDepartmentAdmin]);

  function formatRole(role: string) {
    if (role === "admin") return "University Admin";
    return role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  async function exportAuditLogs(format: "xlsx" | "pdf" = "xlsx") {
    await exportTabularReport(
      `Audit Logs ${format.toUpperCase()}`,
      filteredLogs.map((log) => {
        const actor = getActorInfo(log.actorUserId);
        const target = getAuditTargetInfo(log, lookups);
        return {
          "Date & Time": `${formatDisplayDate(log.timestamp)} ${formatDisplayTime(log.timestamp)}`,
          "Action": formatAuditAction(log.action),
          "Action Code": log.action,
          "User": actor.name,
          "User Role": formatRole(actor.role),
          "Target Name": target.name,
          "Target Category": target.badge,
          "Target Reference": target.reference ?? "—",
          "Target ID": log.targetId ?? "—"
        };
      })
    );
    toast.success(`Audit Logs ${format.toUpperCase()} downloaded.`);
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
            <span className="whitespace-nowrap text-sm font-semibold leading-tight text-foreground">{date}</span>
            <span className="whitespace-nowrap text-xs leading-tight text-muted-foreground">{time}</span>
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
              {actor.avatarUrl ? (
                <img src={actor.avatarUrl} alt={`${actor.name}'s profile`} className="h-full w-full rounded-full object-cover" />
              ) : initials}
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <span className="truncate whitespace-nowrap text-sm font-semibold text-foreground">{actor.name}</span>
              <span className="text-xs leading-tight text-muted-foreground">{formatRole(actor.role)}{actor.identifier ? ` · ${actor.identifier}` : ""}</span>
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
            <span className="text-sm font-semibold leading-tight text-foreground">{formattedAction}</span>
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
          <div className="flex h-full min-w-0 items-center gap-2">
            <span className="min-w-0 max-w-[240px] truncate text-sm font-semibold leading-tight text-foreground">{target.name}</span>
            <span className="inline-flex shrink-0 items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-semibold leading-none text-primary">
              {target.badge}
            </span>
          </div>
        );
      }
    },
  ];

  return (
    <div className="space-y-6 font-sans text-sm">
      <PageHeader title="Audit Logs" description={session?.role === "admin" ? "Centralized record of system activity, credential issuance, and administrative actions." : isDepartmentAdmin ? "Review activity related to users, events, and attendance in your department." : "Review activity recorded by your account."} />

      <section className="space-y-4">
        {/* Search and Filters Bar */}
        <div className="rounded-xl border bg-surface p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isFiltered ? (
                <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters} className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <RotateCcw className="h-3 w-3" />
                  Clear filters
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Filter className="h-3 w-3" aria-hidden="true" />
                {filteredLogs.length} results
              </span>
              {canExportAudit ? <Button
                type="button"
                onClick={() => void exportAuditLogs("xlsx")}
                disabled={!filteredLogs.length}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                XLSX
              </Button> : null}
              {canExportAudit ? <Button type="button" onClick={() => void exportAuditLogs("pdf")} disabled={!filteredLogs.length} variant="outline" className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                PDF
              </Button> : null}
            <Button
              type="button"
                variant="outline"
                onClick={() => void auditLogsQuery.refetch()}
                disabled={auditLogsQuery.isFetching}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${auditLogsQuery.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
                Refresh
            </Button>
            </div>
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

            {/* Performer Role Filter */}
            <div className="flex flex-col gap-1">
              <label htmlFor="audit-filter-role" className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                Role
              </label>
              <select
                id="audit-filter-role"
                className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={actorRole}
                onChange={(e) => setActorRole(e.target.value)}
              >
                <option value="all">All Roles</option>
                {actorRoleOptions.map((role) => (
                  <option key={role} value={role}>{formatRole(role)}</option>
                ))}
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
                <option value="system">System & Other</option>
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
            onRowClick={(log) => setSelectedLog(log)}
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
          description="Review who performed this action, what it affected, and the recorded change details."
          size="lg"
          onClose={() => setSelectedLog(null)}
          footer={
            <div className="flex w-full justify-end">
              <Button type="button" variant="secondary" onClick={() => setSelectedLog(null)}>Close</Button>
            </div>
          }
        >
          {(() => {
            const actor = getActorInfo(selectedLog.actorUserId);
            const target = getAuditTargetInfo(selectedLog, lookups);
            const formattedAction = formatAuditAction(selectedLog.action);
            const dateStr = formatDisplayDate(selectedLog.timestamp);
            const timeStr = formatDisplayTime(selectedLog.timestamp);
            const detailItems = getAuditLogDetailItems(selectedLog);

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
                      <div><strong className="text-muted-foreground">Role:</strong> <span className="font-medium text-foreground">{formatRole(actor.role)}</span></div>
                      {actor.identifier ? <div><strong className="text-muted-foreground">ID:</strong> <span className="font-medium text-foreground">{actor.identifier}</span></div> : null}
                      {actor.email ? <div><strong className="text-muted-foreground">Email:</strong> <span className="font-medium text-foreground">{actor.email}</span></div> : null}
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
                      {target.reference ? <div><strong className="text-muted-foreground">Reference:</strong> <span className="font-medium text-foreground">{target.reference}</span></div> : null}
                    </div>
                  </div>
                </div>

                {/* Curated user-facing details; raw metadata is intentionally never rendered. */}
                {detailItems.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Change details
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
                          {detailItems.map(({ label, value }) => {
                            return (
                              <tr key={label} className="hover:bg-surface-muted/20">
                                <td className="p-2.5 text-muted-foreground font-medium">{label}</td>
                                <td className="p-2.5 font-medium text-foreground">
                                  {value}
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
