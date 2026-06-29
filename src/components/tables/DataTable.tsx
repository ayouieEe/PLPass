import type { ColumnDef } from "@tanstack/react-table";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { PLPassDataGrid } from "@/components/data-display/PLPassDataGrid";

type DataTableProps<TData, TValue> = {
  data: TData[];
  columns: ColumnDef<TData, TValue>[];
  emptyTitle?: string;
  emptyDescription?: string;
  label?: string;
};

function readAccessorValue(row: unknown, accessorKey: string) {
  return accessorKey.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, row);
}

function columnHeader(column: ColumnDef<unknown, unknown>, fallback: string) {
  return typeof column.header === "string" ? column.header : fallback;
}

function legacyColumnId(column: ColumnDef<unknown, unknown>, index: number) {
  const candidate = column as { id?: string; accessorKey?: string };
  return candidate.id ?? candidate.accessorKey ?? `column-${index}`;
}

function toAgGridColumns<TData extends object, TValue>(columns: ColumnDef<TData, TValue>[]): ColDef<TData>[] {
  return columns.map((column, index) => {
    const legacyColumn = column as ColumnDef<unknown, unknown> & {
      accessorKey?: string;
      cell?: (context: { row: { original: TData }; getValue: () => unknown }) => unknown;
    };
    const id = legacyColumnId(legacyColumn, index);

    const colDef: ColDef<TData> = {
      colId: id,
      field: legacyColumn.accessorKey as ColDef<TData>["field"],
      headerName: columnHeader(legacyColumn, id),
      valueGetter: legacyColumn.accessorKey
        ? ({ data }) => readAccessorValue(data, legacyColumn.accessorKey ?? "")
        : undefined,
      cellRenderer: legacyColumn.cell
        ? (params: ICellRendererParams<TData>) => legacyColumn.cell?.({ row: { original: params.data as TData }, getValue: () => params.value })
        : undefined
    };
    return colDef;
  });
}

export function DataTable<TData extends object, TValue>({
  data,
  columns,
  emptyTitle = "No records found",
  emptyDescription,
  label = "Data table"
}: DataTableProps<TData, TValue>) {
  return (
    <PLPassDataGrid
      data={data}
      columns={toAgGridColumns(columns)}
      label={label}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    />
  );
}
