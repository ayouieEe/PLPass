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
  height?: number | string;
  toolbarActions?: ReactNode;
};
