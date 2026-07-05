import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import type { AttendanceStatus, LiveAttendanceRecord } from "@/features/attendance/types";

// Registering the client-side row model is required once before any AgGridReact renders.
// If MyClassesPage.tsx or ClassDetailsPage.tsx already register this at module load, this
// call is a harmless no-op (ag-grid ignores duplicate registrations).
ModuleRegistry.registerModules([ClientSideRowModelModule]);

type LiveAttendanceListProps = {
  records: LiveAttendanceRecord[];
};

const statusTone: Record<AttendanceStatus, "success" | "warning" | "danger" | "info"> = {
  present: "success",
  late: "warning",
  absent: "danger",
  manual: "info"
};

const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" });

function formatTime(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : timeFormatter.format(date);
}

// Same CSS-variable mapping used elsewhere so this grid matches the app's shadcn/Tailwind theme
// instead of ag-grid's default look.
const gridThemeVars = {
  "--ag-background-color": "hsl(var(--background))",
  "--ag-foreground-color": "hsl(var(--foreground))",
  "--ag-header-background-color": "hsl(var(--muted))",
  "--ag-header-foreground-color": "hsl(var(--muted-foreground))",
  "--ag-border-color": "hsl(var(--border))",
  "--ag-row-border-color": "hsl(var(--border))",
  "--ag-row-hover-color": "hsl(var(--muted) / 0.5)",
  "--ag-selected-row-background-color": "hsl(var(--muted))",
  "--ag-accent-color": "hsl(var(--primary))",
  "--ag-font-family": "inherit",
  "--ag-font-size": "13.5px",
  "--ag-header-font-weight": "600",
  "--ag-border-radius": "0.5rem",
  "--ag-wrapper-border-radius": "0.5rem"
} as React.CSSProperties;

export function LiveAttendanceList({ records }: LiveAttendanceListProps) {
  const columnDefs: ColDef<LiveAttendanceRecord>[] = [
    { field: "studentName", headerName: "Student Name", minWidth: 180, flex: 1, sortable: true, filter: true },
    { field: "identifier", headerName: "ID Number", minWidth: 150, sortable: true, filter: true },
    {
      field: "timeIn",
      headerName: "Time In",
      minWidth: 110,
      sortable: true,
      valueFormatter: (params) => formatTime(params.value)
    },
    {
      field: "timeOut",
      headerName: "Time Out",
      minWidth: 110,
      sortable: true,
      valueFormatter: (params) => formatTime(params.value)
    },
    {
      field: "status",
      headerName: "Status",
      minWidth: 130,
      sortable: true,
      filter: false,
      cellRenderer: (params: ICellRendererParams<LiveAttendanceRecord>) =>
        params.data ? <StatusBadge label={params.data.status} tone={statusTone[params.data.status]} /> : null
    }
  ];

  const defaultColDef: ColDef = { sortable: true, resizable: true, filter: true };

  return (
    <section className="rounded-lg border bg-surface p-3">
      <div className="border-b p-4">
        <h2 className="font-semibold">Live attendance</h2>
      </div>
      <div
        className="ag-theme-quartz mt-3 overflow-hidden rounded-lg border shadow-sm"
        style={{ height: 420, width: "100%", ...gridThemeVars }}
      >
        <AgGridReact<LiveAttendanceRecord>
          theme="legacy"
          rowData={records}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowHeight={48}
          headerHeight={44}
          animateRows
          pagination
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
        />
      </div>
    </section>
  );
}