import type { ColDef } from "ag-grid-community";
import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";

export type PLPassDataGridColumn<TData extends object> = ColDef<TData> | ColumnDef<TData, unknown>;

export type PLPassDataGridProps<TData extends object> = {
  data: TData[];
  columns: PLPassDataGridColumn<TData>[];
  label: string;
  emptyTitle?: string;
  emptyDescription?: string;
  errorTitle?: string;
  errorMessage?: string;
  isLoading?: boolean;
  isError?: boolean;
  enableQuickFilter?: boolean;
  enableColumnVisibility?: boolean;
  rowSelection?: "single" | "multiple";
  checkboxSelection?: boolean;
  suppressRowClickSelection?: boolean;
  onSelectionChange?: (selectedRows: TData[]) => void;
  height?: number | string;
  /** Row height in pixels passed to ag-Grid. Defaults to 52. */
  rowHeight?: number;
  /** Header height in pixels passed to ag-Grid. Defaults to 44. */
  headerHeight?: number;
  toolbarActions?: ReactNode;
  hideHeader?: boolean;
};
