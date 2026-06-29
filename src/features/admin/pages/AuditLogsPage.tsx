import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminToolbar,
  formatDateTime,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useAuditLogs, useUsers } from "@/hooks/useRepositoryQueries";
import type { AuditLog } from "@/types/domain";

function safeDetails(metadata: AuditLog["metadata"]) {
  return Object.entries(metadata)
    .filter(([key]) => !/secret|token|password|hash|uid|biometric/i.test(key))
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ") || "No safe details";
}

export function AuditLogsPage() {
  const scope = useAdminScope();
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("all");
  const logs = useAuditLogs({ pageSize: 100, search }, scope.context);
  const users = useUsers({ pageSize: 100 }, scope.context);
  const visibleLogs = (logs.data?.items ?? []).filter((log) => entityType === "all" || log.targetType === entityType);

  const columns = useMemo<ColumnDef<AuditLog>[]>(() => [
    { header: "Timestamp", cell: ({ row }) => formatDateTime(row.original.timestamp) },
    { header: "Actor", cell: ({ row }) => userName(users.data?.items ?? [], row.original.actorUserId) },
    { header: "Role", cell: ({ row }) => users.data?.items.find((user) => user.id === row.original.actorUserId)?.role ?? "system" },
    { header: "Action", accessorKey: "action" },
    { header: "Entity Type", accessorKey: "targetType" },
    { header: "Entity Reference", accessorKey: "targetId" },
    { header: "Result", cell: () => <StatusBadge label="Recorded" tone="success" /> },
    { header: "Details", cell: ({ row }) => safeDetails(row.original.metadata) }
  ], [users.data?.items]);

  return (
    <AdminFrame>
      <AdminPageHeader title="Audit Logs" accessibleTitle="Audit logs" description="Read-only traceability for safe, human-readable repository actions." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminToolbar
        search={search}
        searchLabel="Filter audit logs"
        searchPlaceholder="Filter audit logs"
        onSearchChange={setSearch}
        selectedFilter={entityType}
        filters={[
          { label: "All entities", value: "all" },
          { label: "Users", value: "user" },
          { label: "Events", value: "event" },
          { label: "Sessions", value: "attendance_session" }
        ]}
        onFilterChange={setEntityType}
      />
      {scope.isLoading || logs.isLoading || users.isLoading ? <LoadingState label="Loading audit logs" /> : null}
      <PLPassDataGrid label="Audit logs" data={visibleLogs} columns={columns} emptyTitle="No audit logs found" emptyDescription="No safe audit entries match the selected filters." />
    </AdminFrame>
  );
}
