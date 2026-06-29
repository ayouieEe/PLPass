import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import type { ReportHistoryRecord } from "@/features/reports/types";

const columns: ColumnDef<ReportHistoryRecord>[] = [
  { accessorKey: "name", header: "Report" },
  { accessorKey: "scope", header: "Scope" },
  { accessorKey: "generatedAt", header: "Generated" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      const tone = status === "ready" ? "success" : status === "processing" || status === "queued" ? "warning" : "danger";
      return <StatusBadge label={status} tone={tone} />;
    }
  }
];

type ReportHistoryTableProps = {
  records: ReportHistoryRecord[];
};

export function ReportHistoryTable({ records }: ReportHistoryTableProps) {
  return <PLPassDataGrid label="Report history" data={records} columns={columns} emptyTitle="No report history" />;
}
