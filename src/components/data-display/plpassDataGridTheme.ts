import type { ColDef } from "ag-grid-community";

export const plpassDefaultColumnDef: ColDef = {
  flex: 1,
  minWidth: 140,
  resizable: true,
  sortable: true,
  filter: false,
  wrapHeaderText: true,
  autoHeaderHeight: true
};

export const plpassDataGridClassName = "ag-theme-plpass";
