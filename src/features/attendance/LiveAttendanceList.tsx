import type { ICellRendererParams, ColDef } from "ag-grid-community";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";
import type { AttendanceStatus, LiveAttendanceRecord } from "@/features/attendance/types";

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
    { field: "studentName", headerName: "Student Name", minWidth: 180, flex: 1, sortable: true, filter: true },
    { field: "identifier", headerName: "ID Number", minWidth: 150, sortable: true, filter: true },
    { field: "timestamp", headerName: "Time", minWidth: 130, sortable: true },
    {
      field: "status",
      headerName: "Status",
      minWidth: 130,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams<LiveAttendanceRecord>) =>
        params.data ? <StatusBadge label={params.data.status} tone={statusTone[params.data.status]} /> : null
    }
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