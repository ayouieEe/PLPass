import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { LoadingState } from "@/components/feedback/LoadingState";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import { Button } from "@/components/ui/button";
import {
  AdminContextBar,
  AdminFrame,
  AdminPageHeader,
  AdminToolbar,
  departmentName,
  formatDateTime,
  formatStatus,
  maskIdentifier,
  statusTone,
  useAdminScope
} from "@/features/admin/components/AdminPage";
import { useAttendanceSessions, useNfcReaders } from "@/hooks/useRepositoryQueries";
import type { NfcReader } from "@/types/domain";

export function NfcReadersPage() {
  const scope = useAdminScope();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const readers = useNfcReaders({ pageSize: 100 }, scope.context);
  const sessions = useAttendanceSessions({ pageSize: 100 }, scope.context);
  const visibleReaders = (readers.data?.items ?? []).filter((reader) =>
    (!scope.department?.id || reader.departmentId === scope.department.id) &&
    (status === "all" || reader.status === status) &&
    [reader.label, reader.location, reader.serialNumber, reader.status].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const columns = useMemo<ColumnDef<NfcReader>[]>(() => [
    { header: "Reader Name", accessorKey: "label" },
    { header: "Device Reference", cell: ({ row }) => maskIdentifier(row.original.serialNumber) },
    { header: "Assigned Room or Venue", accessorKey: "location" },
    { header: "Department", cell: ({ row }) => departmentName(scope.departments, row.original.departmentId) },
    { header: "Device Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    { header: "Last Seen", cell: ({ row }) => formatDateTime(row.original.lastSeenAt) },
    { header: "Last Session Used", cell: () => sessions.data?.items[0]?.title ?? "No session recorded" },
    { header: "View Details", cell: () => <Button type="button" size="sm" variant="outline">View</Button> }
  ], [scope.departments, sessions.data?.items]);

  return (
    <AdminFrame>
      <AdminPageHeader title="NFC Readers" accessibleTitle="NFC readers" description="Device inventory and reader health for assigned Dean scope." />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <AdminToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search readers"
        selectedFilter={status}
        filters={[
          { label: "All", value: "all" },
          { label: "Online", value: "active" },
          { label: "Maintenance", value: "maintenance" },
          { label: "Disabled", value: "inactive" }
        ]}
        onFilterChange={setStatus}
      />
      {scope.isLoading || readers.isLoading ? <LoadingState label="Loading NFC readers" /> : null}
      <PLPassDataGrid label="NFC readers" data={visibleReaders} columns={columns} emptyTitle="No NFC readers found" emptyDescription="No devices match the selected status and department scope." />
    </AdminFrame>
  );
}
