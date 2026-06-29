import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import type { AttendanceStatus, LiveAttendanceRecord } from "@/features/attendance/types";
import type { ColDef } from "ag-grid-community";

type LiveAttendanceListProps = {
  records: LiveAttendanceRecord[];
};

const statusTone: Record<AttendanceStatus, "success" | "warning" | "danger" | "info"> = {
  present: "success",
  late: "warning",
  absent: "danger",
  manual: "info"
};

export function LiveAttendanceList({ records }: LiveAttendanceListProps) {
  const columns: ColDef<LiveAttendanceRecord>[] = [
    { field: "studentName", headerName: "Student", minWidth: 180 },
    { field: "identifier", headerName: "Identifier", minWidth: 160 },
    {
      field: "status",
      headerName: "Status",
      minWidth: 140,
      cellRenderer: ({ data }: { data?: LiveAttendanceRecord }) =>
        data ? <StatusBadge label={data.status} tone={statusTone[data.status]} /> : null
    },
    { field: "timestamp", headerName: "Time", minWidth: 150 }
  ];

  return (
    <section className="rounded-lg border bg-surface p-3">
      <div className="border-b p-4">
        <h2 className="font-semibold">Live attendance</h2>
      </div>
      <div className="pt-3">
        <PLPassDataGrid
          label="Live attendance records"
          data={records}
          columns={columns}
          emptyTitle="No live attendance records"
          enableQuickFilter={false}
          enableColumnVisibility={false}
        />
      </div>
    </section>
  );
}
