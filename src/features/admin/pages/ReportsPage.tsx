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
  UnavailablePanel,
  formatDateTime,
  formatStatus,
  statusTone,
  useAdminScope,
  userName
} from "@/features/admin/components/AdminPage";
import { useReports, useUsers } from "@/hooks/useRepositoryQueries";
import type { Report } from "@/types/domain";

export function ReportsPage() {
  const scope = useAdminScope();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const reports = useReports({ pageSize: 100 }, scope.context);
  const users = useUsers({ pageSize: 100 }, scope.context);
  const filteredReports = (reports.data?.items ?? []).filter((report) =>
    (status === "all" || report.status === status) &&
    [report.title, report.scope, report.status].join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const columns = useMemo<ColumnDef<Report>[]>(() => [
    { header: "Report Name", accessorKey: "title" },
    { header: "Report Type", cell: ({ row }) => row.original.title },
    { header: "Scope", accessorKey: "scope" },
    { header: "Requested By", cell: ({ row }) => userName(users.data?.items ?? [], row.original.requestedByUserId) },
    { header: "Generated At", cell: ({ row }) => formatDateTime(row.original.generatedAt) },
    { header: "Status", cell: ({ row }) => <StatusBadge label={formatStatus(row.original.status)} tone={statusTone(row.original.status)} /> },
    { header: "Download or View", cell: ({ row }) => <Button type="button" size="sm" variant="outline" disabled={row.original.status !== "ready"}>{row.original.status === "ready" ? "View" : "Unavailable"}</Button> }
  ], [users.data?.items]);

  return (
    <AdminFrame>
      <AdminPageHeader
        title="Reports"
        description="Centralized Dean report center for directories, attendance, credentials, events, and analytics history."
        actions={<Button type="button" disabled title="Report generation requires backend support">Generate report</Button>}
      />
      <AdminContextBar department={scope.department} semester={scope.activeSemester} />
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {["Student Directory", "Faculty Directory", "Organizer Directory", "Class Attendance Records", "Event Attendance Records", "Credential Status", "Approved Events", "Analytics and ML Insights"].map((category) => (
          <div key={category} className="rounded-lg border bg-surface p-3 text-sm font-medium">{category}</div>
        ))}
      </section>
      <AdminToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search report history"
        selectedFilter={status}
        filters={[
          { label: "All", value: "all" },
          { label: "Ready", value: "ready" },
          { label: "Processing", value: "processing" },
          { label: "Failed", value: "failed" }
        ]}
        onFilterChange={setStatus}
      />
      <UnavailablePanel title="Report setup controls" message="PDF and XLSX generation are Phase 12 functionality. The UI does not create fake files or browser-only exports." />
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled>Generate PDF</Button>
        <Button type="button" variant="outline" disabled>Generate XLSX</Button>
      </div>
      {scope.isLoading || reports.isLoading || users.isLoading ? <LoadingState label="Loading reports" /> : null}
      <PLPassDataGrid label="Admin report history" data={filteredReports} columns={columns} emptyTitle="No report history found" emptyDescription="No report records match the selected filters." />
    </AdminFrame>
  );
}
