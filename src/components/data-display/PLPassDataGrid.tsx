import { useCallback, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
  type ModelUpdatedEvent
} from "ag-grid-community";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Columns3, Search } from "lucide-react";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { plpassDataGridClassName, plpassDefaultColumnDef } from "@/components/data-display/plpassDataGridTheme";
import type { PLPassDataGridProps } from "@/components/data-display/plpassDataGridTypes";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const DEFAULT_PAGE_SIZE = 10;

function readAccessorValue(row: unknown, accessorKey: string) {
  return accessorKey.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, row);
}

function isLegacyColumn<TData extends object>(column: unknown): column is ColumnDef<TData, unknown> & {
  accessorKey?: string;
  cell?: (context: { row: { original: TData }; getValue: () => unknown }) => unknown;
} {
  return Boolean(
    column &&
      typeof column === "object" &&
      ("accessorKey" in column || ("cell" in column && !("cellRenderer" in column)))
  );
}

function legacyColumnId<TData extends object>(column: ColumnDef<TData, unknown> & { accessorKey?: string }, index: number) {
  return ("id" in column && typeof column.id === "string" ? column.id : undefined) ?? column.accessorKey ?? `column-${index}`;
}

function legacyHeader<TData extends object>(column: ColumnDef<TData, unknown>, fallback: string) {
  return typeof column.header === "string" ? column.header : fallback;
}

function normalizeColumn<TData extends object>(column: PLPassDataGridProps<TData>["columns"][number], index: number): ColDef<TData> {
  if (!isLegacyColumn<TData>(column)) {
    return column as ColDef<TData>;
  }

  const id = legacyColumnId(column, index);
  const colDef: ColDef<TData> = {
    colId: id,
    field: column.accessorKey as ColDef<TData>["field"],
    headerName: legacyHeader(column, id),
    valueGetter: column.accessorKey ? ({ data }) => readAccessorValue(data, column.accessorKey ?? "") : undefined,
    cellRenderer: column.cell
      ? (params: ICellRendererParams<TData>) => column.cell?.({ row: { original: params.data as TData }, getValue: () => params.value })
      : undefined
  };

  return colDef;
}

function normalizePaginationControls(root: HTMLDivElement | null) {
  if (!root) return;

  const controls = [
    { selector: ".ag-icon-first", label: "First page" },
    { selector: ".ag-icon-previous", label: "Previous page" },
    { selector: ".ag-icon-next", label: "Next page" },
    { selector: ".ag-icon-last", label: "Last page" }
  ];

  controls.forEach(({ selector, label }) => {
    root.querySelectorAll(selector).forEach((icon) => {
      const button = icon.closest<HTMLElement>(".ag-paging-button");
      if (!button) return;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    });
  });
}

function pageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const start = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

export function PLPassDataGrid<TData extends object>({
  data,
  columns,
  label,
  emptyTitle = "No records found",
  emptyDescription,
  errorTitle = "Unable to load records",
  errorMessage = "Refresh the page or try again later.",
  isLoading = false,
  isError = false,
  enableQuickFilter = false,
  enableColumnVisibility = false,
  rowSelection,
  height,
  toolbarActions,
  hideHeader = false
}: PLPassDataGridProps<TData>) {
  const gridShellRef = useRef<HTMLDivElement>(null);
  const gridApiRef = useRef<GridApi<TData> | null>(null);
  const [quickFilterText, setQuickFilterText] = useState("");
  const [hiddenColumnIds, setHiddenColumnIds] = useState<string[]>([]);
  const [displayedRowCount, setDisplayedRowCount] = useState(data.length);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(data.length ? Math.ceil(data.length / DEFAULT_PAGE_SIZE) : 0);
  const hasRows = displayedRowCount > 0;
  const firstRow = hasRows ? currentPage * DEFAULT_PAGE_SIZE + 1 : 0;
  const lastRow = hasRows ? Math.min(displayedRowCount, (currentPage + 1) * DEFAULT_PAGE_SIZE) : 0;
  const visiblePageNumbers = pageNumbers(currentPage, totalPages);

  const columnDefs = useMemo<ColDef<TData>[]>(() => {
    return columns.map((inputColumn, index) => {
      const column = normalizeColumn(inputColumn, index);
      const columnId = column.colId ?? column.field ?? `column-${index}`;
      return {
        ...column,
        colId: columnId,
        hide: hiddenColumnIds.includes(columnId)
      };
    });
  }, [columns, hiddenColumnIds]);

  const NoRowsOverlay = useMemo(
    () =>
      function PLPassNoRowsOverlay() {
        return (
          <div className="plpass-grid-empty-overlay" role="status" aria-live="polite">
            <h3 className="text-sm font-semibold text-foreground">{emptyTitle}</h3>
            {emptyDescription ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{emptyDescription}</p> : null}
          </div>
        );
      },
    [emptyDescription, emptyTitle]
  );

  const updateDisplayedRowCount = useCallback((api: GridApi<TData>) => {
    const nextDisplayedRowCount = api.getDisplayedRowCount();
    const nextTotalPages = nextDisplayedRowCount ? Math.max(1, api.paginationGetTotalPages()) : 0;
    const nextCurrentPage = nextTotalPages ? Math.min(api.paginationGetCurrentPage(), nextTotalPages - 1) : 0;
    setDisplayedRowCount(nextDisplayedRowCount);
    setTotalPages(nextTotalPages);
    setCurrentPage(nextCurrentPage);
    if (nextDisplayedRowCount === 0) {
      api.showNoRowsOverlay();
    } else {
      api.hideOverlay();
    }
    window.requestAnimationFrame(() => normalizePaginationControls(gridShellRef.current));
  }, []);

  const handleGridReady = useCallback(
    (event: GridReadyEvent<TData>) => {
      gridApiRef.current = event.api;
      updateDisplayedRowCount(event.api);
    },
    [updateDisplayedRowCount]
  );

  const handleModelUpdated = useCallback(
    (event: ModelUpdatedEvent<TData>) => {
      updateDisplayedRowCount(event.api);
    },
    [updateDisplayedRowCount]
  );

  const handlePaginationChanged = useCallback(() => {
    const api = gridApiRef.current;
    if (api) {
      const nextDisplayedRowCount = api.getDisplayedRowCount();
      const nextTotalPages = nextDisplayedRowCount ? Math.max(1, api.paginationGetTotalPages()) : 0;
      setDisplayedRowCount(nextDisplayedRowCount);
      setTotalPages(nextTotalPages);
      setCurrentPage(nextTotalPages ? Math.min(api.paginationGetCurrentPage(), nextTotalPages - 1) : 0);
    }
    window.requestAnimationFrame(() => normalizePaginationControls(gridShellRef.current));
  }, []);

  const goToPage = useCallback((page: number) => {
    gridApiRef.current?.paginationGoToPage(page);
  }, []);

  if (isLoading) {
    return <LoadingState label={`Loading ${label}`} />;
  }

  if (isError) {
    return <ErrorState title={errorTitle} message={errorMessage} />;
  }

  return (
    <section
      className={cn("plpass-data-grid-shell rounded-2xl border border-border bg-surface shadow-sm", hideHeader ? "p-4" : "p-6")}
      aria-label={label}
    >
      {!hideHeader ? (
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="h-9 w-1 rounded-full bg-primary" aria-hidden="true" />
            <p className="min-w-0 truncate text-lg font-bold text-foreground">{label}</p>
            <span className="rounded-full border bg-surface-muted px-3.5 py-1.5 font-mono text-xs text-muted-foreground">
              {hasRows ? `${firstRow}-${lastRow} of ${displayedRowCount}` : "0 records"}
            </span>
          </div>
          {toolbarActions ? <div className="flex flex-wrap items-center gap-2">{toolbarActions}</div> : null}
        </div>
      ) : null}
      {(enableQuickFilter || enableColumnVisibility) ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {enableQuickFilter ? (
            <label className="relative block min-w-0 flex-1 sm:max-w-sm">
              <span className="sr-only">Search {label}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                value={quickFilterText}
                onChange={(event) => setQuickFilterText(event.target.value)}
                placeholder="Search records"
                className="plpass-field h-12 w-full rounded-xl border pl-10 pr-3 text-sm outline-none"
              />
            </label>
          ) : <span />}
          <div className="flex flex-wrap items-center gap-2">
            {enableColumnVisibility ? (
              <details className="relative">
                <summary className="list-none">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <span>
                      <Columns3 className="h-4 w-4" aria-hidden="true" />
                      Columns
                    </span>
                  </Button>
                </summary>
                <div className="absolute right-0 z-20 mt-2 max-h-72 w-60 overflow-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg">
                  {columnDefs.map((column) => {
                    const columnId = column.colId ?? column.field;
                    if (!columnId) return null;
                    return (
                      <label key={columnId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted">
                        <input
                          type="checkbox"
                          checked={!hiddenColumnIds.includes(columnId)}
                          onChange={(event) => {
                            setHiddenColumnIds((current) =>
                              event.target.checked ? current.filter((id) => id !== columnId) : [...current, columnId]
                            );
                          }}
                        />
                        <span>{String(column.headerName ?? columnId)}</span>
                      </label>
                    );
                  })}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        ref={gridShellRef}
        className={cn(plpassDataGridClassName, "w-full overflow-x-auto", !hasRows && "plpass-data-grid-empty")}
        style={{ height: height ?? "auto" }}
      >
        <AgGridReact<TData>
          key={hasRows ? "plpass-grid-with-pagination" : "plpass-grid-without-pagination"}
          rowData={data}
          columnDefs={columnDefs}
          defaultColDef={plpassDefaultColumnDef}
          domLayout={height ? "normal" : "autoHeight"}
          pagination={hasRows}
          suppressPaginationPanel
          paginationPageSize={DEFAULT_PAGE_SIZE}
          quickFilterText={quickFilterText}
          rowSelection={rowSelection}
          rowHeight={52}
          headerHeight={44}
          noRowsOverlayComponent={NoRowsOverlay}
          theme="legacy"
          suppressCellFocus={false}
          suppressColumnVirtualisation
          ensureDomOrder
          animateRows={false}
          onGridReady={handleGridReady}
          onModelUpdated={handleModelUpdated}
          onPaginationChanged={handlePaginationChanged}
        />
      </div>
      {hasRows ? (
        <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-sm text-muted-foreground">Page {currentPage + 1} of {totalPages}</p>
          <nav className="flex items-center gap-2" aria-label={`${label} pagination`}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-lg"
              disabled={currentPage === 0}
              aria-label="Previous page"
              onClick={() => goToPage(Math.max(0, currentPage - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            {visiblePageNumbers.map((page) => (
              <Button
                key={page}
                type="button"
                variant={page === currentPage ? "default" : "outline"}
                className="h-10 w-10 rounded-lg px-0 font-mono"
                aria-current={page === currentPage ? "page" : undefined}
                aria-label={`Page ${page + 1}`}
                onClick={() => goToPage(page)}
              >
                {page + 1}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-lg"
              disabled={currentPage >= totalPages - 1}
              aria-label="Next page"
              onClick={() => goToPage(Math.min(totalPages - 1, currentPage + 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </nav>
        </div>
      ) : (
        <div className="mt-4 border-t border-border pt-4 font-mono text-sm text-muted-foreground">0 records</div>
      )}
    </section>
  );
}
